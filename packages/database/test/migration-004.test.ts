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

describe("migration 004: makerworld_sync_likes rule", () => {
  it("seeds the rule with default false", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-m004-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    manager.migrate();
    const rules = new RuleCenter(manager.getDb());
    expect(rules.get("makerworld_sync_likes")).toBe("false");
    expect(rules.getBool("makerworld_sync_likes", true)).toBe(false);
    // 设置后可读回
    rules.set("makerworld_sync_likes", "true");
    expect(rules.getBool("makerworld_sync_likes", false)).toBe(true);
    manager.close();
  });
});
