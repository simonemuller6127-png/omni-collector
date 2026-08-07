import path from "node:path";
import type { OmniMessage } from "@omni/shared-core";
import type { AIProvider } from "@omni/ai";
import { AIRepository, MigrationManager, RuleCenter } from "@omni/database";
import { AiQueueRunner } from "../ai/ai-queue-runner.js";
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

  dispose(): void {
    this.manager.close();
  }
}
