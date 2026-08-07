import type { BrowserContext } from "playwright";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";

/** 小黑盒游戏 ID：/app/{id} 或 /game/{id}。 */
export function extractXiaoheiheId(url: string): string | null {
  const m = /\/(?:app|game)\/(\d+)/.exec(url);
  return m?.[1] ?? null;
}

export class XiaoheiheAdapter extends BaseAdapter {
  readonly platform = "xiaoheihe";
  readonly listUrl = "https://api.xiaoheihe.cn/game/all_game";
  readonly itemSelector = ".game-item";
  readonly titleSelector = ".game-name";
  readonly urlSelector = "a";
  readonly authorSelector = ".studio";
  readonly coverSelector = "img";
  readonly nextPage = "click";

  async authenticate(): Promise<void> {}
  async validateSession(): Promise<"valid"> {
    return "valid";
  }

  async fetchCatalog(_ctx: BrowserContext, _cursor: SyncCursor): Promise<CollectionRaw[]> {
    throw new Error("XIAOHEIHE_PENDING: live 采集待实现（每周一次轻量元数据）");
  }

  async fetchDetail(_ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    const id = extractXiaoheiheId(url);
    if (!id) throw new Error(`XHH_PARSE: cannot extract game id from ${url}`);
    return { contentType: "game" };
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
      contentType: "game",
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
