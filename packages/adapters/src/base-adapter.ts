import type { BrowserContext, Page } from "playwright";

/** TDD Part 6.1/6.2：Adapter 统一输入输出结构（ADR-003）。 */
export interface SyncCursor {
  lastItemId?: string;
  page?: number;
}

export interface RawComment {
  commentId: string;
  author: string;
  content: string;
  likeCount?: number;
  postedAt?: string;
  isCreatorReply?: boolean;
}

export interface CollectionRaw {
  platformItemId: string;
  url: string;
  title: string;
  author?: string;
  coverUrl?: string;
  collectedAt?: string;
  saveType: "favorited" | "watch_later";
  extra?: Record<string, unknown>;
}

export interface CollectionDetail {
  description?: string;
  transcript?: string;
  comments?: RawComment[];
  publishedAt?: string;
  contentType?: string;
  deleted?: boolean;
}

export interface UniversalCollection {
  platform: string;
  platformItemId: string;
  url: string;
  title: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  transcript?: string;
  contentType: string;
  saveType: "favorited" | "watch_later";
  collectedAt?: string;
  publishedAt?: string;
  comments: RawComment[];
  status: "active" | "deleted" | "unavailable";
}

export type NextPageStrategy = "url" | "click" | "scroll";
export type SessionStatus = "valid" | "invalid";

export interface HealthMetric {
  platform: string;
  parseFailureRate: number;
  slowPageRatio: number;
  lastError?: string;
  collectedAt: string;
}

/**
 * BaseAdapter（TDD Part 6.1，ADR-003）：
 * 通用采集能力内建，各平台只实现差异化部分；
 * 禁止直连数据库 / 写 Markdown / 调用 AI（SPEC S4.3）。
 */
export abstract class BaseAdapter {
  abstract readonly platform: string;
  abstract readonly listUrl: string;
  abstract readonly itemSelector: string;
  abstract readonly titleSelector: string;
  abstract readonly urlSelector: string;
  abstract readonly authorSelector: string;
  abstract readonly coverSelector: string;
  abstract readonly nextPage: NextPageStrategy;
  readonly commentSelector?: string;

  abstract authenticate(ctx: BrowserContext): Promise<void>;
  abstract validateSession(page: Page): Promise<SessionStatus>;
  abstract fetchCatalog(ctx: BrowserContext, cursor: SyncCursor): Promise<CollectionRaw[]>;
  abstract fetchDetail(ctx: BrowserContext, url: string): Promise<CollectionDetail>;
  abstract normalize(raw: CollectionRaw, detail?: CollectionDetail): UniversalCollection;
  abstract healthCheck(): Promise<HealthMetric>;
  abstract cleanup(): Promise<void>;

  /** 随机页面延迟（SPEC S4.3：500ms~3000ms）。 */
  async withRandomDelay(minMs = 500, maxMs = 3000): Promise<void> {
    const delay = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /** 最多 N 次指数退避重试（1s/2s/4s，SPEC S11.1）。 */
  async retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; baseDelayMs?: number } = {},
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 1000;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
        }
      }
    }
    throw lastError;
  }

  /**
   * 健康分级（SPEC S11.3）：
   * Level 1 解析失败率≥20% 或单页耗时超基线 3 倍；Level 3 匹配差异>50%。
   */
  classifyHealth(rate: number, slowPageRatio: number): 0 | 1 | 3 {
    if (rate > 0.5) return 3;
    if (rate >= 0.2 || slowPageRatio >= 3) return 1;
    return 0;
  }

  async captureDebugScreenshot(page: Page, filePath: string): Promise<void> {
    await page.screenshot({ path: filePath });
  }

  async injectCookies(ctx: BrowserContext, cookies: Parameters<BrowserContext["addCookies"]>[0]): Promise<void> {
    await ctx.addCookies(cookies);
  }
}
