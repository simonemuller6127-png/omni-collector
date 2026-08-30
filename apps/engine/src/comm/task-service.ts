import path from "node:path";
import type { OmniMessage } from "@omni/shared-core";
import type { AIProvider } from "@omni/ai";
import { parseBatchSuggestions, parseSuggestions, parseTagPayload } from "@omni/ai";
import {
  AIRepository,
  AccountRepository,
  CollectionRepository,
  CommentRepository,
  ContentGroupRepository,
  FileRepository,
  MigrationManager,
  RuleCenter,
  TagRepository,
  TopicRepository,
  UserRepository,
} from "@omni/database";
import type { CollectionDTO } from "@omni/shared-core";
import { AiQueueRunner } from "../ai/ai-queue-runner.js";
import { ContentGroupService, normalizeEntity } from "../group/content-group-service.js";
import { FileIndexer } from "../fileindex/file-indexer.js";
import { BrowserSessionManager, parseStoredCookies } from "../sync/browser-session.js";
import { runLoginWindow } from "../sync/login-window.js";
import { CookieCipher } from "../crypto/cookie-cipher.js";
import { XiaohongshuAdapter } from "@omni/adapters";
import { SUPPORTED_PLATFORMS, SyncRunner } from "../sync/sync-runner.js";
import type { SyncMode } from "../sync/sync-pipeline.js";
import type { CommHandler } from "./comm-server.js";

const SYNC_MODES: SyncMode[] = ["catalog", "full", "detail"];

export interface TaskServiceOptions {
  dataDir: string;
  migrationsDir: string;
  headless?: boolean;
  /** 由规则/配置创建 AI Provider；未配置时返回 null（AI 任务给出明确错误）。 */
  getProvider?: (rules: RuleCenter) => AIProvider | null;
}

function complete(requestId: string, payload: Record<string, unknown>): OmniMessage {
  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    message_type: "TASK_COMPLETE",
    payload: { ok: true, ...payload },
  };
}

function error(requestId: string, code: string, message: string): OmniMessage {
  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    message_type: "TASK_ERROR",
    payload: { code, message },
  };
}

/**
 * Engine 任务处理器（Phase 4d/5 收尾）：
 * RULE_UPDATE（用户设置开关）、TASK_SYNC（平台同步）、TASK_AI（单条手动 AI）。
 * 依赖可注入，内部测试使用 Fake Provider，不依赖真实 API Key。
 */
export class TaskService {
  private readonly manager: MigrationManager;
  private readonly db: ReturnType<MigrationManager["getDb"]>;
  private readonly rules: RuleCenter;
  private fetchSessions?: BrowserSessionManager;
  private readonly fetchContexts = new Map<string, import('playwright').BrowserContext>();
  private readonly fetchCache = new Map<string, { ts: number; result: Record<string, unknown> }>();

  constructor(private readonly opts: TaskServiceOptions) {
    this.manager = new MigrationManager(
      path.join(opts.dataDir, "OmniCollector.db"),
      opts.migrationsDir,
      path.join(opts.dataDir, "backup"),
    );
    this.manager.migrate();
    this.db = this.manager.getDb();
    this.rules = new RuleCenter(this.db);
  }

  handlers(): Partial<Record<string, CommHandler>> {
    return {
      RULE_UPDATE: (msg) => this.ruleUpdate(msg),
      TASK_SYNC: (msg) => this.sync(msg),
      TASK_COMMENTS: (msg) => this.comments(msg),
      TASK_AI: (msg) => this.ai(msg),
      TASK_GROUP: (msg) => this.group(msg),
      TASK_ORGANIZE: (msg) => this.organize(msg),
      TASK_TAG: (msg) => this.tag(msg),
      TASK_TOPIC: (msg) => this.topic(msg),
      TAG_LIST: (msg) => this.tagList(msg),
      TAG_ALIAS_ADD: (msg) => this.tagAliasAdd(msg),
      TAG_MERGE: (msg) => this.tagMerge(msg),
      TAG_RENAME: (msg) => this.tagRename(msg),
      TOPIC_LIST: (msg) => this.topicList(msg),
      TOPIC_RENAME: (msg) => this.topicRename(msg),
      TASK_PRIORITY: (msg) => this.priority(msg),
      TASK_RATING: (msg) => this.rating(msg),
      TASK_COMMENT_STAR: (msg) => this.commentStar(msg),
      TASK_INDEX: (msg) => this.index(msg),
      TASK_FETCH: (msg) => this.fetchText(msg),
      TASK_CONVERT: (msg) => this.convert(msg),
      TASK_BATCH: (msg) => this.batch(msg),
      TASK_AI_MANUAL: (msg) => this.aiManual(msg),
      TASK_AI_MANUAL_BATCH: (msg) => this.aiManualBatch(msg),
      AI_REVIEW_LIST: (msg) => this.aiReviewList(msg),
      AI_REVIEW_UPDATE: (msg) => this.aiReviewUpdate(msg),
      AI_REVIEW_UNDO: (msg) => this.aiReviewUndo(msg),
      RULE_LIST: (msg) => this.ruleList(msg),
      COOKIE_IMPORT: (msg) => this.cookieImport(msg),
      COOKIE_STATUS: (msg) => this.cookieStatus(msg),
      TASK_LOGIN: (msg) => this.login(msg),
      STATUS_QUERY: (msg) => this.statusQuery(msg),
    };
  }

  async ruleUpdate(msg: OmniMessage): Promise<OmniMessage> {
    const key = String(msg.payload.rule_key ?? "");
    const value = String(msg.payload.rule_value ?? "");
    if (!key) return error(msg.request_id, "RULE_001", "RULE_001: missing rule_key");
    this.rules.set(key, value);
    return complete(msg.request_id, { task: "rule_update", rule_key: key, rule_value: value });
  }

  async sync(msg: OmniMessage): Promise<OmniMessage> {
    const platform = String(msg.payload.platform ?? "");
    const mode = SYNC_MODES.includes(msg.payload.mode as SyncMode) ? (msg.payload.mode as SyncMode) : "full";
    const depth = typeof msg.payload.depth === "number" ? msg.payload.depth : undefined;
    try {
      const runner = new SyncRunner({
        dataDir: this.opts.dataDir,
        migrationsDir: this.opts.migrationsDir,
        headless: this.opts.headless ?? true,
      });
      const report = await runner.run(platform, mode, depth);
      return complete(msg.request_id, { task: "sync", platform, mode, report });
    } catch (err) {
      return error(msg.request_id, "SYNC_002", `SYNC_002: ${(err as Error).message}`);
    }
  }

  /** 评论批量更新：最近 N 天收藏重新抓评论（PRD 12.5）。 */
  async comments(msg: OmniMessage): Promise<OmniMessage> {
    const platform = msg.payload.platform ? String(msg.payload.platform) : undefined;
    const days = typeof msg.payload.days === "number" ? msg.payload.days : undefined;
    try {
      const runner = new SyncRunner({
        dataDir: this.opts.dataDir,
        migrationsDir: this.opts.migrationsDir,
        headless: this.opts.headless ?? true,
      });
      const reports = await runner.refreshComments(platform, days);
      return complete(msg.request_id, { task: "comments", reports });
    } catch (err) {
      return error(msg.request_id, "SYNC_003", `SYNC_003: ${(err as Error).message}`);
    }
  }

  /** 规则中心（PRD 15.4 / SPEC S10）：全量规则 + 最近变更记录。 */
  async ruleList(msg: OmniMessage): Promise<OmniMessage> {
    try {
      return complete(msg.request_id, {
        task: "rule_list",
        rules: this.rules.listAll(),
        changes: this.rules.recentChanges(50),
      });
    } catch (err) {
      return error(msg.request_id, "RULE_002", `RULE_002: ${(err as Error).message}`);
    }
  }

  /** 导入平台 Cookie（Cookie-Editor JSON 或 "k=v; k2=v2"），AES-256-GCM 加密后仅存本地。 */
  async cookieImport(msg: OmniMessage): Promise<OmniMessage> {
    const platform = String(msg.payload.platform ?? "");
    const cookiesJson = String(msg.payload.cookies_json ?? "").trim();
    if (!SUPPORTED_PLATFORMS.includes(platform) || !cookiesJson) {
      return error(msg.request_id, "AUTH_002", "AUTH_002: invalid platform or empty cookies_json");
    }
    try {
      const parsed = parseStoredCookies(cookiesJson, platform);
      if (parsed.length === 0) {
        return error(msg.request_id, "AUTH_002", "AUTH_002: no valid cookies found (need name/value pairs)");
      }
      new CookieCipher(this.opts.dataDir).encryptCookie(platform, cookiesJson);
      const accounts = new AccountRepository(this.db);
      accounts.getOrCreate(platform);
      accounts.setStatus(platform, "active");
      return complete(msg.request_id, { task: "cookie_import", platform, cookie_count: parsed.length });
    } catch (err) {
      return error(msg.request_id, "AUTH_002", `AUTH_002: ${(err as Error).message}`);
    }
  }

  /** 查询平台 Cookie 状态（仅返回是否存在/数量/有效性，不返回明文）。 */
  async cookieStatus(msg: OmniMessage): Promise<OmniMessage> {
    const platform = String(msg.payload.platform ?? "");
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return error(msg.request_id, "AUTH_003", "AUTH_003: invalid platform");
    }
    try {
      const plain = new CookieCipher(this.opts.dataDir).decryptCookie(platform);
      let cookieCount = 0;
      let valid = false;
      if (plain) {
        const parsed = parseStoredCookies(plain, platform);
        cookieCount = parsed.length;
        valid = cookieCount > 0;
      }
      const account = this.db
        .prepare("SELECT status, error_reason FROM platform_accounts WHERE platform = ?")
        .get(platform) as { status: string; error_reason: string | null } | undefined;
      return complete(msg.request_id, {
        task: "cookie_status",
        platform,
        has_cookie: plain !== null,
        cookie_count: cookieCount,
        valid,
        account_status: account?.status ?? "inactive",
        account_error_reason: account?.error_reason ?? null,
      });
    } catch (err) {
      return error(msg.request_id, "AUTH_003", `AUTH_003: ${(err as Error).message}`);
    }
  }

  async ai(msg: OmniMessage): Promise<OmniMessage> {
    const collectionId = String(msg.payload.collection_id ?? "");
    if (!collectionId) return error(msg.request_id, "AI_002", "AI_002: missing collection_id");
    const provider = this.opts.getProvider?.(this.rules) ?? null;
    if (!provider) {
      return error(msg.request_id, "AI_002", "AI_002: 未配置 AI Provider（需要 API Key）");
    }
    try {
      new AIRepository(this.db).enqueue(collectionId, 999);
      const runner = new AiQueueRunner({
        dataDir: this.opts.dataDir,
        migrationsDir: this.opts.migrationsDir,
        provider,
        batchSize: 1,
        force: true,
      });
      const result = await runner.run();
      return complete(msg.request_id, { task: "ai", collection_id: collectionId, result });
    } catch (err) {
      return error(msg.request_id, "AI_003", `AI_003: ${(err as Error).message}`);
    }
  }

  /** 列出待审核的 AI 建议。 */
  async aiReviewList(msg: OmniMessage): Promise<OmniMessage> {
    try {
      const aiRepo = new AIRepository(this.db);
      aiRepo.expireOldPending(30);
      const pending = aiRepo.listPendingSuggestions();
      const collections = new CollectionRepository(this.db);
      return complete(
        msg.request_id,
        {
          task: "ai_review_list",
          suggestions: pending.map((s) => ({
            id: s.id,
            collection_id: s.collection_id,
            collection_title: collections.findById(s.collection_id)?.title ?? undefined,
            suggestion_type: s.suggestion_type,
            payload: s.payload ?? undefined,
            status: s.status,
            created_at: s.created_at,
            reviewed_at: s.reviewed_at,
          })),
        },
      );
    } catch (err) {
      return error(msg.request_id, "AI_004", `AI_004: ${(err as Error).message}`);
    }
  }

  /** 运行 ContentGroup 关联识别，生成 suggested_group 建议。 */
  async group(msg: OmniMessage): Promise<OmniMessage> {
    try {
      const service = new ContentGroupService({
        groups: new ContentGroupRepository(this.db),
        collections: new CollectionRepository(this.db),
        ai: new AIRepository(this.db),
      });
      const candidates = service.autoGroup();
      return complete(
        msg.request_id,
        {
          task: "group",
          candidates: candidates.map((c) => ({ name: c.name, size: c.collectionIds.length, reason: c.reason })),
        },
      );
    } catch (err) {
      return error(msg.request_id, "GROUP_001", `GROUP_001: ${(err as Error).message}`);
    }
  }

  /** 状态查询：scope=collections 返回收藏 DTO 列表（供插件展示 / 生成 Markdown）。 */
  async statusQuery(msg: OmniMessage): Promise<OmniMessage> {
    const scope = String(msg.payload.scope ?? "");
    try {
      if (scope === "collections") {
        const collections = new CollectionRepository(this.db);
        const groups = new ContentGroupRepository(this.db);
        const tagRepo = new TagRepository(this.db);
        const topicRepo = new TopicRepository(this.db);
        const ratings = this.ratingMap();
        const dtos: CollectionDTO[] = collections.listAll(undefined, true).map((c) => {
          const group = groups.groupOfCollection(c.id);
          const tags = tagRepo.listTagsOfCollection(c.id).map((t) => t.name);
          const topics = topicRepo.listTopicsOfCollection(c.id).map((t) => t.name);
          return {
            id: c.id,
            platform: c.platform,
            platformItemId: c.platform_item_id,
            url: c.url,
            title: c.title ?? "",
            author: c.author ?? undefined,
            coverUrl: c.cover_url ?? undefined,
            description: c.description ?? undefined,
            contentType: c.content_type,
            saveType: c.save_type,
            contentStatus: c.content_status,
            syncStatus: c.sync_status,
            organizeStatus: c.organize_status,
            priority: c.priority,
            rating: ratings.get(c.id) ?? null,
            aiStatus: (c.ai_status as CollectionDTO["aiStatus"]) ?? undefined,
            collectedAt: c.collected_at,
            lastSyncedAt: c.last_synced_at ?? undefined,
            groupId: group?.id,
            groupName: group?.name,
            tags,
            topics,
          };
        });
        return complete(msg.request_id, { task: "status_query", scope, collections: dtos });
      }
      if (scope === "groups") {
        const groups = new ContentGroupRepository(this.db);
        return complete(msg.request_id, { task: "status_query", scope, groups: groups.listGroups() });
      }
      if (scope === "platforms") {
        const counts = this.db
          .prepare(
            "SELECT platform, COUNT(*) AS count FROM collections WHERE content_status='active' GROUP BY platform",
          )
          .all() as Array<{ platform: string; count: number }>;
        const accounts = this.db
          .prepare(
            "SELECT platform, status, error_reason, last_sync_at FROM platform_accounts",
          )
          .all() as Array<{ platform: string; status: string; error_reason: string | null; last_sync_at: string | null }>;
        const health = this.db
          .prepare(
            `SELECT h.adapter, h.level, h.detail
             FROM adapter_health h
             JOIN (SELECT adapter, MAX(id) AS mid FROM adapter_health GROUP BY adapter) latest
               ON latest.mid = h.id`,
          )
          .all() as Array<{ adapter: string; level: number; detail: string | null }>;
        const byCount = new Map(counts.map((c) => [c.platform, c.count]));
        const todaySyncs = (platform: string): number =>
          (
            this.db
              .prepare(
                "SELECT COUNT(*) AS n FROM sync_log WHERE adapter = ? AND status='success' AND started_at >= date('now')",
              )
              .get(platform) as { n: number }
          ).n;
        const platforms = ["bilibili", "youtube", "xiaohongshu", "makerworld", "xiaoheihe"].map((platform) => {
          const account = accounts.find((a) => a.platform === platform);
          const healthRow = health.find((h) => h.adapter === platform);
          let level: "green" | "yellow" | "red" = "green";
          let reason = "";
          if (account?.status === "error") {
            level = "red";
            reason = account.error_reason ?? "账号状态异常";
          } else if (healthRow && healthRow.level >= 3) {
            level = "red";
            reason = healthRow.detail ?? "平台健康严重异常";
          } else if (healthRow && healthRow.level >= 1) {
            level = "yellow";
            reason = healthRow.detail ?? "平台存在告警";
          } else if (!account?.last_sync_at) {
            level = "yellow";
            reason = "从未同步";
          } else if (Date.now() - new Date(account.last_sync_at).getTime() > 7 * 24 * 3600 * 1000) {
            level = "yellow";
            reason = "超过 7 天未同步";
          }
          return {
            platform,
            count: byCount.get(platform) ?? 0,
            lastSyncAt: account?.last_sync_at ?? null,
            todaySyncCount: todaySyncs(platform),
            health: { level, reason },
          };
        });
        return complete(msg.request_id, { task: "status_query", scope, platforms });
      }
      if (scope === "collection") {
        const id = String(msg.payload.id ?? "");
        const col = new CollectionRepository(this.db).findById(id);
        if (!col) return error(msg.request_id, "QUERY_001", "QUERY_001: collection not found");
        const collections = new CollectionRepository(this.db);
        const groups = new ContentGroupRepository(this.db);
        const tagRepo = new TagRepository(this.db);
        const topicRepo = new TopicRepository(this.db);
        const comments = new CommentRepository(this.db)
          .getByCollection(id)
          .slice(0, 20)
          .map((c) => ({
            id: c.id,
            author: c.author ?? "",
            content: c.content,
            likeCount: c.like_count,
            starred: c.is_starred === 1,
          }));
        const linkedFiles = (this.db
          .prepare("SELECT file_path FROM local_files WHERE linked_collection_id = ? ORDER BY modified_at DESC")
          .all(id) as Array<{ file_path: string }>).map((f) => f.file_path);
        const group = groups.groupOfCollection(col.id);
        // Related Collections：同分组优先，否则同标题+同作者的跨平台启发式
        let relatedRows = group ? groups.listCollectionsInGroup(group.id).filter((r) => r.id !== col.id) : [];
        if (relatedRows.length === 0) {
          relatedRows = collections
            .listAll()
            .filter(
              (c) =>
                c.id !== col.id &&
                normalizeEntity(c.title ?? "") === normalizeEntity(col.title ?? "") &&
                (c.author ?? "").toLowerCase() === (col.author ?? "").toLowerCase(),
            )
            .slice(0, 10);
        }
        const related = relatedRows.slice(0, 10).map((r) => ({
          id: r.id,
          platform: r.platform,
          title: r.title ?? "",
          saveType: r.save_type,
          contentType: r.content_type,
        }));
        const dto: CollectionDTO = {
          id: col.id,
          platform: col.platform,
          platformItemId: col.platform_item_id,
          url: col.url,
          title: col.title ?? "",
          author: col.author ?? undefined,
          coverUrl: col.cover_url ?? undefined,
          description: col.description ?? undefined,
          contentType: col.content_type,
          saveType: col.save_type,
          contentStatus: col.content_status,
          syncStatus: col.sync_status,
          organizeStatus: col.organize_status,
          priority: col.priority,
          rating: this.ratingMap().get(col.id) ?? null,
          aiStatus: (col.ai_status as CollectionDTO["aiStatus"]) ?? undefined,
          collectedAt: col.collected_at,
          lastSyncedAt: col.last_synced_at ?? undefined,
          groupId: group?.id,
          groupName: group?.name,
          tags: tagRepo.listTagsOfCollection(col.id).map((t) => t.name),
          topics: topicRepo.listTopicsOfCollection(col.id).map((t) => t.name),
          comments,
          linkedFiles,
          related,
        };
        return complete(msg.request_id, { task: "status_query", scope, collection: dto });
      }
      if (scope === "local_files") {
        const rows = this.db
          .prepare(
            `SELECT f.file_path, f.file_name, f.file_type, f.file_size, f.modified_at, f.linked_collection_id, c.title AS linked_title
             FROM local_files f LEFT JOIN collections c ON c.id = f.linked_collection_id
             WHERE f.content_status = 'active'
             ORDER BY f.modified_at DESC LIMIT 500`,
          )
          .all() as Array<{
          file_path: string;
          file_name: string;
          file_type: string | null;
          file_size: number | null;
          modified_at: string | null;
          linked_collection_id: string | null;
          linked_title: string | null;
        }>;
        return complete(msg.request_id, { task: "status_query", scope, files: rows });
      }
      if (scope === "summary") {
        const total = this.db.prepare("SELECT COUNT(*) AS n FROM collections WHERE content_status='active'").get() as { n: number };
        const unorganized = this.db.prepare("SELECT COUNT(*) AS n FROM collections WHERE organize_status='unorganized'").get() as { n: number };
        const important = this.db.prepare("SELECT COUNT(*) AS n FROM collections WHERE priority IN ('important','project')").get() as { n: number };
        const aiPending = this.db.prepare("SELECT COUNT(*) AS n FROM ai_suggestions WHERE status='pending'").get() as { n: number };
        const watchLater = this.db.prepare("SELECT COUNT(*) AS n FROM collections WHERE save_type='watch_later'").get() as { n: number };
        const localFiles = this.db.prepare("SELECT COUNT(*) AS n FROM local_files WHERE content_status='active'").get() as { n: number };
        const topics = this.db.prepare("SELECT COUNT(*) AS n FROM topics WHERE status='accepted'").get() as { n: number };
        const deleted = this.db.prepare("SELECT COUNT(*) AS n FROM collections WHERE content_status IN ('deleted','unavailable')").get() as { n: number };
        const syncFailed = this.db.prepare("SELECT COUNT(*) AS n FROM collections WHERE sync_status='failed'").get() as { n: number };
        const fileMissing = this.db.prepare("SELECT COUNT(*) AS n FROM collections WHERE content_status='file_missing'").get() as { n: number };
        return complete(msg.request_id, {
          task: "status_query",
          scope,
          summary: {
            total: total.n,
            unorganized: unorganized.n,
            important: important.n,
            aiPending: aiPending.n,
            watchLater: watchLater.n,
            localFiles: localFiles.n,
            topics: topics.n,
            anomalies: { deleted: deleted.n, syncFailed: syncFailed.n, fileMissing: fileMissing.n },
          },
        });
      }
      return complete(msg.request_id, { task: "status_query", scope, ok: true });
    } catch (err) {
      return error(msg.request_id, "QUERY_001", `QUERY_001: ${(err as Error).message}`);
    }
  }

  /** 更新收藏整理状态（用户整理流转：未整理 -> 已查看 -> 已整理 -> 已归档）。 */
  async organize(msg: OmniMessage): Promise<OmniMessage> {
    const collectionId = String(msg.payload.collection_id ?? "");
    const status = String(msg.payload.organize_status ?? "");
    const valid = ["unorganized", "viewed", "organized", "archived"];
    if (!collectionId || !valid.includes(status)) {
      return error(msg.request_id, "ORG_001", "ORG_001: invalid collection_id or organize_status");
    }
    try {
      new CollectionRepository(this.db).setOrganizeState(collectionId, status as "unorganized" | "viewed" | "organized" | "archived");
      return complete(msg.request_id, { task: "organize", collection_id: collectionId, organize_status: status });
    } catch (err) {
      return error(msg.request_id, "ORG_001", `ORG_001: ${(err as Error).message}`);
    }
  }

  /** 用户手动打 Tag（content_tags source=user）。 */
  async tag(msg: OmniMessage): Promise<OmniMessage> {
    const collectionId = String(msg.payload.collection_id ?? "");
    const tag = String(msg.payload.tag ?? "").trim();
    if (!collectionId || !tag) {
      return error(msg.request_id, "TAG_001", "TAG_001: invalid collection_id or tag");
    }
    try {
      const tags = new TagRepository(this.db);
      const row = tags.ensureTag(tag);
      tags.bindTag(collectionId, row.id, "user");
      return complete(msg.request_id, { task: "tag", collection_id: collectionId, tag: row.name });
    } catch (err) {
      return error(msg.request_id, "TAG_001", `TAG_001: ${(err as Error).message}`);
    }
  }

  /** 用户手动建 Topic（topics 表 accepted 状态）。 */
  async topic(msg: OmniMessage): Promise<OmniMessage> {
    const collectionId = String(msg.payload.collection_id ?? "");
    const topic = String(msg.payload.topic ?? "").trim();
    if (!collectionId || !topic) {
      return error(msg.request_id, "TOPIC_001", "TOPIC_001: invalid collection_id or topic");
    }
    try {
      const topics = new TopicRepository(this.db);
      const row = topics.findByName(topic) ?? topics.createTopic(topic, collectionId);
      topics.addCollection(row.id, collectionId);
      topics.setStatus(row.id, "accepted");
      return complete(msg.request_id, { task: "topic", collection_id: collectionId, topic: row.name });
    } catch (err) {
      return error(msg.request_id, "TOPIC_001", `TOPIC_001: ${(err as Error).message}`);
    }
  }

  /** Tag Atlas 列表（PRD 16.2）：名称/数量/别名。 */
  async tagList(msg: OmniMessage): Promise<OmniMessage> {
    try {
      const tags = new TagRepository(this.db).listTags();
      return complete(msg.request_id, { task: "tag_list", tags });
    } catch (err) {
      return error(msg.request_id, "TAG_002", `TAG_002: ${(err as Error).message}`);
    }
  }

  /** 为 Tag 添加别名（PRD 16.2）：任意别名搜索命中主 Tag 全部内容。 */
  async tagAliasAdd(msg: OmniMessage): Promise<OmniMessage> {
    const tag = String(msg.payload.tag ?? "").trim();
    const alias = String(msg.payload.alias ?? "").trim();
    if (!tag || !alias) {
      return error(msg.request_id, "TAG_003", "TAG_003: invalid tag or alias");
    }
    try {
      const tags = new TagRepository(this.db);
      const row = tags.ensureTag(tag);
      tags.addAlias(row.name, alias);
      return complete(msg.request_id, { task: "tag_alias_add", tag: row.name, alias });
    } catch (err) {
      return error(msg.request_id, "TAG_003", `TAG_003: ${(err as Error).message}`);
    }
  }

  /** 合并 Tag（去重核心操作）：source 全部并入 target。 */
  async tagMerge(msg: OmniMessage): Promise<OmniMessage> {
    const source = String(msg.payload.source ?? "").trim();
    const target = String(msg.payload.target ?? "").trim();
    if (!source || !target || source === target) {
      return error(msg.request_id, "TAG_004", "TAG_004: invalid source or target");
    }
    try {
      const tags = new TagRepository(this.db);
      tags.mergeTags(source, target);
      return complete(msg.request_id, { task: "tag_merge", source, target });
    } catch (err) {
      return error(msg.request_id, "TAG_004", `TAG_004: ${(err as Error).message}`);
    }
  }

  /** 重命名 Tag；重名自动合并。 */
  async tagRename(msg: OmniMessage): Promise<OmniMessage> {
    const tag = String(msg.payload.tag ?? "").trim();
    const next = String(msg.payload.next ?? "").trim();
    if (!tag || !next) {
      return error(msg.request_id, "TAG_005", "TAG_005: invalid tag or next");
    }
    try {
      const tags = new TagRepository(this.db);
      const row = tags.renameTag(tag, next);
      return complete(msg.request_id, { task: "tag_rename", tag, next, canonical: row.name });
    } catch (err) {
      return error(msg.request_id, "TAG_005", `TAG_005: ${(err as Error).message}`);
    }
  }

  /** Topic 列表（PRD 17.2）：成员数与状态。 */
  async topicList(msg: OmniMessage): Promise<OmniMessage> {
    try {
      const topics = new TopicRepository(this.db).listTopicsWithCounts();
      return complete(msg.request_id, { task: "topic_list", topics });
    } catch (err) {
      return error(msg.request_id, "TOPIC_002", `TOPIC_002: ${(err as Error).message}`);
    }
  }

  /** 重命名 Topic。 */
  async topicRename(msg: OmniMessage): Promise<OmniMessage> {
    const topicId = String(msg.payload.topic_id ?? "");
    const name = String(msg.payload.name ?? "").trim();
    if (!topicId || !name) {
      return error(msg.request_id, "TOPIC_003", "TOPIC_003: invalid topic_id or name");
    }
    try {
      const topics = new TopicRepository(this.db);
      const row = topics.findById(topicId);
      if (!row) return error(msg.request_id, "TOPIC_003", "TOPIC_003: topic not found");
      topics.renameTopic(topicId, name);
      return complete(msg.request_id, { task: "topic_rename", topic_id: topicId, name });
    } catch (err) {
      return error(msg.request_id, "TOPIC_003", `TOPIC_003: ${(err as Error).message}`);
    }
  }

  /** 用户区评分同步副本（user_notes.user_rating）一次载入，供 DTO 映射。 */
  private ratingMap(): Map<string, number> {
    const rows = this.db
      .prepare("SELECT collection_id, user_rating FROM user_notes WHERE user_rating IS NOT NULL")
      .all() as Array<{ collection_id: string; user_rating: number }>;
    return new Map(rows.map((r) => [r.collection_id, r.user_rating]));
  }

  /** 用户手动设置收藏优先级（普通/重要/项目/知识）。 */
  async priority(msg: OmniMessage): Promise<OmniMessage> {
    const collectionId = String(msg.payload.collection_id ?? "");
    const priority = String(msg.payload.priority ?? "");
    const valid = ["normal", "important", "project", "knowledge"];
    if (!collectionId || !valid.includes(priority)) {
      return error(msg.request_id, "PRI_001", "PRI_001: invalid collection_id or priority");
    }
    try {
      new CollectionRepository(this.db).setPriority(collectionId, priority as "normal" | "important" | "project" | "knowledge");
      return complete(msg.request_id, { task: "priority", collection_id: collectionId, priority });
    } catch (err) {
      return error(msg.request_id, "PRI_001", `PRI_001: ${(err as Error).message}`);
    }
  }

  /**
   * PRD 26.1 ②③：可视化登录窗口引导用户手动登录。
   * 插件/引擎不接触账号密码；登录成功后自动捕获 storageState 并加密保存 Cookie（仅本地，绝不上传）。
   * 耗时任务：连接级并发，不阻塞其他请求。
   */
  async login(msg: OmniMessage): Promise<OmniMessage> {
    const platform = String(msg.payload.platform ?? "");
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return error(msg.request_id, "LOGIN_001", `LOGIN_001: unsupported platform: ${platform}`);
    }
    const timeoutSeconds = Number(msg.payload.timeout_seconds ?? 300);
    try {
      const res = await runLoginWindow({ platform, dataDir: this.opts.dataDir, timeoutSeconds });
      if (res.loggedIn) {
        const accounts = new AccountRepository(this.db);
        accounts.getOrCreate(platform);
        accounts.setStatus(platform, "active");
      }
      return complete(msg.request_id, {
        task: "login",
        platform,
        logged_in: res.loggedIn,
        cookie_count: res.cookieCount,
        ...(res.reason ? { reason: res.reason } : {}),
      });
    } catch (err) {
      return error(msg.request_id, "LOGIN_001", `LOGIN_001: ${(err as Error).message}`);
    }
  }

  /** 用户手动评分 1~5 星（PRD 29.2）；rating=0 表示清除。ADR-006：权威为 Markdown 用户区，本表为同步副本。 */
  async rating(msg: OmniMessage): Promise<OmniMessage> {    const collectionId = String(msg.payload.collection_id ?? "");
    const raw = Number(msg.payload.rating);
    if (!collectionId || !Number.isInteger(raw) || raw < 0 || raw > 5) {
      return error(msg.request_id, "RAT_001", "RAT_001: invalid collection_id or rating (integer 0~5)");
    }
    try {
      const collections = new CollectionRepository(this.db);
      if (!collections.findById(collectionId)) {
        return error(msg.request_id, "RAT_002", "RAT_002: collection not found");
      }
      const note = new UserRepository(this.db).setRating(collectionId, raw === 0 ? null : raw);
      return complete(msg.request_id, { task: "rating", collection_id: collectionId, rating: note.user_rating ?? null });
    } catch (err) {
      return error(msg.request_id, "RAT_001", `RAT_001: ${(err as Error).message}`);
    }
  }

  /** 用户精选评论（PRD 7.3）：切换 is_starred 同步副本，写用户区由 Plugin 物化。 */
  async commentStar(msg: OmniMessage): Promise<OmniMessage> {
    const collectionId = String(msg.payload.collection_id ?? "");
    const commentId = String(msg.payload.comment_id ?? "");
    const starred = msg.payload.starred === true || msg.payload.starred === "true";
    if (!collectionId || !commentId) {
      return error(msg.request_id, "STAR_001", "STAR_001: invalid collection_id or comment_id");
    }
    try {
      const ok = new CommentRepository(this.db).setStarredInCollection(collectionId, commentId, starred);
      if (!ok) {
        return error(msg.request_id, "STAR_002", "STAR_002: comment not found in collection");
      }
      return complete(msg.request_id, { task: "comment_star", collection_id: collectionId, comment_id: commentId, starred });
    } catch (err) {
      return error(msg.request_id, "STAR_001", `STAR_001: ${(err as Error).message}`);
    }
  }

  /** 稍后再看处理流：转为正式收藏（save_type=favorited）或归档完成。 */
  async convert(msg: OmniMessage): Promise<OmniMessage> {
    const collectionId = String(msg.payload.collection_id ?? "");
    const to = String(msg.payload.to ?? "");
    if (!collectionId || !["favorited", "archived"].includes(to)) {
      return error(msg.request_id, "CONV_001", "CONV_001: invalid collection_id or to");
    }
    try {
      const collections = new CollectionRepository(this.db);
      if (to === "favorited") {
        this.db
          .prepare("UPDATE collections SET save_type='favorited', updated_at=? WHERE id=?")
          .run(new Date().toISOString(), collectionId);
      } else {
        this.db
          .prepare("UPDATE collections SET organize_status='archived', updated_at=? WHERE id=?")
          .run(new Date().toISOString(), collectionId);
      }
      return complete(msg.request_id, { task: "convert", collection_id: collectionId, to });
    } catch (err) {
      return error(msg.request_id, "CONV_001", `CONV_001: ${(err as Error).message}`);
    }
  }

  /** 批量操作：tag / topic / priority / organize / convert。 */
  async batch(msg: OmniMessage): Promise<OmniMessage> {
    const rawIds = msg.payload.ids;
    const ids = Array.isArray(rawIds) ? rawIds.map(String) : [];
    const action = String(msg.payload.action ?? "");
    const value = String(msg.payload.value ?? "");
    const valid = ["tag", "topic", "priority", "organize", "convert"];
    if (ids.length === 0 || !valid.includes(action)) {
      return error(msg.request_id, "BATCH_001", "BATCH_001: invalid ids or action");
    }
    try {
      const collections = new CollectionRepository(this.db);
      const tags = new TagRepository(this.db);
      const topics = new TopicRepository(this.db);
      const stamp = new Date().toISOString();
      let applied = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          if (!collections.findById(id)) {
            failed += 1;
            continue;
          }
          switch (action) {
            case "tag": {
              const t = tags.ensureTag(value);
              tags.bindTag(id, t.id, "user");
              break;
            }
            case "topic": {
              const t = topics.findByName(value) ?? topics.createTopic(value, id);
              topics.addCollection(t.id, id);
              topics.setStatus(t.id, "accepted");
              break;
            }
            case "priority":
              collections.setPriority(id, value as "normal" | "important" | "project" | "knowledge");
              break;
            case "organize":
              collections.setOrganizeState(id, value as "unorganized" | "viewed" | "organized" | "archived");
              break;
            case "convert":
              if (value === "favorited") {
                this.db.prepare("UPDATE collections SET save_type='favorited', updated_at=? WHERE id=?").run(stamp, id);
              } else if (value === "archived") {
                this.db.prepare("UPDATE collections SET organize_status='archived', updated_at=? WHERE id=?").run(stamp, id);
              } else {
                failed += 1;
                continue;
              }
              break;
            default:
              failed += 1;
              continue;
          }
          applied += 1;
        } catch {
          failed += 1;
        }
      }
      return complete(msg.request_id, { task: "batch", action, value, applied, failed });
    } catch (err) {
      return error(msg.request_id, "BATCH_001", `BATCH_001: ${(err as Error).message}`);
    }
  }

  /** Manual 模式：用户粘贴任意 AI 工具的回复，解析为 Suggestion（PRD 19.3）。 */
  async aiManual(msg: OmniMessage): Promise<OmniMessage> {
    const collectionId = String(msg.payload.collection_id ?? "");
    const reply = String(msg.payload.reply ?? "").trim();
    if (!collectionId || !reply) {
      return error(msg.request_id, "AI_006", "AI_006: missing collection_id or reply");
    }
    try {
      const aiRepo = new AIRepository(this.db);
      const suggestions = parseSuggestions(reply);
      let saved = 0;
      for (const s of suggestions) {
        aiRepo.saveSuggestion({
          collection_id: collectionId,
          suggestion_type: s.type,
          payload: s.payload,
          model: "manual",
          confidence: s.confidence,
        });
        saved += 1;
      }
      return complete(msg.request_id, { task: "ai_manual", collection_id: collectionId, saved });
    } catch (err) {
      return error(msg.request_id, "AI_006", `AI_006: ${(err as Error).message}`);
    }
  }

  /** Manual 批量（PRD 19.3 批量版）：按索引打包回复，逐条收藏生成 Suggestion。 */
  async aiManualBatch(msg: OmniMessage): Promise<OmniMessage> {
    const rawIds = msg.payload.collection_ids;
    const ids = Array.isArray(rawIds) ? rawIds.map(String) : [];
    const reply = String(msg.payload.reply ?? "").trim();
    if (ids.length === 0 || !reply) {
      return error(msg.request_id, "AI_008", "AI_008: missing collection_ids or reply");
    }
    try {
      const aiRepo = new AIRepository(this.db);
      const collections = new CollectionRepository(this.db);
      const entries = parseBatchSuggestions(reply);
      let saved = 0;
      for (const entry of entries) {
        const collectionId = ids[entry.index];
        if (!collectionId || !collections.findById(collectionId)) continue;
        for (const s of entry.suggestions) {
          aiRepo.saveSuggestion({
            collection_id: collectionId,
            suggestion_type: s.type,
            payload: s.payload,
            model: "manual-batch",
            confidence: s.confidence,
          });
          saved += 1;
        }
      }
      return complete(msg.request_id, { task: "ai_manual_batch", entries: entries.length, saved });
    } catch (err) {
      return error(msg.request_id, "AI_008", `AI_008: ${(err as Error).message}`);
    }
  }

  /** 本地文件索引：扫描 Markdown/PDF，按 OMNI_SYSTEM url 关联到收藏。 */
  async index(msg: OmniMessage): Promise<OmniMessage> {
    const folder = String(msg.payload.folder ?? "");
    if (!folder) return error(msg.request_id, "IDX_001", "IDX_001: missing folder");
    try {
      const files = new FileRepository(this.db);
      const collections = new CollectionRepository(this.db);
      const indexer = new FileIndexer(files, (url) => collections.findByUrl(url)?.id);
      const report = indexer.scan(folder, true);
      return complete(msg.request_id, { task: "index", folder, report });
    } catch (err) {
      return error(msg.request_id, "IDX_001", `IDX_001: ${(err as Error).message}`);
    }
  }

  /** 按需抓取收藏网页正文（不落盘）：小红书走签名 feed，其余浏览器提取。 */
  async fetchText(msg: OmniMessage): Promise<OmniMessage> {
    const url = String(msg.payload.url ?? '');
    if (!url) return error(msg.request_id, 'FETCH_001', 'FETCH_001: missing url');
    const cached = this.fetchCache.get(url);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      return complete(msg.request_id, { task: 'fetch', url, ...cached.result });
    }
    const col = new CollectionRepository(this.db).findByUrl(url);
    const platform = col?.platform ?? String(msg.payload.platform ?? '');
    try {
      const ctx = await this.getFetchContext(platform);
      if (col?.platform === 'xiaohongshu') {
        const extra = (() => {
          try { return JSON.parse(col.extra_json ?? '{}') as { xsecToken?: string }; } catch { return {}; }
        })();
        const noteId = /(?:explore|discovery\/item|note)\/([0-9a-zA-Z]+)/.exec(url)?.[1];
        if (noteId && extra.xsecToken) {
          const adapter = new XiaohongshuAdapter();
          const result = await adapter.fetchNoteText(ctx, noteId, extra.xsecToken);
          if (result) {
            const payload = {
              task: 'fetch', url, platform,
              title: result.title,
              text: result.text.slice(0, 20000),
              comments: result.comments,
            };
            this.fetchCache.set(url, { ts: Date.now(), result: payload });
            return complete(msg.request_id, payload);
          }
        }
        return error(msg.request_id, 'FETCH_002', 'FETCH_002: XHS text needs xsec_token (re-sync required after risk-control cooldown)');
      }
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await page.waitForSelector('main', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(500);
        const title = await page.title().catch(() => '');
        const text = await page.evaluate(() => {
          const pick = (el: Element | null | undefined) => {
            if (!el) return '';
            const clone = el.cloneNode(true) as HTMLElement;
            for (const sel of ['header','footer','nav','aside','script','style',"[class*='nav']","[class*='header']","[class*='footer']"]) {
              clone.querySelectorAll(sel).forEach((n: Element) => n.remove());
            }
            return (clone.innerText || '').replace(/\n{2,}/g, '\n').trim();
          };
          const main = pick(document.querySelector('main'));
          return main.length > 200 ? main : pick(document.body);
        }).catch(() => '');
        const payload = { task: 'fetch', url, platform, title: title.slice(0, 200), text };
        this.fetchCache.set(url, { ts: Date.now(), result: payload });
        return complete(msg.request_id, payload);
      } finally {
        await page.close().catch(() => {});
      }
    } catch (err) {
      return error(msg.request_id, 'FETCH_001', `FETCH_001: ${(err as Error).message}`);
    }
  }

  private async getFetchContext(platform: string): Promise<import('playwright').BrowserContext> {
    const existing = this.fetchContexts.get(platform);
    if (existing) return existing;
    this.fetchSessions ??= new BrowserSessionManager({ dataDir: this.opts.dataDir, headless: true });
    const ctx = await this.fetchSessions.create(platform);
    this.fetchContexts.set(platform, ctx);
    return ctx;
  }


  /** 用户审核建议：accepted / rejected。 */
  async aiReviewUpdate(msg: OmniMessage): Promise<OmniMessage> {
    const id = String(msg.payload.suggestion_id ?? "");
    const status = String(msg.payload.status ?? "");
    if (!id || !["accepted", "rejected", "expired"].includes(status)) {
      return error(msg.request_id, "AI_005", "AI_005: invalid suggestion_id or status");
    }
    try {
      const aiRepo = new AIRepository(this.db);
      const suggestion = aiRepo.findById(id);
      if (!suggestion) {
        return error(msg.request_id, "AI_005", "AI_005: suggestion not found");
      }
      let materialized: Record<string, unknown> | undefined;
      if (status === "accepted") {
        materialized = await this.materializeAccepted(suggestion);
      }
      aiRepo.updateSuggestionStatus(id, status as "accepted" | "rejected" | "expired");
      // PRD 18 反馈闭环：接受/拒绝行为全部记录
      const eventType =
        status === "accepted"
          ? this.acceptEventType(suggestion.suggestion_type)
          : this.rejectEventType(suggestion.suggestion_type);
      if (eventType) {
        aiRepo.recordFeedback(suggestion.collection_id, eventType, {
          suggestion_id: id,
          suggestion_type: suggestion.suggestion_type,
          payload: suggestion.payload ?? undefined,
          ...(materialized ?? {}),
        });
      }
      return complete(msg.request_id, { task: "ai_review_update", suggestion_id: id, status });
    } catch (err) {
      return error(msg.request_id, "AI_005", `AI_005: ${(err as Error).message}`);
    }
  }

  private acceptEventType(type: string): string | null {
    return (
      {
        suggested_tag: "ai_tag_accepted",
        suggested_topic: "ai_topic_accepted",
        suggested_summary: "ai_summary_accepted",
        suggested_group: "ai_group_accepted",
      } as Record<string, string | undefined>
    )[type] ?? null;
  }

  private rejectEventType(type: string): string | null {
    return (
      {
        suggested_tag: "ai_tag_rejected",
        suggested_topic: "ai_topic_rejected",
        suggested_summary: "ai_summary_rejected",
        suggested_group: "ai_group_rejected",
      } as Record<string, string | undefined>
    )[type] ?? null;
  }

  /** 接受建议后落地：分组 / Topic / Tag / 摘要，返回撤销所需事件数据。 */
  private async materializeAccepted(suggestion: {
    suggestion_type: string;
    payload?: string | null;
    collection_id: string;
  }): Promise<Record<string, unknown>> {
    const payload = suggestion.payload ?? "";
    switch (suggestion.suggestion_type) {
      case "suggested_group": {
        const result = new ContentGroupService({
          groups: new ContentGroupRepository(this.db),
          collections: new CollectionRepository(this.db),
          ai: new AIRepository(this.db),
        }).materializeSuggestion(payload);
        return { group_id: result.groupId };
      }
      case "suggested_topic": {
        const topics = new TopicRepository(this.db);
        const topic =
          topics.findByName(payload.trim()) ??
          topics.createTopic(payload.trim(), suggestion.collection_id);
        topics.addCollection(topic.id, suggestion.collection_id);
        topics.setStatus(topic.id, "accepted");
        return { topic_id: topic.id };
      }
      case "suggested_tag": {
        const tags = new TagRepository(this.db);
        const tagNames = parseTagPayload(payload);
        const tagIds: string[] = [];
        for (const name of tagNames) {
          const tag = tags.ensureTag(name);
          tags.bindTag(suggestion.collection_id, tag.id, "ai");
          tagIds.push(tag.id);
        }
        return { tag_ids: tagIds };
      }
      case "suggested_summary": {
        this.db
          .prepare("UPDATE collections SET ai_summary = ?, ai_status = 'done', updated_at = datetime('now') WHERE id = ?")
          .run(payload, suggestion.collection_id);
        return { summary: payload };
      }
      default:
        return {};
    }
  }

  /** 撤销已确认建议（24 小时内，SPEC S9.2 / PRD 19.2）。 */
  async aiReviewUndo(msg: OmniMessage): Promise<OmniMessage> {
    const id = String(msg.payload.suggestion_id ?? "");
    if (!id) return error(msg.request_id, "AI_007", "AI_007: missing suggestion_id");
    try {
      const aiRepo = new AIRepository(this.db);
      const suggestion = aiRepo.findById(id);
      if (!suggestion || suggestion.status !== "accepted") {
        return error(msg.request_id, "AI_007", "AI_007: suggestion not accepted or not found");
      }
      const reviewedAt = suggestion.reviewed_at
        ? new Date(String(suggestion.reviewed_at).replace(" ", "T") + "Z").getTime()
        : 0;
      if (!reviewedAt || Date.now() - reviewedAt > 24 * 3600 * 1000) {
        return error(msg.request_id, "AI_007", "AI_007: 已超过 24 小时，无法撤销");
      }
      const feedbacks = this.db
        .prepare(
          "SELECT event_type, event_data FROM user_feedback WHERE collection_id = ? AND event_type LIKE 'ai\\_%\\_accepted' ESCAPE '\\'",
        )
        .all(suggestion.collection_id) as Array<{ event_type: string; event_data: string }>;
      const feedback = feedbacks.find((f) => {
        try {
          return (JSON.parse(f.event_data) as { suggestion_id?: string }).suggestion_id === id;
        } catch {
          return false;
        }
      });
      if (!feedback) {
        return error(msg.request_id, "AI_007", "AI_007: 未找到撤销所需反馈记录");
      }
      const data = JSON.parse(feedback.event_data) as Record<string, unknown>;
      const topics = new TopicRepository(this.db);
      const groups = new ContentGroupRepository(this.db);
      if (feedback.event_type === "ai_tag_accepted" && Array.isArray(data.tag_ids)) {
        const placeholders = (data.tag_ids as string[]).map(() => "?").join(",");
        this.db
          .prepare(
            `DELETE FROM content_tags
             WHERE collection_id = ? AND source = 'ai' AND tag_id IN (${placeholders})`,
          )
          .run(suggestion.collection_id, ...(data.tag_ids as string[]));
      } else if (feedback.event_type === "ai_topic_accepted" && typeof data.topic_id === "string") {
        topics.removeCollection(data.topic_id, suggestion.collection_id);
      } else if (feedback.event_type === "ai_summary_accepted") {
        this.db
          .prepare("UPDATE collections SET ai_summary = NULL, ai_status = NULL, updated_at = datetime('now') WHERE id = ?")
          .run(suggestion.collection_id);
      } else if (feedback.event_type === "ai_group_accepted" && typeof data.group_id === "string") {
        const bound = groups.listCollectionsInGroup(data.group_id).map((c) => c.id);
        for (const cid of bound) groups.unbindCollection(cid);
        groups.deleteGroup(data.group_id);
      }
      aiRepo.updateSuggestionStatus(id, "pending");
      return complete(msg.request_id, { task: "ai_review_undo", suggestion_id: id });
    } catch (err) {
      return error(msg.request_id, "AI_007", `AI_007: ${(err as Error).message}`);
    }
  }

  dispose(): void {
    for (const ctx of this.fetchContexts.values()) {
      void ctx.close().catch(() => {});
    }
    this.fetchContexts.clear();
    this.manager.close();
  }
}
