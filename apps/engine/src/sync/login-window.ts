import type { BrowserContext } from "playwright";
import { MakerWorldAdapter, XiaoheiheAdapter } from "@omni/adapters";
import { BrowserSessionManager } from "./browser-session.js";

/**
 * 可视化登录引导（PRD 26.1 ②③）：
 * 打开有头浏览器窗口，用户在窗口里自行登录（插件不接触账号密码），
 * 引擎轮询登录态，成功后自动捕获 storageState 并加密保存 Cookie（仅本地，不上传）。
 */

export const LOGIN_URLS: Record<string, string> = {
  bilibili: "https://passport.bilibili.com/login",
  youtube: "https://www.youtube.com/",
  xiaohongshu: "https://www.xiaohongshu.com/explore",
  makerworld: "https://makerworld.com/zh",
  xiaoheihe: "https://www.xiaoheihe.cn/",
};

/** Cookie 登录标记：命中任一非空标记即认为已登录。 */
export const LOGIN_COOKIE_MARKERS: Record<string, string[]> = {
  bilibili: ["SESSDATA"],
  youtube: ["SAPISID", "SID"],
  xiaohongshu: ["web_session"],
  // Cloudflare/页面态平台无稳定 Cookie 标记，走 validateSession 页面探测兜底
  makerworld: [],
  xiaoheihe: [],
};

const PAGE_DETECT_PLATFORMS = new Set(["makerworld", "xiaoheihe"]);

export function hasLoginMarker(
  platform: string,
  cookies: Array<{ name: string; value?: string }>,
): boolean {
  const markers = LOGIN_COOKIE_MARKERS[platform] ?? [];
  return markers.some((m) => cookies.some((c) => c.name === m && !!c.value));
}

export interface LoginWindowOptions {
  platform: string;
  dataDir: string;
  proxy?: string;
  /** 等待用户完成登录的时长，默认 300s，限制 60~540s（客户端请求超时 600s）。 */
  timeoutSeconds?: number;
}

export interface LoginWindowResult {
  loggedIn: boolean;
  cookieCount: number;
  reason?: string;
}

export async function runLoginWindow(opts: LoginWindowOptions): Promise<LoginWindowResult> {
  const timeoutMs = Math.min(Math.max((opts.timeoutSeconds ?? 300) * 1000, 60_000), 540_000);
  const pollMs = PAGE_DETECT_PLATFORMS.has(opts.platform) ? 7000 : 2500;
  const sessions = new BrowserSessionManager({ dataDir: opts.dataDir, headless: false, proxy: opts.proxy });

  // 登录窗口始终用持久化 Profile：保持指纹稳定，规避风控/Cloudflare
  const ctx = await sessions.createPersistent(opts.platform);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const closed = new Promise<"closed">((resolve) => {
    ctx.on("close", () => resolve("closed"));
  });

  let loggedIn = false;
  let reason: string | undefined;

  try {
    await page
      .goto(LOGIN_URLS[opts.platform] ?? "about:blank", { waitUntil: "domcontentloaded", timeout: 90_000 })
      .catch((e) => {
        reason = `打开登录页失败：${(e as Error).message}`;
      });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const winner = await Promise.race([
        closed,
        new Promise<"tick">((r) => {
          setTimeout(() => r("tick"), pollMs);
        }),
      ]);
      if (winner === "closed") {
        reason = reason ?? "窗口被用户关闭";
        break;
      }
      try {
        if (await detectLogin(opts.platform, ctx)) {
          loggedIn = true;
          break;
        }
      } catch {
        // 单次探测失败继续轮询
      }
    }
    if (!loggedIn && !reason && Date.now() >= deadline) reason = "等待登录超时";
  } finally {
    if (loggedIn) {
      // 捕获会话：storageState 落盘 + Cookie 加密保存（data/cookies/*.enc）
      await sessions.save(ctx, opts.platform).catch(() => {});
    }
    await sessions.close(ctx).catch(() => {});
  }

  const cookieCount = loggedIn ? await refetchCookies(opts.platform, opts.dataDir) : 0;
  return {
    loggedIn,
    cookieCount,
    ...(reason ? { reason } : {}),
  };
}

async function detectLogin(platform: string, ctx: BrowserContext): Promise<boolean> {
  const cookies = await ctx.cookies();
  if (hasLoginMarker(platform, cookies)) return true;
  if (PAGE_DETECT_PLATFORMS.has(platform)) {
    const p = ctx.pages()[0];
    if (!p) return false;
    const adapter = platform === "makerworld" ? new MakerWorldAdapter() : new XiaoheiheAdapter();
    return (await adapter.validateSession(p)) === "valid";
  }
  return false;
}

/** 登录成功后从加密存储回读 Cookie 数量（与 COOKIE_STATUS 口径一致）。 */
async function refetchCookies(platform: string, dataDir: string): Promise<number> {
  try {
    const { CookieCipher } = await import("../crypto/cookie-cipher.js");
    const { parseStoredCookies } = await import("./browser-session.js");
    const plain = new CookieCipher(dataDir).decryptCookie(platform);
    return plain ? parseStoredCookies(plain, platform).length : 0;
  } catch {
    return 0;
  }
}
