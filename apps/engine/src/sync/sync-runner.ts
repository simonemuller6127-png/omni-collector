import path from "node:path";
import fs from "node:fs";
import {
  AccountRepository,
  AIRepository,
  CollectionRepository,
  CommentRepository,
  MigrationManager,
  RuleCenter,
  SyncLogRepository,
} from "@omni/database";
import {
  BaseAdapter,
  BilibiliAdapter,
  MakerWorldAdapter,
  XiaoheiheAdapter,
  XiaohongshuAdapter,
  YouTubeAdapter,
} from "@omni/adapters";
import { BrowserSessionManager } from "./browser-session.js";
import { SyncPipeline, type SyncMode, type SyncReport } from "./sync-pipeline.js";

/** 平台 -> Adapter 工厂（TDD Part 6.5 全部平台）。 */
const ADAPTER_FACTORIES: Record<string, () => BaseAdapter> = {
  bilibili: () => new BilibiliAdapter(),
  youtube: () => new YouTubeAdapter(),
  xiaohongshu: () => new XiaohongshuAdapter(),
  makerworld: () => new MakerWorldAdapter(),
  xiaoheihe: () => new XiaoheiheAdapter(),
};

export const SUPPORTED_PLATFORMS = Object.keys(ADAPTER_FACTORIES);

export interface SyncRunnerOptions {
  dataDir: string;
  migrationsDir: string;
  headless?: boolean;
  proxy?: string;
}

/**
 * 同步编排器（Phase 4d Scheduler 落地点）：
 * 数据库迁移 -> 注入浏览器会话 -> SyncPipeline -> SQLite 入库 -> 关闭会话。
 * 单平台失败不影响其他平台（SyncPipeline 已隔离故障）。
 */
export class SyncRunner {
  constructor(private readonly opts: SyncRunnerOptions) {}

  async run(platform: string, mode: SyncMode = "full"): Promise<SyncReport> {
    const factory = ADAPTER_FACTORIES[platform];
    if (!factory) throw new Error(`unknown platform: ${platform} (supported: ${SUPPORTED_PLATFORMS.join(", ")})`);

    const dbPath = path.join(this.opts.dataDir, "OmniCollector.db");
    const manager = new MigrationManager(
      dbPath,
      this.opts.migrationsDir,
      path.join(this.opts.dataDir, "backup"),
    );
    manager.migrate();
    const db = manager.getDb();
    const sessions = new BrowserSessionManager({
      dataDir: this.opts.dataDir,
      headless: this.opts.headless,
      proxy: this.opts.proxy,
    });
    let ctx;
    try {
      const rules = new RuleCenter(db);
      const pipeline = new SyncPipeline({
        getAdapter: (p) => {
          if (p === "makerworld") {
            return new MakerWorldAdapter({ syncLikes: rules.getBool("makerworld_sync_likes", false) });
          }
          return ADAPTER_FACTORIES[p]?.();
        },
        collections: new CollectionRepository(db),
        comments: new CommentRepository(db),
        accounts: new AccountRepository(db),
        rules,
        logs: new SyncLogRepository(db),
        ai: new AIRepository(db),
      });
      // 指纹绑定平台（如 MakerWorld 的 Cloudflare 会话）需复用持久化 Profile
      const profileDir = sessions.profileDir(platform);
      ctx = fs.existsSync(profileDir) ? await sessions.createPersistent(platform) : await sessions.create(platform);
      return await pipeline.run(platform, mode, ctx);
    } finally {
      if (ctx) await sessions.close(ctx).catch(() => {});
      manager.close();
    }
  }
}
