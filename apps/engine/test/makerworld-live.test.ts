import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { MakerWorldAdapter } from "@omni/adapters";
import { BrowserSessionManager } from "../src/index.js";

const DATA_DIR = "D:/Github/My_Project/omni-collection/data";
const hasProfile = fs.existsSync(`${DATA_DIR}/browser-profiles/makerworld`);

describe.skipIf(!hasProfile)("MakerWorldAdapter (live, persistent profile)", () => {
  it(
    "validates session and pulls favorited models with detail",
    async () => {
      const manager = new BrowserSessionManager({ dataDir: DATA_DIR, headless: false });
      const ctx = await manager.createPersistent("makerworld");
      try {
        const adapter = new MakerWorldAdapter();
        const page = await ctx.newPage();
        try {
          expect(await adapter.validateSession(page)).toBe("valid");
        } finally {
          await page.close().catch(() => {});
        }
        const catalog = await adapter.fetchCatalog(ctx, {});
        expect(catalog.length).toBeGreaterThanOrEqual(1);
        const raw = catalog[0];
        expect(raw.url).toMatch(/makerworld\.com\.cn\/zh\/models\//);
        const detail = await adapter.fetchDetail(ctx, raw.url);
        expect(detail.contentType).toBe("3dmodel");
        const uni = adapter.normalize(raw, detail);
        expect(uni.platform).toBe("makerworld");
        expect(uni.title).toBe(raw.title);
      } finally {
        await manager.close(ctx);
      }
    },
    240_000,
  );
});
