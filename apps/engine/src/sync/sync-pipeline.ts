import type { BrowserContext } from "playwright";
import { BaseAdapter } from "@omni/adapters";
import {
  AccountRepository,
  AIRepository,
  CollectionRepository,
  CommentRepository,
  RuleCenter,
  SyncLogRepository,
  TagRepository,
} from "@omni/database";
import { extractHashtags, findNearDuplicateTags } from "../tags/tag-utils.js";

export type SyncMode = "catalog" | "full" | "detail";

export interface DuplicateTagHint {
  a: string;
  b: string;
}

export interface SyncReport {
  platform: string;
  mode: SyncMode;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed";
  itemsAdded: number;
  itemsUpdated: number;
  itemsFetched: number;
  errorCode?: string;
  errorDetail?: string;
  /**
   * 疑似重复 Tag（仅内容标签参与——形式标签只写 collections.content_type，从不进 tags 表）。
   * 阈值与截断数均来自 business_rules（ai_duplicate_tag_min_count /
   * ai_duplicate_tag_report_limit），不在代码里硬编码。
   */
  duplicateTags?: DuplicateTagHint[];
}

export interface SyncPipelineDeps {
  getAdapter(platform: string): BaseAdapter;
  collections: CollectionRepository;
  comments: CommentRepository;
  accounts: AccountRepository;
  rules: RuleCenter;
  logs: SyncLogRepository;
  ai?: AIRepository;
  tags?: TagRepository;
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

  async run(
    platform: string,
    mode: SyncMode = "catalog",
    ctx?: BrowserContext,
    maxItems?: number,
  ): Promise<SyncReport> {
    const startedAt = new Date().toISOString();
    const report: SyncReport = {
      platform,
      mode,
      startedAt,
      finishedAt: "",
      status: "success",
      itemsAdded: 0,
      itemsUpdated: 0,
      itemsFetched: 0,
    };
    try {
      const adapter = this.deps.getAdapter(platform);
      // 入库前先校验会话：失效立即抛 AUTH_002，避免抓到 0 条还报 success
      await adapter.authenticate(ctx!);
      const account = this.deps.accounts.getOrCreate(platform);
      const cursor = account.sync_cursor ? (JSON.parse(account.sync_cursor) as { page?: number }) : {};
      const raws = await adapter.fetchCatalog(ctx!, cursor);
      const items = typeof maxItems === "number" && maxItems > 0 ? raws.slice(0, maxItems) : raws;
      report.itemsFetched = items.length;
      let added = 0;
      let updated = 0;
      const maxDetail = this.deps.rules.getNumber(
        "init_full_detail_limit",
        mode === "full" || mode === "detail" ? 50 : 0,
      );
      let detailIndex = 0;
      for (const raw of items) {
        const contentType =
          typeof raw.extra?.contentType === "string" ? raw.extra.contentType : "video";
        const existing = this.deps.collections.findByUrl(raw.url);
        const row = this.deps.collections.upsertByPlatformItem(platform, raw.platformItemId, {
          url: raw.url,
          title: raw.title,
          author: raw.author,
          cover_url: raw.coverUrl,
          // 平台未提供收藏时间时不覆盖已有值（否则每次同步都会把该条目顶到时间线最前）
          ...(raw.collectedAt ? { collected_at: raw.collectedAt } : {}),
          save_type: raw.saveType,
          content_type: contentType,
          extra_json: raw.extra ? JSON.stringify(raw.extra) : undefined,
          content_status: raw.extra?.deleted ? "deleted" : "active",
          catalog_synced: 1,
          sync_status: mode === "catalog" ? "catalog" : "full",
        });
        if (existing) {
          updated += 1;
        } else {
          added += 1;
        }
        // PRD 16.1 第一层：平台原生标签（标题/简介中的 #话题）
        if (this.deps.tags) {
          const hashtags = extractHashtags(`${raw.title ?? ""}\n${raw.extra?.description ?? ""}`);
          for (const tag of hashtags) {
            const tagRow = this.deps.tags.ensureTag(tag);
            this.deps.tags.bindTag(row.id, tagRow.id, "platform");
          }
        }
        if ((mode === "full" || mode === "detail") && detailIndex < maxDetail) {
          detailIndex += 1;
          const detail = await adapter.fetchDetail(ctx!, raw.url);
          if (this.deps.tags && detail?.description) {
            for (const tag of extractHashtags(detail.description)) {
              const tagRow = this.deps.tags.ensureTag(tag);
              this.deps.tags.bindTag(row.id, tagRow.id, "platform");
            }
          }
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
      // 疑似重复检测前置到同步完成现场（只在 tags 依赖存在且数量达阈值时才跑 O(n^2)）
      if (this.deps.tags) {
        const minCount = this.deps.rules.getNumber("ai_duplicate_tag_min_count", 20);
        const reportLimit = Math.max(1, this.deps.rules.getNumber("ai_duplicate_tag_report_limit", 20));
        const allTags = this.deps.tags.listTags();
        if (allTags.length >= minCount) {
          report.duplicateTags = findNearDuplicateTags(
            allTags.map((t) => t.name),
            reportLimit,
          ).map((p) => ({ a: p.a, b: p.b }));
        }
      }
      report.itemsAdded = added;
      report.itemsUpdated = updated;
    } catch (err) {
      const msg = (err as Error).message;
      report.status = "failed";
      // 适配器抛出的语义化错误码（AUTH_/SYNC_/LOGIN_...）透传，供插件匹配报错文档
      report.errorCode = /^(AUTH|SYNC|LOGIN|ENGINE)_\d{3}/.exec(msg)?.[0] ?? "SYNC_001";
      report.errorDetail = msg;
      this.deps.accounts.setStatus(platform, "error", msg);
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
