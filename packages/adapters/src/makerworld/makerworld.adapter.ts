import type { BrowserContext, Page } from "playwright";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";

/** MakerWorld 模型 ID：/zh/models/{id}-{slug}。 */
export function extractMakerWorldId(url: string): string | null {
  const m = /\/models\/(\d+)/.exec(url);
  return m?.[1] ?? null;
}

const HOME_URL = "https://makerworld.com.cn/zh";
/** 用户收藏的所有模型（收藏 tab -> 所有模型）。 */
const USER_FAVORITES_URL = "https://makerworld.com.cn/zh/@user_{handle}/collections/models";
const MODEL_URL = "https://makerworld.com.cn/zh/models/{id}";

interface MwModelCard {
  modelId: string;
  url: string;
  title: string;
  author?: string;
  authorId?: string;
  coverUrl?: string;
}

/**
 * MakerWorldAdapter（TDD Part 6.5）：
 * 收藏 = 用户默认收藏夹（/zh/collections/{id}）中的模型；
 * 站点有 Cloudflare 人机验证，需持久化 Profile（data/browser-profiles/makerworld）
 * 由 Engine 注入会话，本 Adapter 仅做 DOM 采集。
 */
export class MakerWorldAdapter extends BaseAdapter {
  readonly platform = "makerworld";
  readonly listUrl = "https://makerworld.com.cn/zh/collections/{collectionId}";
  readonly itemSelector = ".js-design-card";
  readonly titleSelector = "img[alt]";
  readonly urlSelector = "a[href*='/models/']";
  readonly authorSelector = ".design-author, [class*='designer']";
  readonly coverSelector = "img";
  readonly nextPage = "scroll";

  private requests = 0;
  private failures = 0;

  async authenticate(ctx: BrowserContext): Promise<void> {
    const page = await ctx.newPage();
    try {
      const status = await this.validateSession(page);
      if (status !== "valid") throw new Error("AUTH_002: makerworld session invalid");
    } finally {
      await page.close().catch(() => {});
    }
  }

  async validateSession(page: Page): Promise<"valid" | "invalid"> {
    try {
      await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(9000);
      const ok = await page.evaluate(() => {
        const bodyText = (document.body?.innerText ?? "").slice(0, 200);
        if (bodyText.includes("安全验证") || bodyText.includes("Just a moment")) return false;
        const userLink = Array.from(document.querySelectorAll("a"))
          .map((a) => a.getAttribute("href") ?? "")
          .find((h) => /\/@user_\d+/.test(h));
        const uploadBtn = Array.from(document.querySelectorAll("header a, header button, [class*='upload']"))
          .map((e) => ((e as HTMLElement).innerText || "").trim())
          .some((t) => /上传|发布/.test(t));
        return !!userLink || uploadBtn;
      });
      return ok ? "valid" : "invalid";
    } catch {
      return "invalid";
    }
  }

  async fetchCatalog(ctx: BrowserContext, cursor: SyncCursor): Promise<CollectionRaw[]> {
    const page = await ctx.newPage();
    try {
      const handle = await this.resolveUserHandle(page);
      if (!handle) throw new Error("AUTH_002: makerworld 未登录或无法定位用户（请确认已通过 Cloudflare 验证）");
      // 1) 用户收藏的所有模型列表
      await page.goto(USER_FAVORITES_URL.replace("{handle}", handle), {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(12000);
      await page.mouse.wheel(0, 2400);
      await this.withRandomDelay(1500, 4000);
      await page.mouse.wheel(0, 2400);
      await this.withRandomDelay(1500, 4000);

      const cards = await this.parseModelCards(page);
      if (cards.length === 0) return [];
      this.requests += 1;
      return cards.map((c) => ({
        platformItemId: c.modelId,
        url: c.url,
        title: c.title,
        author: c.author,
        coverUrl: c.coverUrl,
        collectedAt: new Date().toISOString(),
        saveType: "favorited" as const,
        extra: { contentType: "3dmodel", authorId: c.authorId },
      }));
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async resolveUserHandle(page: Page): Promise<string | null> {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(9000);
    return page.evaluate(() => {
      // 优先取 header/用户面板内的本人链接，避免误取其他创作者
      const scopes = [document.querySelector("header"), document.querySelector("[class*='header']"), document.body];
      for (const scope of scopes) {
        if (!scope) continue;
        const hrefs = Array.from(scope.querySelectorAll("a"))
          .map((a) => a.getAttribute("href") ?? "")
          .filter((h) => /\/@user_\d+/.test(h));
        if (hrefs.length > 0) {
          // 模板为 @user_{handle}，这里只取数字 id
          const m = /\/@user_(\d+)/.exec(hrefs[0]);
          if (m) return m[1];
        }
      }
      return null;
    });
  }

  private async parseModelCards(page: Page): Promise<Array<{ modelId: string; url: string; title: string; author?: string; authorId?: string; coverUrl?: string }>> {
    const cards = await page.evaluate(() => {
      const out: MwModelCard[] = [];
      const cards = Array.from(document.querySelectorAll("[class*='design-card'], a[href*='/models/']"));
      for (const node of cards) {
        const el = node as HTMLElement;
        const card = el.closest?.("[class*='design-card']") ?? el;
        const link = (card.querySelector?.("a[href*='/models/']") as HTMLAnchorElement | null) ?? (el as HTMLAnchorElement);
        const href = link?.href ?? "";
        const m = /\/models\/(\d+)/.exec(href);
        if (!m) continue;
        const trackId = card.getAttribute?.("data-trackid") ?? "";
        const modelId = trackId.split("_")[0] || m[1];
        const img = card.querySelector?.("img[alt]") as HTMLImageElement | null;
        const title =
          img?.getAttribute("alt") ??
          link?.getAttribute("title") ??
          card.querySelector?.("[class*='title']")?.textContent?.trim() ??
          link?.innerText?.trim() ??
          "";
        if (!title) continue;
        const authorEl = card.querySelector?.("[class*='designer'], [class*='author']");
        out.push({
          modelId,
          url: href.split("?")[0],
          title,
          author: authorEl?.textContent?.trim() || undefined,
          authorId: card.getAttribute?.("data-uid") ?? undefined,
          coverUrl: img?.src?.split("?")[0] || undefined,
        });
      }
      // 去重
      const seen = new Set<string>();
      return out.filter((c) => {
        if (seen.has(c.modelId)) return false;
        seen.add(c.modelId);
        return true;
      });
    });
    return cards;
  }

  async fetchDetail(ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    const id = extractMakerWorldId(url);
    if (!id) throw new Error(`MW_PARSE: cannot extract model id from ${url}`);
    const page = await ctx.newPage();
    try {
      await page.goto(MODEL_URL.replace("{id}", id), {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(10000);
      const info = await page.evaluate(() => {
        const text = (document.body?.innerText ?? "").replace(/\n{2,}/g, "\n").slice(0, 2000);
        const title = (document.querySelector("h1")?.textContent ?? "").trim();
        const descMatch = /简介[\s\S]{0,600}/.exec(text);
        const authorEl = document.querySelector("[class*='designer'] a, [class*='author'] a, [class*='designer'], [class*='author']");
        return {
          title,
          author: authorEl?.textContent?.trim() || undefined,
          description: descMatch?.[0]?.slice(0, 600) || text.slice(0, 400),
        };
      });
      return {
        title: info.title || undefined,
        author: info.author,
        description: info.description || undefined,
        contentType: "3dmodel",
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  normalize(raw: CollectionRaw, detail?: CollectionDetail): UniversalCollection {
    return {
      platform: this.platform,
      platformItemId: raw.platformItemId,
      url: raw.url,
      title: raw.title,
      author: raw.author,
      coverUrl: raw.coverUrl,
      description: detail?.description,
      contentType: "3dmodel",
      saveType: raw.saveType,
      collectedAt: raw.collectedAt,
      comments: [],
      status: detail?.deleted ? "deleted" : "active",
    };
  }

  async healthCheck() {
    return {
      platform: this.platform,
      parseFailureRate: this.failures / Math.max(this.requests, 1),
      slowPageRatio: 0,
      collectedAt: new Date().toISOString(),
    };
  }

  async cleanup(): Promise<void> {}
}
