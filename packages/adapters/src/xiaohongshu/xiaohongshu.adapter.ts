import type { BrowserContext, Page, Response } from "playwright";
import { Client } from "xhshow-js";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";

/** 小红书笔记 ID：explore/{id}、discovery/item/{id} 或 xhslink 短链。 */
export function extractXiaohongshuId(url: string): string | null {
  const m = /(?:explore|discovery\/item|note)\/([0-9a-zA-Z]+)/.exec(url);
  return m?.[1] ?? null;
}

const EXPLORE_URL = "https://www.xiaohongshu.com/explore";
/** 收藏列表接口（2026 现网路径；旧的 user_post/favorited 已废弃）。 */
const COLLECT_API = "/api/sns/web/v2/note/collect/page";
const SELF_API = "/api/sns/web/v2/user/me";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

export interface XhsFavoritedNote {
  noteId: string;
  title: string;
  author?: string;
  coverUrl?: string;
  video?: boolean;
  xsecToken?: string;
}

function pick(obj: Record<string, unknown> | undefined | null, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/**
 * 解析收藏列表接口（collect/page）响应。
 * 兼容 feed 风格 noteCard 与扁平 note 两种结构，字段命名做多义归一。
 */
export function parseXhsFavoritedNotes(json: unknown): XhsFavoritedNote[] {
  const root = asRecord(json);
  if (!root) return [];
  const data = asRecord(root.data) ?? root;
  const rawNotes = Array.isArray(data.notes)
    ? data.notes
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.note_list)
        ? data.note_list
        : [];
  const out: XhsFavoritedNote[] = [];
  for (const raw of rawNotes) {
    const note = asRecord(raw);
    if (!note) continue;
    const card = asRecord(note.noteCard) ?? note;
    const noteId =
      (pick(card, ["noteId", "note_id", "id"]) as string | undefined) ??
      (pick(note, ["noteId", "note_id", "id"]) as string | undefined);
    if (!noteId) continue;
    const user = asRecord(card.user) ?? asRecord(note.user) ?? null;
    const cover = asRecord(card.cover) ?? asRecord(note.cover) ?? null;
    const title =
      (pick(card, ["displayTitle", "display_title", "title", "note_title"]) as string | undefined) ??
      (pick(note, ["displayTitle", "display_title", "title", "note_title"]) as string | undefined) ??
      "";
    const coverUrl =
      (pick(cover, ["url", "urlDefault", "url_pre"]) as string | undefined) ??
      (Array.isArray(note.image_list) && note.image_list.length > 0
        ? (pick(asRecord(note.image_list[0]), ["url", "urlDefault"]) as string | undefined)
        : undefined);
    const type = pick(card, ["type", "modelType", "content_type"]) as string | undefined;
    const xsecToken =
      (pick(card, ["xsec_token", "xsecToken"]) as string | undefined) ??
      (pick(note, ["xsec_token", "xsecToken"]) as string | undefined);
    out.push({
      noteId: String(noteId),
      title,
      author: pick(user, ["nickname", "name"]) as string | undefined,
      coverUrl,
      video: type === "video",
      xsecToken,
    });
  }
  return out;
}

/**
 * XiaohongshuAdapter（TDD Part 6.5）：
 * 小红书对自动化浏览器有设备信任检测（扫码登录后仍判游客），
 * 因此以「x-s 签名直连」（xhshow-js）为主路径，浏览器驱动为兜底。
 * Cookie 由 Engine 注入 BrowserContext，本 Adapter 不接触明文凭据。
 */
export class XiaohongshuAdapter extends BaseAdapter {
  readonly platform = "xiaohongshu";
  readonly listUrl = "https://www.xiaohongshu.com/user/profile/{userId}";
  readonly itemSelector = ".note-item";
  readonly titleSelector = ".title";
  readonly urlSelector = "a";
  readonly authorSelector = ".author";
  readonly coverSelector = "img.cover";
  readonly nextPage = "scroll";

  private requests = 0;
  private failures = 0;
  /** noteId -> xsec_token（收藏接口返回，详情页反爬令牌）。 */
  private readonly xsecTokens = new Map<string, string>();

  async authenticate(ctx: BrowserContext): Promise<void> {
    const page = await ctx.newPage();
    try {
      const status = await this.validateSession(page);
      if (status !== "valid") throw new Error("AUTH_002: xiaohongshu session invalid");
    } finally {
      await page.close().catch(() => {});
    }
  }

  async validateSession(page: Page): Promise<"valid" | "invalid"> {
    try {
      const ctx = page.context();
      const cookies = await ctx.cookies();
      const jar = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
      if (jar.a1 && jar.web_session) {
        const me = await this.signedGet(ctx, "/api/sns/web/v2/user/me", {}, jar);
        if (me?.data?.guest === false) return "valid";
        if (me?.data?.guest === true) return "invalid"; // 明确游客态，无需再开浏览器兜底
      }
      await page.goto(EXPLORE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(4000);
      const loggedIn = await page.evaluate(
        () => !!((window as unknown as { __INITIAL_STATE__?: { user?: { loggedIn?: boolean } } }).__INITIAL_STATE__?.user?.loggedIn),
      );
      return loggedIn ? "valid" : "invalid";
    } catch {
      return "invalid";
    }
  }

  async fetchCatalog(ctx: BrowserContext, cursor: SyncCursor): Promise<CollectionRaw[]> {
    const cookies = await ctx.cookies();
    const jar = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
    if (jar.a1 && jar.web_session) {
      try {
        const items = await this.fetchCatalogSigned(ctx, cursor, jar);
        if (items.length > 0) return items;
      } catch (err) {
        if ((err as Error).message.startsWith("AUTH_")) throw err;
        // 签名路径异常时回退浏览器驱动
      }
    }
    return this.fetchCatalogBrowser(ctx);
  }

  /** x-s 签名直连：user/me 校验 + collect/page 拉取收藏。 */
  private async fetchCatalogSigned(
    ctx: BrowserContext,
    cursor: SyncCursor,
    jar: Record<string, string>,
  ): Promise<CollectionRaw[]> {
    const me = await this.signedGet(ctx, SELF_API, {}, jar);
    const userId = (me?.data?.user_id ?? me?.data?.userId) as string | undefined;
    const guest = me?.data?.guest === true;
    if (!userId || guest) {
      throw new Error("AUTH_002: xiaohongshu 会话为游客态，请用真实浏览器登录后更新 Cookie");
    }
    const params = {
      user_id: userId,
      cursor: cursor.lastItemId ?? "",
      num: 30,
    } as Record<string, string | number>;
    const body = await this.signedGet(ctx, COLLECT_API, params, jar);
    const notes = parseXhsFavoritedNotes(body);
    return notes.map((n, i) => {
      if (n.xsecToken) this.xsecTokens.set(n.noteId, n.xsecToken);
      return {
        platformItemId: n.noteId,
        url: `https://www.xiaohongshu.com/explore/${n.noteId}`,
        title: n.title || `小红书笔记 ${n.noteId}`,
        author: n.author,
        coverUrl: n.coverUrl,
        saveType: "favorited" as const,
        extra: { contentType: n.video ? "video" : "note", video: n.video, index: i },
      };
    });
  }

  private async signedPost(
    ctx: BrowserContext,
    uri: string,
    payload: Record<string, string | number | boolean | object | unknown[]>,
    jar: Record<string, string>,
  ): Promise<{ code?: number; msg?: string; data?: { items?: Array<{ note_card?: Record<string, unknown> }> } }> {
    const a1 = jar.a1 ?? "";
    if (!a1) throw new Error("AUTH_002: xiaohongshu 缺少 a1 cookie");
    const client = new Client();
    const xs = client.signXS("POST", uri, a1, "xhs-pc-web", payload);
    const xt = client.getXT();
    const xsCommon = client.signXSCommon({ a1, web_session: jar.web_session ?? "" });
    this.requests += 1;
    const res = await ctx.request.post(`https://edith.xiaohongshu.com${uri}`, {
      data: payload,
      headers: {
        "x-s": xs,
        "x-t": String(xt),
        "x-s-common": xsCommon,
        "x-b3-traceid": client.getB3TraceId(),
        "x-xray-traceid": client.getXrayTraceId(),
        "content-type": "application/json;charset=UTF-8",
        "User-Agent": UA,
        Referer: "https://www.xiaohongshu.com/",
        accept: "application/json",
      },
    });
    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: { items?: Array<{ note_card?: Record<string, unknown> }> };
    };
    if (json.code !== 0) {
      this.failures += 1;
      throw new Error(`XHS_API: ${uri} code=${json.code ?? "?"} msg=${json.msg ?? ""}`);
    }
    return json;
  }

  private async signedGet(
    ctx: BrowserContext,
    uri: string,
    params: Record<string, string | number>,
    jar: Record<string, string>,
  ): Promise<{
    code?: number;
    msg?: string;
    data?: { guest?: boolean; user_id?: string; userId?: string; [k: string]: unknown };
  }> {
    const a1 = jar.a1 ?? "";
    if (!a1) throw new Error("AUTH_002: xiaohongshu 缺少 a1 cookie");
    const client = new Client();
    const xs = client.signXS("GET", uri, a1, "xhs-pc-web", params);
    const xt = client.getXT();
    const xsCommon = client.signXSCommon({ a1, web_session: jar.web_session ?? "" });
    const b3 = client.getB3TraceId();
    const xray = client.getXrayTraceId();
    this.requests += 1;
    const res = await ctx.request.get(`https://edith.xiaohongshu.com${uri}`, {
      params,
      headers: {
        "x-s": xs,
        "x-t": String(xt),
        "x-s-common": xsCommon,
        "x-b3-traceid": b3,
        "x-xray-traceid": xray,
        "User-Agent": UA,
        Referer: "https://www.xiaohongshu.com/",
        accept: "application/json",
      },
    });
    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: { guest?: boolean; user_id?: string; userId?: string; [k: string]: unknown };
    };
    if (json.code !== 0) {
      this.failures += 1;
      throw new Error(`XHS_API: ${uri} code=${json.code ?? "?"} msg=${json.msg ?? ""}`);
    }
    return json;
  }

  /** 浏览器驱动兜底：打开个人主页收藏 tab，捕获页面自身的签名请求或解析 DOM。 */
  private async fetchCatalogBrowser(ctx: BrowserContext): Promise<CollectionRaw[]> {
    const page = await ctx.newPage();
    const captured: unknown[] = [];
    const onResponse = async (res: Response) => {
      if (COLLECT_API.split("?")[0].endsWith("collect/page") && res.url().includes("collect/page")) {
        try {
          captured.push(await res.json());
        } catch {
          /* 忽略不可解析响应 */
        }
      }
    };
    page.on("response", onResponse);
    try {
      const userId = await this.resolveUserId(page);
      if (!userId) throw new Error("AUTH_002: xiaohongshu 未登录，无法读取收藏（请在 Engine 注入有效会话）");
      await page.goto(`https://www.xiaohongshu.com/user/profile/${userId}?tab=favorite`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(6000);
      const favTab = page.getByText("收藏", { exact: true }).first();
      if ((await favTab.count()) > 0) {
        await favTab.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(4000);
      }
      await page.mouse.wheel(0, 2400);
      await this.withRandomDelay(1500, 4000);
      await page.mouse.wheel(0, 2400);
      await this.withRandomDelay(1500, 4000);

      const notes = captured.flatMap((j) => parseXhsFavoritedNotes(j));
      if (notes.length > 0) {
        return notes.map((n, i) => {
          if (n.xsecToken) this.xsecTokens.set(n.noteId, n.xsecToken);
          return {
            platformItemId: n.noteId,
            url: `https://www.xiaohongshu.com/explore/${n.noteId}`,
            title: n.title || `小红书笔记 ${n.noteId}`,
            author: n.author,
            coverUrl: n.coverUrl,
            collectedAt: undefined,
            saveType: "favorited" as const,
            extra: { contentType: n.video ? "video" : "note", video: n.video, index: i },
          };
        });
      }
      return this.parseDomFavorites(page);
    } finally {
      page.off("response", onResponse);
      await page.close().catch(() => {});
    }
  }

  private async resolveUserId(page: Page): Promise<string | null> {
    try {
      await page.goto(EXPLORE_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(5000);
    } catch {
      // 继续尝试读取已渲染状态
    }
    return page.evaluate(() => {
      const st = (window as unknown as { __INITIAL_STATE__?: { user?: { userInfo?: { userId?: string } } } }).__INITIAL_STATE__;
      return st?.user?.userInfo?.userId ?? null;
    });
  }

  private async parseDomFavorites(page: Page): Promise<CollectionRaw[]> {
    const items = await page.evaluate(() => {
      const out: Array<{ href: string; title: string; author?: string; cover?: string }> = [];
      const nodes = Array.from(document.querySelectorAll("a[href*='/explore/'], a[href*='/discovery/item/']"));
      for (const a of nodes) {
        const href = (a as HTMLAnchorElement).href;
        const m = /(?:explore|discovery\/item)\/([0-9a-zA-Z]+)/.exec(href);
        if (!m) continue;
        const card = a.closest(".note-item") ?? a.parentElement ?? a;
        const title = (card.querySelector(".title")?.textContent ?? a.getAttribute("title") ?? "").trim();
        const author = (card.querySelector(".author")?.textContent ?? "").trim();
        const cover = (card.querySelector("img")?.getAttribute("src") ?? "").split("?")[0];
        out.push({ href, title, author: author || undefined, cover: cover || undefined });
      }
      return out;
    });
    return items.map((it) => {
      const id = extractXiaohongshuId(it.href);
      const m = /xsec_token=([^&]+)/.exec(it.href);
      if (id && m?.[1]) this.xsecTokens.set(id, decodeURIComponent(m[1]));
      return {
        platformItemId: id ?? it.href,
        url: it.href,
        title: it.title || `小红书笔记`,
        author: it.author,
        coverUrl: it.cover,
        saveType: "favorited" as const,
      };
    });
  }

  async fetchDetail(_ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    const id = extractXiaohongshuId(url);
    if (!id) throw new Error(`XHS_PARSE: cannot extract note id from ${url}`);
    // 签名 feed API 优先（需要 xsec_token）
    const token = this.xsecTokens.get(id);
    if (token) {
      try {
        const jar = Object.fromEntries((await _ctx.cookies()).map((c) => [c.name, c.value]));
        const body = await this.signedPost(_ctx, "/api/sns/web/v1/feed", {
          source_note_id: id,
          image_formats: ["jpg", "webp", "avif"],
          extra: { need_body_topic: "1" },
          xsec_source: "pc_feed",
          xsec_token: token,
        }, jar);
        const note = body?.data?.items?.[0]?.note_card;
        if (note) {
          const user = asRecord(note.user);
          const imageList = Array.isArray(note.image_list) ? (note.image_list as unknown[]) : [];
          const time = note.time as number | undefined;
          const publishedAt =
            typeof time === "number" && time > 0
              ? new Date(time > 1e12 ? time : time * 1000).toISOString()
              : undefined;
          return {
            title: note.title as string | undefined,
            author: user?.nickname as string | undefined,
            coverUrl:
              (asRecord(imageList[0])?.urlDefault as string | undefined) ??
              (asRecord(imageList[0])?.url as string | undefined),
            description: note.desc as string | undefined,
            contentType: note.type === "video" ? "video" : "note",
            publishedAt,
            comments: [],
          };
        }
      } catch {
        // 签名详情失败时回退浏览器 SSR
      }
    }
    // 浏览器 SSR 兜底（公开笔记页；无 xsec_token 时可能 404）
    const page = await _ctx.newPage();
    try {
      await page.goto(`https://www.xiaohongshu.com/explore/${id}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(6000);
      const detail = await page.evaluate((noteId) => {
        const st = (window as unknown as {
          __INITIAL_STATE__?: { note?: { noteDetailMap?: Record<string, { note?: Record<string, unknown> }> } };
        }).__INITIAL_STATE__;
        const entry = st?.note?.noteDetailMap?.[noteId]?.note;
        if (!entry) return null;
        return {
          title: (entry.title as string | undefined) ?? "",
          desc: (entry.desc as string | undefined) ?? "",
          author: (entry.user as { nickname?: string } | undefined)?.nickname,
          cover:
            ((entry.imageList as Array<{ urlDefault?: string; url?: string }> | undefined)?.[0]?.urlDefault ??
              (entry.imageList as Array<{ urlDefault?: string; url?: string }> | undefined)?.[0]?.url) ??
            "",
          type: (entry.type as string | undefined) ?? "normal",
          time: (entry.time as number | undefined) ?? null,
        };
      }, id);
      if (!detail) return { contentType: "note" };
      return {
        title: detail.title,
        author: detail.author,
        coverUrl: detail.cover,
        description: detail.desc,
        contentType: detail.type === "video" ? "video" : "note",
        publishedAt: detail.time ? new Date(detail.time * 1000).toISOString() : undefined,
        comments: [],
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
      contentType: detail?.contentType ?? (raw.extra?.video ? "video" : "note"),
      saveType: raw.saveType,
      collectedAt: raw.collectedAt,
      comments: detail?.comments ?? [],
      status: "active",
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
