import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { XiaohongshuAdapter } from "@omni/adapters";
import { CookieCipher } from "../src/index.js";

const DATA_DIR = "D:/Github/My_Project/omni-collection/data";
chromium.use(stealth());

const cookieJson = (() => {
  try {
    return new CookieCipher(DATA_DIR).decryptCookie("xiaohongshu");
  } catch {
    return null;
  }
})();

describe.skipIf(!cookieJson)("XiaohongshuAdapter (live, encrypted cookies)", () => {
  it(
    "validates session and pulls favorites with detail",
    async (tctx) => {
      const browser = await chromium.launch({ headless: true });
      const ctx = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Shanghai", viewport: { width: 1440, height: 900 } });
      const cookies = JSON.parse(cookieJson as string)
        .filter((c: { name?: string; value?: string }) => c && c.name && c.value)
        .map((c: Record<string, unknown>) => ({
          ...c,
          sameSite: ["Strict", "Lax", "None"].includes(c.sameSite as string) ? c.sameSite : undefined,
          expires: typeof c.expirationDate === "number" ? (c.expirationDate as number) : -1,
        }));
      await ctx.addCookies(cookies);
      try {
        const adapter = new XiaohongshuAdapter();
        const page = await ctx.newPage();
        try {
          const status = await adapter.validateSession(page);
          if (status !== "valid") {
            tctx.skip("XHS 会话为游客态/无效，跳过 live 测试");
            return;
          }
        } finally {
          await page.close().catch(() => {});
        }
        const catalog = await adapter.fetchCatalog(ctx, {});
        expect(catalog.length).toBeGreaterThanOrEqual(1);
        const raw = catalog[0];
        expect(raw.url).toMatch(/xiaohongshu\.com\//);
        const detail = await adapter.fetchDetail(ctx, raw.url);
        expect(detail.contentType).toBeDefined();
        const uni = adapter.normalize(raw, detail);
        expect(uni.platform).toBe("xiaohongshu");
        expect(uni.title).toBe(raw.title);
      } finally {
        await browser.close();
      }
    },
    240_000,
  );
});
