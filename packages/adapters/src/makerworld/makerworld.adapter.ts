import type { BrowserContext } from "playwright";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";

/** MakerWorld 模型 ID：/zh/models/{id}~{slug}。 */
export function extractMakerWorldId(url: string): string | null {
  const m = /models\/(\d+)/.exec(url);
  return m?.[1] ?? null;
}

export class MakerWorldAdapter extends BaseAdapter {
  readonly platform = "makerworld";
  readonly listUrl = "https://makerworld.com/zh/models?sort=recommend";
  readonly itemSelector = ".model-item";
  readonly titleSelector = ".model-title";
  readonly urlSelector = "a";
  readonly authorSelector = ".designer-name";
  readonly coverSelector = "img";
  readonly nextPage = "click";

  async authenticate(): Promise<void> {}
  async validateSession(): Promise<"valid"> {
    return "valid";
  }

  async fetchCatalog(_ctx: BrowserContext, _cursor: SyncCursor): Promise<CollectionRaw[]> {
    throw new Error("MAKERWORLD_PENDING: live 采集待实现（每周一次轻量元数据）");
  }

  async fetchDetail(_ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    const id = extractMakerWorldId(url);
    if (!id) throw new Error(`MW_PARSE: cannot extract model id from ${url}`);
    return { contentType: "3dmodel" };
  }

  normalize(raw: CollectionRaw, detail?: CollectionDetail): UniversalCollection {
    return {
      platform: this.platform,
      platformItemId: raw.platformItemId,
      url: raw.url,
      title: raw.title,
      author: raw.author,
      coverUrl: raw.coverUrl,
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
      parseFailureRate: 0,
      slowPageRatio: 0,
      collectedAt: new Date().toISOString(),
    };
  }

  async cleanup(): Promise<void> {}
}
