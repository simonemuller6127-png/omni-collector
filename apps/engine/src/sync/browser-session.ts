import fs from "node:fs";
import path from "node:path";
import type { BrowserContext } from "playwright";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { CookieCipher } from "../crypto/cookie-cipher.js";

chromium.use(stealth());

/** 明文 header 格式 cookie 的默认域名（B 站等以字符串存储）。 */
const DEFAULT_DOMAINS: Record<string, string> = {
  bilibili: ".bilibili.com",
  youtube: ".youtube.com",
  xiaohongshu: ".xiaohongshu.com",
  xiaoheihe: ".xiaoheihe.cn",
  makerworld: ".makerworld.com",
};

export interface StoredCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
}

/** 兼容 JSON 数组与 "k=v; k2=v2" 两种存储格式。 */
export function parseStoredCookies(plain: string, platform: string): StoredCookie[] {
  try {
    const arr = JSON.parse(plain);
    if (Array.isArray(arr)) {
      return arr.filter((c) => c && c.name && c.value);
    }
  } catch {
    /* 回退 header 格式 */
  }
  const domain = DEFAULT_DOMAINS[platform] ?? "";
  const out: StoredCookie[] = [];
  for (const pair of plain.split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    if (!name) continue;
    out.push({
      name,
      value: pair.slice(idx + 1).trim(),
      domain,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 30 * 86400,
    });
  }
  return out;
}

export interface BrowserSessionOptions {
  dataDir: string;
  headless?: boolean;
  proxy?: string;
}

/**
 * 浏览器会话管理器（Phase 4d）：
 * 按平台恢复已保存的登录会话（data/browser-states/{platform}.json），
 * 缺失时回退注入加密 Cookie（data/cookies/{platform}.enc）。
 * 登录态绑定浏览器指纹，因此优先持久化 storageState 而非裸 Cookie。
 */
export class BrowserSessionManager {
  constructor(private readonly options: BrowserSessionOptions) {}

  statePath(platform: string): string {
    return path.join(this.options.dataDir, "browser-states", `${platform}.json`);
  }

  profileDir(platform: string): string {
    return path.join(this.options.dataDir, "browser-profiles", platform);
  }

  /**
   * 创建持久化浏览器 Profile（指纹绑定类平台，如小红书）：
   * 登录态与浏览器指纹绑定，只有复用同一 user-data-dir 才能保持会话。
   * 首次登录后，后续 headless/headful 复用同一 Profile 即可维持登录。
   */
  async createPersistent(platform: string): Promise<BrowserContext> {
    const profileDir = this.profileDir(platform);
    fs.mkdirSync(profileDir, { recursive: true });
    return chromium.launchPersistentContext(profileDir, {
      headless: this.options.headless ?? true,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      viewport: { width: 1440, height: 900 },
      ...(this.options.proxy ? { proxy: { server: this.options.proxy } } : {}),
    });
  }

  async create(platform: string): Promise<BrowserContext> {
    const browser = await chromium.launch({ headless: this.options.headless ?? true });
    const statePath = this.statePath(platform);
    const context = await browser.newContext({
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      viewport: { width: 1440, height: 900 },
      ...(fs.existsSync(statePath) ? { storageState: statePath } : {}),
      ...(this.options.proxy ? { proxy: { server: this.options.proxy } } : {}),
    });
    // 加密 Cookie 为最新凭据，始终注入（覆盖 storageState 中的旧值）
    const cipher = new CookieCipher(this.options.dataDir);
    const plain = cipher.decryptCookie(platform);
    if (plain) {
      const stored = parseStoredCookies(plain, platform);
      if (stored.length > 0) {
        try {
          await context.addCookies(
            stored.map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain ?? DEFAULT_DOMAINS[platform] ?? "",
              path: c.path ?? "/",
              expires: c.expires ?? -1,
            })) as Parameters<BrowserContext["addCookies"]>[0],
          );
        } catch {
          /* 格式异常时忽略，交由 validateSession 判定 */
        }
      }
    }
    return context;
  }

  async save(ctx: BrowserContext, platform: string): Promise<void> {
    const dir = path.dirname(this.statePath(platform));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.statePath(platform), JSON.stringify(await ctx.storageState()), "utf8");
    const cookies = await ctx.cookies();
    new CookieCipher(this.options.dataDir).encryptCookie(platform, JSON.stringify(cookies));
  }

  async close(ctx: BrowserContext): Promise<void> {
    const browser = ctx.browser();
    await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
