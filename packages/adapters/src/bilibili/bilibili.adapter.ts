import type { BrowserContext, Page } from "playwright";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type RawComment,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";
import { getMixinKey, signParams } from "./wbi.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const NAV_URL = "https://api.bilibili.com/x/web-interface/nav";
const FOLDERS_URL = "https://api.bilibili.com/x/v3/fav/folder/created/list-all";
const FAV_LIST_URL = "https://api.bilibili.com/x/v3/fav/resource/list";
const VIEW_URL = "https://api.bilibili.com/x/web-interface/view";
const REPLY_URL = "https://api.bilibili.com/x/v2/reply";

/** 从视频详情中提取合集（ugc_season）归属。 */
export function extractUgcSeason(json: unknown): { id: number; title: string; seasonId: number; epCount: number } | null {
  const data = (json as { data?: { ugc_season?: { id?: number; title?: string; season_id?: number; ep_count?: number } } })?.data;
  const ugc = data?.ugc_season;
  if (!ugc || !ugc.title) return null;
  return {
    id: ugc.id ?? 0,
    title: ugc.title,
    seasonId: ugc.season_id ?? 0,
    epCount: ugc.ep_count ?? 0,
  };
}

interface FavoriteFolder {
  id: number;
  title: string;
}

/**
 * BilibiliAdapter（TDD Part 6.5，Phase 3 单平台闭环）。
 * 采集走 B 站 Web API（经 Playwright request 上下文，Cookie 由 Engine 注入），
 * 关键接口带 wbi 签名；DOM 选择器保留供页面抓取兜底。
 */
export class BilibiliAdapter extends BaseAdapter {
  readonly platform = "bilibili";
  readonly listUrl = "https://space.bilibili.com/{uid}/favlist?fid={fid}";
  readonly itemSelector = ".fav-video-item";
  readonly titleSelector = ".title";
  readonly urlSelector = "a";
  readonly authorSelector = ".name";
  readonly coverSelector = "img";
  readonly nextPage = "click";

  private requests = 0;
  private failures = 0;

  async authenticate(ctx: BrowserContext): Promise<void> {
    // Cookie 由 Engine 的 Playwright 层通过 ctx.addCookies 注入，此处仅校验
    const session = await this.validateSession(ctx.request as unknown as Page);
    if (session !== "valid") {
      throw new Error("AUTH_002: bilibili session invalid");
    }
  }

  /** page 可传真实 Page 或 APIRequestContext（authenticate 传入 ctx.request）。 */
  async validateSession(page: Page): Promise<"valid" | "invalid"> {
    try {
      // Page 有 .request；直接传 APIRequestContext 时就地使用，不能再用 .request 二次解引用
      const req = (page as { request?: Page["request"] }).request ?? (page as unknown as Page["request"]);
      const res = await req.get(NAV_URL, { headers: { "User-Agent": UA } });
      const json = (await res.json()) as {
        code: number;
        data?: { isLogin?: boolean; mid?: number };
      };
      return json.code === 0 && json.data?.isLogin === true ? "valid" : "invalid";
    } catch {
      return "invalid";
    }
  }

  async fetchCatalog(ctx: BrowserContext, cursor: SyncCursor): Promise<CollectionRaw[]> {
    // 会话失效时 nav 拿不到 mid，绝不能静默返回空列表（会被当成"同步完成 0 条"）
    const mid = await this.requireLogin(ctx);
    const folders = await this.getFavoriteFolders(ctx, mid);
    if (folders.length === 0) return [];
    const mixinKey = await this.mixinKey(ctx);
    const rawItems: Array<{ bvid: string; title: string; cover: string; fav_time: number; upper?: { name?: string }; watchLater?: boolean }> = [];
    // 遍历全部收藏夹（上限 20 个），每个取前 15 页（默认收藏夹可到 278+ 条）
    for (const folder of folders.slice(0, 20)) {
      for (let pn = 1; pn <= 15; pn += 1) {
        const params = signParams(
          { media_id: String(folder.id), pn: String(pn), ps: '20', platform: 'web' },
          mixinKey,
        );
        // 风控/瞬时网络错误重试一次；仍失败则整体报错，绝不静默丢弃剩余页
        let json: {
          code: number;
          data?: { medias?: BilibiliMedia[]; has_more?: boolean };
        } | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          this.requests += 1;
          try {
            const res = await ctx.request.get(FAV_LIST_URL, { params, headers: { 'User-Agent': UA } });
            const parsed = (await res.json()) as {
              code: number;
              data?: { medias?: BilibiliMedia[]; has_more?: boolean };
            };
            if (parsed.code === 0) {
              json = parsed;
              break;
            }
          } catch {
            // 走重试
          }
          if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
        }
        if (!json || json.code !== 0) {
          this.failures += 1;
          throw new Error(`SYNC_001: B站收藏列表接口失败（收藏夹「${folder.title}」第 ${pn} 页, code=${json?.code ?? "network"}），本次同步中止以免漏单`);
        }
        const medias = json.data?.medias ?? [];
        for (const m of medias) {
          rawItems.push({ bvid: m.bvid, title: m.title, cover: m.cover, fav_time: m.fav_time, upper: m.upper });
        }
        if (!json.data?.has_more || medias.length === 0) break;
        await new Promise((r) => setTimeout(r, 500)); // 风控友好：请求间隔
      }
    }
    // 稍后再看列表（watch later）
    try {
      const wlParams = signParams({ pn: "1", ps: "50" }, mixinKey);
      const wlRes = await ctx.request.get("https://api.bilibili.com/x/v2/medialist/watch/later/list", {
        params: wlParams,
        headers: { "User-Agent": UA },
      });
      const wl = (await wlRes.json()) as {
        code: number;
        data?: { list?: Array<{ bvid?: string; title?: string; pic?: string; upper?: { name?: string }; add_at?: number }> };
      };
      if (wl.code === 0) {
        for (const m of wl.data?.list ?? []) {
          if (!m.bvid) continue;
          rawItems.push({ bvid: m.bvid, title: m.title ?? "", cover: m.pic ?? "", fav_time: m.add_at ?? 0, upper: m.upper, watchLater: true });
        }
      }
    } catch {
      // 稍后再看不可用时忽略
    }
    const seen = new Set<string>();
    return rawItems
      .filter((m) => {
        if (seen.has(m.bvid)) return false;
        seen.add(m.bvid);
        return true;
      })
      .map((m) => ({
        platformItemId: m.bvid,
        url: `https://www.bilibili.com/video/${m.bvid}`,
        title: m.title,
        author: m.upper?.name,
        coverUrl: m.cover,
        collectedAt: m.fav_time ? new Date(m.fav_time * 1000).toISOString() : new Date().toISOString(),
        saveType: (m.watchLater ? "watch_later" : "favorited") as "favorited" | "watch_later",
        extra: { contentType: 'video' },
      }));
  }


  async fetchDetail(ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    const bvid = /(BV[0-9A-Za-z]+)/.exec(url)?.[1];
    if (!bvid) throw new Error(`BilibiliAdapter: cannot extract bvid from ${url}`);
    this.requests += 1;
    const viewRes = await ctx.request.get(VIEW_URL, {
      params: { bvid },
      headers: { "User-Agent": UA },
    });
    const view = (await viewRes.json()) as {
      code: number;
      data?: { aid: number; title: string; desc: string; pic: string; pubdate: number; duration: number };
    };
    if (view.code !== 0) {
      this.failures += 1;
      // 稿件删除/不可见/仅自见：标记 deleted 而不是抛错，避免单条失效视频中断整个深度同步
      if (view.code === -404 || view.code === 62002 || view.code === 62012) {
        return {
          description: undefined,
          transcript: undefined,
          comments: [],
          contentType: "video",
          deleted: true,
        };
      }
      throw new Error(`B站 view error code=${view.code}`);
    }
    const aid = view.data?.aid;
    let comments: RawComment[] = [];
    if (aid) {
      const replyRes = await ctx.request.get(REPLY_URL, {
        params: { type: "1", oid: String(aid), ps: "10", sort: "2" },
        headers: { "User-Agent": UA },
      });
      const reply = (await replyRes.json()) as {
        code: number;
        data?: { replies?: Array<{ rpid: number; member?: { uname: string }; content?: { message: string }; like: number; ctime: number }> };
      };
      if (reply.code === 0 && reply.data?.replies) {
        comments = reply.data.replies.map((r) => ({
          commentId: String(r.rpid),
          author: r.member?.uname ?? "",
          content: r.content?.message ?? "",
          likeCount: r.like ?? 0,
          postedAt: r.ctime ? new Date(r.ctime * 1000).toISOString() : undefined,
        }));
      }
    }
    const ugc = extractUgcSeason(view);
    const baseDesc = view.data?.desc ?? "";
    const description = ugc ? `所属合集：${ugc.title}（共 ${ugc.epCount} 集）\n${baseDesc}` : baseDesc;
    return {
      description,
      transcript: undefined,
      comments,
      publishedAt: view.data?.pubdate ? new Date(view.data.pubdate * 1000).toISOString() : undefined,
      contentType: "video",
      deleted: view.code !== 0,
    };
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
      transcript: detail?.transcript,
      contentType: detail?.contentType ?? "video",
      saveType: raw.saveType,
      collectedAt: raw.collectedAt,
      publishedAt: detail?.publishedAt,
      comments: detail?.comments ?? [],
      status: detail?.deleted ? "deleted" : "active",
    };
  }

  async healthCheck() {
    return {
      platform: this.platform,
      parseFailureRate: this.requests === 0 ? 0 : this.failures / this.requests,
      slowPageRatio: 0,
      lastError: this.failures > 0 ? "recent failures detected" : undefined,
      collectedAt: new Date().toISOString(),
    };
  }

  async cleanup(): Promise<void> {
    this.requests = 0;
    this.failures = 0;
  }

  private async getFavoriteFolders(ctx: BrowserContext, mid: number): Promise<FavoriteFolder[]> {
    const mixinKey = await this.mixinKey(ctx);
    const params = signParams({ up_mid: String(mid) }, mixinKey);
    const res = await ctx.request.get(FOLDERS_URL, {
      params,
      headers: { "User-Agent": UA },
    });
    const json = (await res.json()) as {
      code: number;
      data?: { list?: Array<{ id: number; title: string }> };
    };
    if (json.code !== 0) {
      this.failures += 1;
      throw new Error(`B站 folders error code=${json.code}`);
    }
    return (json.data?.list ?? []).map((f) => ({ id: f.id, title: f.title }));
  }

  /** 校验登录态并返回 mid；未登录时抛 AUTH_002（由管线展示给用户，提示重新登录）。 */
  private async requireLogin(ctx: BrowserContext): Promise<number> {
    const navRes = await ctx.request.get(NAV_URL, { headers: { "User-Agent": UA } });
    const nav = (await navRes.json()) as {
      code: number;
      data?: { isLogin?: boolean; mid?: number };
    };
    if (nav.code !== 0 || !nav.data?.isLogin || !nav.data?.mid) {
      throw new Error("AUTH_002: bilibili 未登录或会话已失效，请在插件设置中重新登录");
    }
    return nav.data.mid;
  }

  private async mixinKey(ctx: BrowserContext): Promise<string> {
    const res = await ctx.request.get(NAV_URL, { headers: { "User-Agent": UA } });
    const json = (await res.json()) as {
      data?: { wbi_img?: { img_url?: string; sub_url?: string } };
    };
    const keyOf = (u: string | undefined): string => u?.split("/").pop()?.split(".")[0] ?? "";
    return getMixinKey(keyOf(json.data?.wbi_img?.img_url), keyOf(json.data?.wbi_img?.sub_url));
  }
}

interface BilibiliMedia {
  id: number;
  bvid: string;
  title: string;
  cover: string;
  fav_time: number;
  upper?: { name: string };
}
