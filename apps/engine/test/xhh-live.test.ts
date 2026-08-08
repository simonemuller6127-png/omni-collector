import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { XiaoheiheAdapter } from "@omni/adapters";
import { BrowserSessionManager } from "../src/index.js";

const DATA_DIR = "D:/Github/My_Project/omni-collection/data";
const hasSession = fs.existsSync(`${DATA_DIR}/browser-states/xiaoheihe.json`);

describe.skipIf(!hasSession || process.env.OMNI_RUN_LIVE !== "1")("XiaoheiheAdapter (live, saved browser session)", () => {
  it(
    "validates session and pulls favorites with detail",
    async (tctx) => {
      // 站点可达性预检：不可达/限流时跳过，不硬等
      try {
        const res = await fetch("https://www.xiaoheihe.cn/", { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          tctx.skip();
          return;
        }
      } catch {
        tctx.skip();
        return;
      }
      const manager = new BrowserSessionManager({ dataDir: DATA_DIR });
      const ctx = await manager.create("xiaoheihe");
      try {
        const adapter = new XiaoheiheAdapter();
        const page = await ctx.newPage();
        try {
          if ((await adapter.validateSession(page)) !== "valid") {
            tctx.skip();
            return;
          }
        } finally {
          await page.close().catch(() => {});
        }
        const catalog = await adapter.fetchCatalog(ctx, {});
        expect(catalog.length).toBeGreaterThanOrEqual(1);
        const raw = catalog[0];
        expect(raw.url).toMatch(/xiaoheihe\.cn\//);
        const detail = await adapter.fetchDetail(ctx, raw.url);
        expect(detail.contentType).toBeDefined();
        const uni = adapter.normalize(raw, detail);
        expect(uni.platform).toBe("xiaoheihe");
        expect(uni.title).toBe(raw.title);
      } finally {
        await manager.close(ctx);
      }
    },
    180_000,
  );
});
