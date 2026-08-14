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
  TagRepository,
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
/** 指纹绑定/Cloudflare 平台必须复用持久化 Profile；其余平台走 cookie/storageState 注入。 */
const PERSISTENT_PROFILE_PLATFORMS = new Set(["makerworld"]);

export interface SyncRunnerOptions {
  dataDir: string;
  migrationsDir: string;
  headless?: boolean;
  proxy?: string;
}

/** 评论批量更新候选：最近 N 天同步过，或从未做过详情同步的收藏。 */
export function selectRecentCommentCollections(
  db: ReturnType<MigrationManager["getDb"]>,
  platform: string,
  days: number,
  limit = 100,
): Array<{ id: string; url: string }> {
  return db
    .prepare(
      `SELECT id, url FROM collections
       WHERE platform = ? AND content_status = 'active'
         AND (detail_synced = 0 OR last_synced_at IS NULL OR last_synced_at >= datetime('now', ?))
       ORDER BY last_synced_at DESC, collected_at DESC
       LIMIT ?`,
    )
    .all(platform, `-${Math.max(1, Math.floor(days))} days`, limit) as Array<{
    id: string;
    url: string;
  }>;
}

/**
 * 同步编排器（Phase 4d Scheduler 落地点）：
 * 数据库迁移 -> 注入浏览器会话 -> SyncPipeline -> SQLite 入库 -> 关闭会话。
 * 单平台失败不影响其他平台（SyncPipeline 已隔离故障）。
 */
export class SyncRunner {
  constructor(private readonly opts: SyncRunnerOptions) {}

  async run(platform: string, mode: SyncMode = "full", depth?: number): Promise<SyncReport> {
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
        getAdapter: (p) => this.adapterFor(p, rules),
        collections: new CollectionRepository(db),
        comments: new CommentRepository(db),
        accounts: new AccountRepository(db),
        rules,
        logs: new SyncLogRepository(db),
        ai: new AIRepository(db),
        tags: new TagRepository(db),
      });
      // 指纹绑定平台（如 MakerWorld 的 Cloudflare 会话）需复用持久化 Profile
      const profileDir = sessions.profileDir(platform);
      ctx =
        PERSISTENT_PROFILE_PLATFORMS.has(platform) && fs.existsSync(profileDir)
          ? await sessions.createPersistent(platform)
          : await sessions.create(platform);
      return await pipeline.run(platform, mode, ctx, depth);
    } finally {
      if (ctx) await sessions.close(ctx).catch(() => {});
      manager.close();
    }
  }

  /** 评论批量更新（PRD 12.5 / 深度同步）：重新抓取最近 N 天收藏的评论。 */
  async refreshComments(
    platform?: string,
    days?: number,
  ): Promise<Array<{ platform: string; days: number; refreshed: number; failed: number }>> {
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
    try {
      const rules = new RuleCenter(db);
      const dayCount = days ?? rules.getNumber("comment_batch_update_days", 7);
      const platforms = platform ? [platform] : Object.keys(ADAPTER_FACTORIES);
      const reports: Array<{ platform: string; days: number; refreshed: number; failed: number }> = [];
      const comments = new CommentRepository(db);
      const stamp = new Date().toISOString();
      for (const p of platforms) {
        const rows = selectRecentCommentCollections(db, p, dayCount, 100);
        if (rows.length === 0) {
          reports.push({ platform: p, days: dayCount, refreshed: 0, failed: 0 });
          continue;
        }
        let ctx;
        try {
          const adapter = this.adapterFor(p, rules);
          const profileDir = sessions.profileDir(p);
          ctx =
            PERSISTENT_PROFILE_PLATFORMS.has(p) && fs.existsSync(profileDir)
              ? await sessions.createPersistent(p)
              : await sessions.create(p);
          let refreshed = 0;
          let failed = 0;
          for (const row of rows) {
            try {
              const detail = await adapter.fetchDetail(ctx, row.url);
              if (detail.comments && detail.comments.length > 0) {
                comments.upsertComments(
                  row.id,
                  detail.comments.map((c) => ({
                    comment_id: c.commentId,
                    author: c.author,
                    content: c.content,
                    like_count: c.likeCount,
                    posted_at: c.postedAt,
                    is_creator_reply: c.isCreatorReply,
                  })),
                );
              }
              db.prepare(
                "UPDATE collections SET last_synced_at = ?, detail_synced = 1, updated_at = ? WHERE id = ?",
              ).run(stamp, stamp, row.id);
              refreshed += 1;
            } catch {
              failed += 1;
            }
          }
          reports.push({ platform: p, days: dayCount, refreshed, failed });
        } finally {
          if (ctx) await sessions.close(ctx).catch(() => {});
        }
      }
      return reports;
    } finally {
      manager.close();
    }
  }

  private adapterFor(p: string, rules: RuleCenter): BaseAdapter {
    if (p === "makerworld") {
      return new MakerWorldAdapter({ syncLikes: rules.getBool("makerworld_sync_likes", false) });
    }
    if (p === "youtube") {
      const cmdRaw = rules.get("ytdlp_command");
      return new YouTubeAdapter({
        ytDlpCommand: cmdRaw ? cmdRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        cookiesFile: path.join(this.opts.dataDir, "ytdl_cookies.txt"),
        proxyUrl: rules.get("ytdlp_proxy") || undefined,
      });
    }
    return ADAPTER_FACTORIES[p]?.() ?? new BilibiliAdapter();
  }
}
