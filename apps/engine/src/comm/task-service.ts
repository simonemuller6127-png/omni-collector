import path from "node:path";
import type { OmniMessage } from "@omni/shared-core";
import type { AIProvider } from "@omni/ai";
import {
  AIRepository,
  CollectionRepository,
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
        const dtos: CollectionDTO[] = collections.listAll().map((c) => {
          const group = groups.groupOfCollection(c.id);
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
          };
        });
        return complete(msg.request_id, { task: "status_query", scope, collections: dtos });
      }
      if (scope === "groups") {
        const groups = new ContentGroupRepository(this.db);
        return complete(msg.request_id, { task: "status_query", scope, groups: groups.listGroups() });
      }
      return complete(msg.request_id, { task: "status_query", scope, ok: true });
    } catch (err) {
      return error(msg.request_id, "QUERY_001", `QUERY_001: ${(err as Error).message}`);
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
