import { describe, expect, it } from "vitest";
import { request, type BrowserContext, type Page } from "playwright";
import { BilibiliAdapter } from "@omni/adapters";
import { CookieCipher } from "../src/index.js";

const DATA_DIR = "D:/Github/My_Project/omni-collection/data";

const cookie = (() => {
  try {
    return new CookieCipher(DATA_DIR).decryptCookie("bilibili");
  } catch {
    return null;
  }
})();

describe.skipIf(!cookie)("BilibiliAdapter (live, real account)", () => {
  it(
    "validates session, pulls >=10 catalog items and 3 details",
    async (tctx) => {
      const api = await request.newContext({
        extraHTTPHeaders: {
          Cookie: cookie as string,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
      });
      const ctx = { request: api } as unknown as BrowserContext;
      const pageLike = { request: api } as unknown as Page;
      const adapter = new BilibiliAdapter();
      try {
        if ((await adapter.validateSession(pageLike)) !== "valid") {
          tctx.skip();
          return;
        }
        const catalog = await adapter.fetchCatalog(ctx, {});
        expect(catalog.length).toBeGreaterThanOrEqual(10);
        for (const raw of catalog.slice(0, 3)) {
          const detail = await adapter.fetchDetail(ctx, raw.url);
          expect(detail.description).toBeDefined();
          const uni = adapter.normalize(raw, detail);
          expect(uni.title).toBe(raw.title);
          expect(uni.comments.length).toBeLessThanOrEqual(3);
        }
      } finally {
        await api.dispose();
      }
    },
    90_000,
  );
});
