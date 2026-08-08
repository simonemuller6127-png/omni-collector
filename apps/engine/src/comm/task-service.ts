import path from "node:path";
import type { OmniMessage } from "@omni/shared-core";
import type { AIProvider } from "@omni/ai";
import {
  AIRepository,
  CollectionRepository,
  CommentRepository,
  ContentGroupRepository,
  MigrationManager,
  RuleCenter,
  TagRepository,
  TopicRepository,
} from "@omni/database";
import type { CollectionDTO } from "@omni/shared-core";
import { AiQueueRunner } from "../ai/ai-queue-runner.js";
import { ContentGroupService } from "../group/content-group-service.js";
import { SyncRunner } from "../sync/sync-runner.js";
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
      TASK_AI: (msg) => this.ai(msg),
      TASK_GROUP: (msg) => this.group(msg),
      TASK_ORGANIZE: (msg) => this.organize(msg),
      TASK_TAG: (msg) => this.tag(msg),
      TASK_TOPIC: (msg) => this.topic(msg),
      TASK_PRIORITY: (msg) => this.priority(msg),
      AI_REVIEW_LIST: (msg) => this.aiReviewList(msg),
      AI_REVIEW_UPDATE: (msg) => this.aiReviewUpdate(msg),
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
    try {
      const runner = new SyncRunner({
        dataDir: this.opts.dataDir,
        migrationsDir: this.opts.migrationsDir,
        headless: this.opts.headless ?? true,
      });
      const report = await runner.run(platform, mode);
      return complete(msg.request_id, { task: "sync", platform, mode, report });
    } catch (err) {
      return error(msg.request_id, "SYNC_002", `SYNC_002: ${(err as Error).message}`);
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
      const pending = new AIRepository(this.db).listPendingSuggestions();
      return complete(
        msg.request_id,
        {
          task: "ai_review_list",
          suggestions: pending.map((s) => ({
            id: s.id,
            collection_id: s.collection_id,
            suggestion_type: s.suggestion_type,
            payload: s.payload ?? undefined,
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
        const dtos: CollectionDTO[] = collections.listAll().map((c) => {
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
        const lastSyncs = this.db
          .prepare(
            "SELECT adapter, MAX(finished_at) AS last_at FROM sync_log WHERE status='success' GROUP BY adapter",
          )
          .all() as Array<{ adapter: string; last_at: string }>;
        const byLast = new Map(lastSyncs.map((l) => [l.adapter, l.last_at]));
        const byCount = new Map(counts.map((c) => [c.platform, c.count]));
        const platforms = ["bilibili", "youtube", "xiaohongshu", "makerworld", "xiaoheihe"].map(
          (platform) => ({
            platform,
            count: byCount.get(platform) ?? 0,
            lastSyncAt: byLast.get(platform) ?? null,
          }),
        );
        return complete(msg.request_id, { task: "status_query", scope, platforms });
      }
      if (scope === "collection") {
        const id = String(msg.payload.id ?? "");
        const col = new CollectionRepository(this.db).findById(id);
        if (!col) return error(msg.request_id, "QUERY_001", "QUERY_001: collection not found");
        const groups = new ContentGroupRepository(this.db);
        const tagRepo = new TagRepository(this.db);
        const topicRepo = new TopicRepository(this.db);
        const comments = new CommentRepository(this.db)
          .getByCollection(id)
          .slice(0, 3)
          .map((c) => ({ author: c.author ?? "", content: c.content }));
        const group = groups.groupOfCollection(col.id);
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
          aiStatus: (col.ai_status as CollectionDTO["aiStatus"]) ?? undefined,
          collectedAt: col.collected_at,
          lastSyncedAt: col.last_synced_at ?? undefined,
          groupId: group?.id,
          groupName: group?.name,
          tags: tagRepo.listTagsOfCollection(col.id).map((t) => t.name),
          topics: topicRepo.listTopicsOfCollection(col.id).map((t) => t.name),
          comments,
        };
        return complete(msg.request_id, { task: "status_query", scope, collection: dto });
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
      if (status === "accepted") {
        await this.materializeAccepted(suggestion);
      }
      aiRepo.updateSuggestionStatus(id, status as "accepted" | "rejected" | "expired");
      return complete(msg.request_id, { task: "ai_review_update", suggestion_id: id, status });
    } catch (err) {
      return error(msg.request_id, "AI_005", `AI_005: ${(err as Error).message}`);
    }
  }

  /** 接受建议后落地：分组 / Topic / Tag。 */
  private async materializeAccepted(suggestion: {
    suggestion_type: string;
    payload?: string | null;
    collection_id: string;
  }): Promise<void> {
    const payload = suggestion.payload ?? "";
    switch (suggestion.suggestion_type) {
      case "suggested_group": {
        new ContentGroupService({
          groups: new ContentGroupRepository(this.db),
          collections: new CollectionRepository(this.db),
          ai: new AIRepository(this.db),
        }).materializeSuggestion(payload);
        break;
      }
      case "suggested_topic": {
        const topics = new TopicRepository(this.db);
        const topic = topics.findByName(payload) ?? topics.createTopic(payload, suggestion.collection_id);
        topics.addCollection(topic.id, suggestion.collection_id);
        topics.setStatus(topic.id, "accepted");
        break;
      }
      case "suggested_tag": {
        const tags = new TagRepository(this.db);
        const tag = tags.ensureTag(payload);
        tags.bindTag(suggestion.collection_id, tag.id, "ai");
        break;
      }
      default:
        break;
    }
  }

  dispose(): void {
    this.manager.close();
  }
}
