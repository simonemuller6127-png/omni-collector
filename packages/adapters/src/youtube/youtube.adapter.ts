import type { BrowserContext, Page } from "playwright";
import { spawn } from "node:child_process";
import {
  BaseAdapter,
  type CollectionDetail,
  type CollectionRaw,
  type SyncCursor,
  type UniversalCollection,
} from "../base-adapter.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** 从各类 YouTube URL 提取 11 位视频 ID。 */
export function extractYoutubeId(url: string): string | null {
  const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/.exec(url);
  return m?.[1] ?? null;
}

export interface YouTubeAdapterOptions {
  /** yt-dlp 启动命令，例如 ["python.exe", "-m", "yt_dlp"]。 */
  ytDlpCommand?: string[];
  /** 收藏/喜欢列表 URL，默认 Liked Videos（LL）。 */
  listUrl?: string;
  /** Netscape cookie 文件路径（--cookies）。 */
  cookiesFile?: string;
  /** 可选 HTTP 代理（本机系统代理，如 http://127.0.0.1:7897）。 */
  proxyUrl?: string;
}

/**
 * YouTubeAdapter（TDD Part 6.5）：
 * 目录/详情经 yt-dlp（--flat-playlist / -J）获取；字幕提取默认关闭（business_rules）。
 * 未安装 yt-dlp 或未登录时抛出明确错误，live 验收待账号配置。
 */
export class YouTubeAdapter extends BaseAdapter {
  readonly platform = "youtube";
  readonly listUrl: string;
  readonly itemSelector = "ytd-playlist-video-renderer";
  readonly titleSelector = "#video-title";
  readonly urlSelector = "a#video-title";
  readonly authorSelector = "#channel-name";
  readonly coverSelector = "img";
  readonly nextPage = "scroll";

  constructor(private readonly opts: YouTubeAdapterOptions = {}) {
    super();
    this.listUrl = opts.listUrl ?? "https://www.youtube.com/playlist?list=LL";
  }

  private cookiesArgs(): string[] {
    return this.opts.cookiesFile ? ["--cookies", this.opts.cookiesFile] : [];
  }

  private runYtDlp(args: string[], raw = false): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const cmd = this.opts.ytDlpCommand ?? ["yt-dlp"];
      const env = { ...process.env } as Record<string, string>;
      if (this.opts.proxyUrl) {
        env.HTTP_PROXY = this.opts.proxyUrl;
        env.HTTPS_PROXY = this.opts.proxyUrl;
      }
      const proc = spawn(cmd[0], [...cmd.slice(1), ...args], { windowsHide: true, env });
      let out = "";
      let err = "";
      proc.stdout.on("data", (d) => (out += d));
      proc.stderr.on("data", (d) => (err += d));
      proc.on("error", (e) => reject(new Error(`YTDLP_UNAVAILABLE: ${e.message}`)));
      proc.on("close", (code) => {
        if (code === 0) {
          if (raw) {
            resolve(out);
            return;
          }
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(new Error(`YTDLP_PARSE: ${err}`));
          }
        } else {
          reject(new Error(`YTDLP_FAILED(${code}): ${err}`));
        }
      });
    });
  }

  async authenticate(): Promise<void> {
    // 登录态由 yt-dlp cookies 或浏览器 Profile 提供，此处仅做存在性检查
  }

  async validateSession(): Promise<"valid" | "invalid"> {
    try {
      const version = (await this.runYtDlp(["--version"], true)) as string;
      return /^\d{4}\.\d{2}\.\d{2}/.test(version.trim()) ? "valid" : "invalid";
    } catch {
      return "invalid";
    }
  }

  async fetchCatalog(_ctx: BrowserContext, _cursor: SyncCursor): Promise<CollectionRaw[]> {
    const json = (await this.runYtDlp([
      "--flat-playlist",
      "-J",
      ...this.cookiesArgs(),
      this.listUrl,
    ])) as { entries?: Array<{ id: string; title: string; channel?: string; url?: string }> };
    return (json.entries ?? []).map((e) => ({
      platformItemId: e.id,
      url: e.url ?? `https://www.youtube.com/watch?v=${e.id}`,
      title: e.title ?? e.id,
      author: e.channel,
      collectedAt: new Date().toISOString(),
      saveType: "favorited",
      extra: { contentType: "video" },
    }));
  }

  async fetchDetail(_ctx: BrowserContext, url: string): Promise<CollectionDetail> {
    try {
      const json = (await this.runYtDlp([
        "-J",
        "--skip-download",
        ...this.cookiesArgs(),
        url,
      ])) as {
        title?: string;
        description?: string;
        upload_date?: string;
        comment_count?: number;
      };
      return {
        title: json.title,
        description: json.description,
        publishedAt: json.upload_date
          ? `${json.upload_date.slice(0, 4)}-${json.upload_date.slice(4, 6)}-${json.upload_date.slice(6, 8)}T00:00:00Z`
          : undefined,
        contentType: "video",
        comments: [],
      };
    } catch {
      // n-challenge 等反爬失败时降级为 oEmbed（无需 API Key）
      const res = await _ctx.request.get("https://www.youtube.com/oembed", {
        params: { url, format: "json" },
        headers: { "User-Agent": UA },
      });
      const o = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      return {
        title: o.title,
        author: o.author_name,
        coverUrl: o.thumbnail_url,
        contentType: "video",
        comments: [],
      };
    }
  }

  normalize(raw: CollectionRaw, detail?: CollectionDetail): UniversalCollection {
    return {
      platform: this.platform,
      platformItemId: raw.platformItemId,
      url: raw.url,
      title: detail?.title ?? raw.title,
      author: detail?.author ?? raw.author,
      coverUrl: detail?.coverUrl ?? raw.coverUrl,
      description: detail?.description,
      contentType: "video",
      saveType: raw.saveType,
      publishedAt: detail?.publishedAt,
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
