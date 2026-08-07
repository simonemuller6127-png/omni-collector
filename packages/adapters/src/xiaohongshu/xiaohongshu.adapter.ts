import type { BrowserContext } from "playwright";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";

/** 小红书笔记 ID：/explore/{id}、/discovery/item/{id} 或 xhslink 短链。 */
export function extractXiaohongshuId(url: string): string | null {
  const m = /(?:explore|discovery\/item|note)\/([0-9a-zA-Z]+)/.exec(url);
  return m?.[1] ?? null;
}

/**
 * XiaohongshuAdapter（TDD Part 6.5）：
 * 风控严格，依赖 playwright-stealth + 随机延迟；图片下载默认关闭。
 * 收藏夹采集需登录态，live 验收待账号 Cookie。
 */
export class XiaohongshuAdapter extends BaseAdapter {
  readonly platform = "xiaohongshu";
  readonly listUrl = "https://www.xiaohongshu.com/user/profile/favorites";
  readonly itemSelector = ".note-item";
  readonly titleSelector = ".title";
  readonly urlSelector = "a";
  readonly authorSelector = ".author";
  readonly coverSelector = "img.cover";
  readonly nextPage = "scroll";

  async authenticate(): Promise<void> {
    // 登录态由 Engine Playwright 层注入 Cookie；此处仅校验由 validateSession 负责
  }

  async validateSession(): Promise<"valid" | "invalid"> {
    return "invalid"; // 无浏览器上下文时无法确认；live 环境由 SyncPipeline 注入真实 Context
  }

  async fetchCatalog(_ctx: BrowserContext, _cursor: SyncCursor): Promise<CollectionRaw[]> {
    throw new Error("AUTH_002: xiaohongshu 需要登录态与浏览器上下文（live 验收待账号配置）");
  }

  async fetchDetail(_ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    const id = extractXiaohongshuId(url);
    if (!id) throw new Error(`XHS_PARSE: cannot extract note id from ${url}`);
    return { contentType: "note" };
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
      contentType: detail?.contentType ?? "note",
      saveType: raw.saveType,
      collectedAt: raw.collectedAt,
      comments: detail?.comments ?? [],
      status: "active",
    };
  }

  async healthCheck() {
    return {
      platform: this.platform,
      parseFailureRate: 0,
      slowPageRatio: 0,
      collectedAt: new Date().toISOString(),
    };
  }

  async cleanup(): Promise<void> {}
}
