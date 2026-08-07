import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import { CollectionRepository, MigrationManager } from "@omni/database";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("Phase 6 performance: 10k rows < 500ms (Dataview-style queries)", () => {
  it(
    "runs dashboard/list queries within budget",
    () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-perf-"));
      tmpDirs.push(dataDir);
      const migDir = path.join(dataDir, "migrations");
      fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const collections = new CollectionRepository(db);

      // 灌入 1 万条
      const insert = db.prepare(
        `INSERT INTO collections
         (id, platform, platform_item_id, url, title, author, content_type, save_type,
          content_status, sync_status, catalog_synced, detail_synced, inbox_status,
          organize_status, priority, collected_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'video', 'favorited', 'active', 'full', 1, 1, 'done', ?, ?, ?, ?, ?)`,
      );
      const stamp = new Date().toISOString();
      const now = Date.now();
      for (let i = 0; i < 10_000; i += 1) {
        insert.run(
          `perf-${i}`,
          ["bilibili", "youtube", "xiaohongshu", "makerworld", "xiaoheihe"][i % 5],
          `item-${i}`,
          `https://example.com/${i}`,
          `收藏标题 ${i}`,
          `作者${i % 100}`,
          i % 3 === 0 ? "unorganized" : "organized",
          i % 7 === 0 ? "important" : "normal",
          new Date(now - i * 60000).toISOString(),
          stamp,
          stamp,
        );
      }

      const measure = (fn: () => unknown): number => {
        const t0 = performance.now();
        fn();
        return performance.now() - t0;
      };

      // Dataview 模板等价查询
      const tUnorganized = measure(() => collections.listByOrganizeStatus("unorganized"));
      const tAll = measure(() => collections.listAll());
      const tCount = measure(() => {
        db.prepare("SELECT COUNT(*) AS n FROM collections WHERE priority = 'important'").get();
      });
      const tPending = measure(() => collections.listPendingInbox());

      expect(tUnorganized).toBeLessThan(500);
      expect(tAll).toBeLessThan(500);
      expect(tCount).toBeLessThan(500);
      expect(tPending).toBeLessThan(500);
      expect(collections.count()).toBe(10_000);
      manager.close();
    },
    120_000,
  );
});
