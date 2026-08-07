import type { BrowserContext } from "playwright";
import { BaseAdapter } from "@omni/adapters";
import {
  AccountRepository,
  AIRepository,
  CollectionRepository,
  CommentRepository,
  RuleCenter,
  SyncLogRepository,
} from "@omni/database";

export type SyncMode = "catalog" | "full" | "detail";

export interface SyncReport {
  platform: string;
  mode: SyncMode;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed";
  itemsAdded: number;
  itemsUpdated: number;
  errorCode?: string;
  errorDetail?: string;
}

export interface SyncPipelineDeps {
  getAdapter(platform: string): BaseAdapter;
  collections: CollectionRepository;
  comments: CommentRepository;
  accounts: AccountRepository;
  rules: RuleCenter;
  logs: SyncLogRepository;
  ai?: AIRepository;
}

const PRIORITY_RANK: Record<string, number> = {
  important: 5,
  project: 5,
  knowledge: 3,
  normal: 0,
};

/**
 * 全局标准同步流水线（SPEC S4.4，TDD Part 5.2）：
 * Scheduler → Adapter → Sync Queue → SQLite → Inbox → AI Queue（可选）。
 * 故障隔离：单平台失败不中断其余平台；已入库数据不删除不回滚。
 */
export class SyncPipeline {
  constructor(private readonly deps: SyncPipelineDeps) {}

  async run(platform: string, mode: SyncMode = "catalog", ctx?: BrowserContext): Promise<SyncReport> {
    const startedAt = new Date().toISOString();
    const report: SyncReport = {
      platform,
      mode,
      startedAt,
      finishedAt: "",
      status: "success",
      itemsAdded: 0,
      itemsUpdated: 0,
    };
    try {
      const adapter = this.deps.getAdapter(platform);
      const account = this.deps.accounts.getOrCreate(platform);
      const cursor = account.sync_cursor ? (JSON.parse(account.sync_cursor) as { page?: number }) : {};
      const raws = await adapter.fetchCatalog(ctx!, cursor);
      let added = 0;
      let updated = 0;
      for (const raw of raws) {
        const contentType =
          typeof raw.extra?.contentType === "string" ? raw.extra.contentType : "video";
        const existing = this.deps.collections.findByUrl(raw.url);
        const row = this.deps.collections.upsertByPlatformItem(platform, raw.platformItemId, {
          url: raw.url,
          title: raw.title,
          author: raw.author,
          cover_url: raw.coverUrl,
          collected_at: raw.collectedAt,
          save_type: raw.saveType,
          content_type: contentType,
          catalog_synced: 1,
          sync_status: mode === "catalog" ? "catalog" : "full",
        });
        if (existing) {
          updated += 1;
        } else {
          added += 1;
        }
        if (mode === "full" || mode === "detail") {
          const detail = await adapter.fetchDetail(ctx!, raw.url);
          this.deps.collections.update(row.id, {
            description: detail.description ?? null,
            transcript: detail.transcript ?? null,
            detail_synced: 1,
            sync_status: "full",
            platform_created_at: detail.publishedAt ?? null,
            content_status: detail.deleted ? "deleted" : "active",
          });
          if (detail.comments && detail.comments.length > 0) {
            this.deps.comments.upsertComments(
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
          this.deps.collections.markInbox(row.id, "done");
          if (this.deps.rules.getBool("ai_enabled", false) && this.deps.ai) {
            this.deps.ai.enqueue(row.id, PRIORITY_RANK[row.priority] ?? 0);
          }
        }
      }
      this.deps.accounts.updateCursor(platform, JSON.stringify({ page: (cursor.page ?? 1) + 1 }));
      report.itemsAdded = added;
      report.itemsUpdated = updated;
    } catch (err) {
      report.status = "failed";
      report.errorCode = "SYNC_001";
      report.errorDetail = (err as Error).message;
      this.deps.accounts.setStatus(platform, "error", (err as Error).message);
    }
    report.finishedAt = new Date().toISOString();
    this.deps.logs.add({
      adapter: platform,
      task_type: `sync:${mode}`,
      started_at: report.startedAt,
      finished_at: report.finishedAt,
      status: report.status === "success" ? "success" : "failed",
      items_added: report.itemsAdded,
      items_updated: report.itemsUpdated,
      error_code: report.errorCode,
      error_detail: report.errorDetail,
    });
    return report;
  }
}
