import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import { MigrationManager, RuleCenter } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("migration 007: sync rules + rule change log", () => {
  it("seeds schedule/AI rules and rule_change_log", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-m007-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    manager.migrate();
    const db = manager.getDb();
    const rules = new RuleCenter(db);
    expect(rules.get("bilibili_sync_frequency")).toBe("daily");
    expect(rules.getNumber("init_full_detail_limit", 0)).toBe(50);
    expect(rules.getNumber("sync_random_window_minutes", 0)).toBe(120);
    expect(rules.getNumber("daily_sync_cap_per_platform", 0)).toBe(3);
    expect(rules.getNumber("comment_batch_update_days", 0)).toBe(7);
    expect(rules.getBool("ai_tag_enabled", false)).toBe(true);
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rule_change_log'").get();
    expect(table).toBeTruthy();
    const all = rules.listAll();
    expect(all.length).toBeGreaterThan(30);
    expect(all.find((r) => r.rule_key === "ai_enabled")?.impact).toContain("全局开关");
    manager.close();
  });
});
