import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { XiaohongshuAdapter } from "@omni/adapters";
import { BrowserSessionManager } from "../src/index.js";

const DATA_DIR = "D:/Github/My_Project/omni-collection/data";
const hasSession = fs.existsSync(`${DATA_DIR}/browser-states/xiaohongshu.json`);

describe.skipIf(!hasSession)("XiaohongshuAdapter (live, saved browser session)", () => {
  it(
    "validates session and pulls favorites with detail",
    async (tctx) => {
      const manager = new BrowserSessionManager({ dataDir: DATA_DIR });
      const ctx = await manager.create("xiaohongshu");
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
        await manager.close(ctx);
      }
    },
    240_000,
  );
});
