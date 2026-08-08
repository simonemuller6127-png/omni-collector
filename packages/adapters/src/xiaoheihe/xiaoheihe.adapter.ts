import type { BrowserContext, Page, Response } from "playwright";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";

/** 小黑盒游戏 ID：/app/{id}、/game/{id}。 */
export function extractXiaoheiheId(url: string): string | null {
  const m = /\/(?:app|game)\/(\d+)/.exec(url);
  return m?.[1] ?? null;
}

/** 小黑盒帖子（收藏的 bbs link）ID：/app/bbs/link/{id}。 */
export function extractXiaoheiheLinkId(url: string): string | null {
  const m = /\/app\/bbs\/link\/(\d+)/.exec(url);
  return m?.[1] ?? null;
}

const HOME_URL = "https://www.xiaoheihe.cn/";
/** 收藏页直连 URL（收藏 tab 实际导航目标）。 */
const FAVOURS_URL = "https://www.xiaoheihe.cn/app/user/favour/content";
/** 收藏列表接口（页面自身的 hkey/nonce 签名请求）：result.links[].link。 */
const FAV_API_RE = /\/bbs\/app\/profile\/fav\/folder\/v2\/links/;
/** restore_login：登录态校验 + 取当前用户 id。 */
const RESTORE_API_RE = /\/account\/restore_login/;

export interface XhhFavoriteItem {
  itemId: string;
  title: string;
  url: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  collectedAt?: string;
  contentType: "post" | "game";
  topic?: string;
  video?: boolean;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/**
 * 解析小黑盒收藏接口 fav/folder/v2/links 响应。
 * 结构：result.links[].link，含 linkid/title/description/user/imgs/topics/create_at。
 */
export function parseXhhFavoritePayload(json: unknown): XhhFavoriteItem[] {
  const root = asRecord(json);
  if (!root) return [];
  const result = asRecord(root.result) ?? root;
  const links = Array.isArray(result.links) ? result.links : [];
  const out: XhhFavoriteItem[] = [];
  for (const raw of links) {
    const wrapper = asRecord(raw);
    const link = asRecord(wrapper?.link) ?? wrapper;
    if (!link) continue;
    const linkid = link.linkid ?? link.link_id ?? link.id;
    if (!linkid) continue;
    const user = asRecord(link.user);
    const topics = Array.isArray(link.topics) ? (link.topics as unknown[]) : [];
    const topic = asRecord(topics[0]);
    const imgs = Array.isArray(link.imgs) ? (link.imgs as string[]) : [];
    const thumbs = Array.isArray(link.thumbs) ? (link.thumbs as string[]) : [];
    const isDeleted = Number(link.is_deleted ?? 0) === 1;
    if (isDeleted) continue;
    const createAt = Number(link.create_at ?? 0);
    const appId = link.app_id ?? topic?.app_id;
    const contentType: "post" | "game" =
      typeof appId === "number" && appId > 0 ? "game" : "post";
    out.push({
      itemId: String(linkid),
      title: String(link.title ?? ""),
      url: `https://www.xiaoheihe.cn/app/bbs/link/${linkid}`,
      author: (user?.username ?? link.author_name) as string | undefined,
      coverUrl: (imgs[0] ?? thumbs[0] ?? link.pic_url) as string | undefined,
      description: link.description as string | undefined,
      collectedAt: createAt ? new Date(createAt * 1000).toISOString() : undefined,
      contentType,
      topic: topic?.name as string | undefined,
      video: Number(link.has_video ?? 0) === 1,
    });
  }
  return out;
}

/**
 * XiaoheiheAdapter（TDD Part 6.5）：
 * 浏览器驱动采集，依赖页面自身生成的 hkey/nonce/_time 签名请求；
 * 收藏页路径：社区 -> 头像 -> 我的主页 -> 收藏（实际内容为帖子收藏）。
 */
export class XiaoheiheAdapter extends BaseAdapter {
  readonly platform = "xiaoheihe";
  readonly listUrl = "https://www.xiaoheihe.cn/app/user/favour/content";
  readonly itemSelector = ".game-item";
  readonly titleSelector = ".game-name";
  readonly urlSelector = "a";
  readonly authorSelector = ".studio";
  readonly coverSelector = "img";
  readonly nextPage = "click";

  private requests = 0;
  private failures = 0;

  async authenticate(ctx: BrowserContext): Promise<void> {
    const page = await ctx.newPage();
    try {
      const status = await this.validateSession(page);
      if (status !== "valid") throw new Error("AUTH_002: xiaoheihe session invalid");
    } finally {
      await page.close().catch(() => {});
    }
  }

  async validateSession(page: Page): Promise<"valid" | "invalid"> {
    try {
      await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(8000);
      const state = await page.evaluate(() => {
        const header = document.querySelector("header") ?? document.body;
        const loginBtn = Array.from(header.querySelectorAll("a, button, span"))
          .map((e) => ((e as HTMLElement).innerText || "").trim())
          .filter((t) => t === "登录").length;
        const avatar = Array.from(header.querySelectorAll("img[src*='avatar']")).length;
        return { loginBtn, avatar };
      });
      return state.avatar > 0 && state.loginBtn === 0 ? "valid" : "invalid";
    } catch {
      return "invalid";
    }
  }

  /** 通过页面自身的 restore_login 响应取当前用户 heybox_id。 */
  private async resolveUserId(page: Page): Promise<string | null> {
    let userId: string | null = null;
    const onResponse = async (res: Response) => {
      if (!RESTORE_API_RE.test(res.url())) return;
      try {
        const j = (await res.json()) as {
          result?: { profile?: { heybox_id?: string }; account_detail?: { userid?: string } };
        };
        userId =
          j?.result?.profile?.heybox_id ??
          j?.result?.account_detail?.userid ??
          null;
      } catch {
        /* 忽略 */
      }
    };
    page.on("response", onResponse);
    try {
      await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(8000);
      return userId;
    } finally {
      page.off("response", onResponse);
    }
  }

  async fetchCatalog(ctx: BrowserContext, cursor: SyncCursor): Promise<CollectionRaw[]> {
    const page = await ctx.newPage();
    const captured: unknown[] = [];
    const onResponse = async (res: Response) => {
      if (FAV_API_RE.test(res.url())) {
        try {
          captured.push(await res.json());
        } catch {
          /* 忽略 */
        }
      }
    };
    page.on("response", onResponse);
    try {
      const userId = await this.resolveUserId(page);
      if (!userId) throw new Error("AUTH_002: xiaoheihe 未登录，无法读取收藏（请在 Engine 注入有效会话）");
      await page.goto(FAVOURS_URL, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(10000);
      // 循环滚动分页：直到收藏 API 不再返回新数据（上限 6 轮）
      for (let round = 0; round < 6; round += 1) {
        if (page.isClosed()) break;
        const before = captured.flatMap((j) => parseXhhFavoritePayload(j)).length;
        await page.mouse.wheel(0, 2200);
        await this.withRandomDelay(1200, 3000);
        const after = captured.flatMap((j) => parseXhhFavoritePayload(j)).length;
        if (after === before) break;
      }

      const items = captured.flatMap((j) => parseXhhFavoritePayload(j));
      if (items.length > 0) {
        return items.map((it) => ({
          platformItemId: it.itemId,
          url: it.url,
          title: it.title || "小黑盒收藏",
          author: it.author,
          coverUrl: it.coverUrl,
          collectedAt: it.collectedAt,
          saveType: "favorited" as const,
          extra: {
            contentType: it.contentType,
            topic: it.topic,
            video: it.video,
            description: it.description,
          },
        }));
      }
      // 页面可能被 SPA 自动关闭：关闭后不再触碰 DOM，仅返回已抓到的 API 数据
      if (!page.isClosed()) return this.parseDomFavorites(page);
      return [];
    } finally {
      page.off("response", onResponse);
      await page.close().catch(() => {});
    }
  }

  private async parseDomFavorites(page: Page): Promise<CollectionRaw[]> {
    const items = await page.evaluate(() => {
      const out: Array<{ href: string; title: string; author?: string; cover?: string }> = [];
      const nodes = Array.from(document.querySelectorAll("a[href*='/app/bbs/link/']"));
      for (const a of nodes) {
        const href = (a as HTMLAnchorElement).href;
        if (!/\/app\/bbs\/link\/\d+/.test(href)) continue;
        const card = a.parentElement ?? a;
        const title = (card.querySelector(".title")?.textContent ?? a.getAttribute("title") ?? "").trim();
        const author = (card.querySelector(".author")?.textContent ?? "").trim();
        const cover = (card.querySelector("img")?.getAttribute("src") ?? "").split("?")[0];
        out.push({ href, title, author: author || undefined, cover: cover || undefined });
      }
      return out;
    });
    return items.map((it) => ({
      platformItemId: extractXiaoheiheLinkId(it.href) ?? it.href,
      url: it.href,
      title: it.title || "小黑盒收藏",
      author: it.author,
      coverUrl: it.cover,
      saveType: "favorited" as const,
      extra: { contentType: "post" },
    }));
  }

  async fetchDetail(ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    const linkId = extractXiaoheiheLinkId(url);
    if (linkId) {
      const page = await ctx.newPage();
      try {
        await page.goto(`https://www.xiaoheihe.cn/app/bbs/link/${linkId}`, {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });
        await page.waitForTimeout(7000);
        const info = await page.evaluate(() => {
          const text = (document.body?.innerText ?? "").slice(0, 4000);
          const title = (document.querySelector("h1")?.textContent ?? "").trim();
          return { text, title };
        });
        return {
          title: info.title || undefined,
          description: info.text.slice(0, 800) || undefined,
          contentType: "post",
        };
      } finally {
        await page.close().catch(() => {});
      }
    }
    const id = extractXiaoheiheId(url);
    if (!id) throw new Error(`XHH_PARSE: cannot extract id from ${url}`);
    const page = await ctx.newPage();
    try {
      await page.goto(`https://xiaoheihe.cn/game/${id}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(7000);
      const info = await page.evaluate(() => {
        const text = (document.body?.innerText ?? "").slice(0, 3000);
        const meta: Record<string, string> = {};
        for (const [label, re] of [
          ["studio", /(?:开发商|厂商|发行商)[:：\s]*([^\n]{1,40})/],
          ["rating", /(?:评分|好评率)[:：\s]*([0-9.]+%?)/],
          ["duration", /(?:时长|游戏时长)[:：\s]*([0-9.]+小时?)/],
          ["release", /(?:发售|发行日期|上线时间)[:：\s]*([0-9-]{4,10})/],
        ] as Array<[string, RegExp]>) {
          const m = re.exec(text);
          if (m) meta[label] = m[1].trim();
        }
        const title = (document.querySelector("h1")?.textContent ?? document.title.replace(/[-_].*$/, "")).trim();
        return { title, meta };
      });
      return {
        title: info.title,
        description: info.meta.studio ? `开发商/厂商：${info.meta.studio}` : undefined,
        contentType: "game",
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  normalize(raw: CollectionRaw, detail?: CollectionDetail): UniversalCollection {
    const contentType = (raw.extra?.contentType as string | undefined) ?? "post";
    return {
      platform: this.platform,
      platformItemId: raw.platformItemId,
      url: raw.url,
      title: raw.title,
      author: raw.author,
      coverUrl: raw.coverUrl,
      description: detail?.description,
      contentType,
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
