import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MigrationManager, RuleCenter } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

let dataDir: string;
let manager: MigrationManager;
let rules: RuleCenter;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-rules-"));
  const migDir = path.join(dataDir, "migrations");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  manager = new MigrationManager(
    path.join(dataDir, "OmniCollector.db"),
    migDir,
    path.join(dataDir, "backup"),
  );
  manager.migrate();
  rules = new RuleCenter(manager.getDb());
});

afterAll(() => {
  manager.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("RuleCenter", () => {
  it("seeds 20 business rules and reads typed values", () => {
    expect(rules.get("ai_enabled")).toBe("false");
    expect(rules.getNumber("ai_daily_call_limit", 0)).toBe(50);
    expect(rules.getNumber("init_sync_full_limit", 0)).toBe(50);
    expect(rules.getBool("ai_enabled", true)).toBe(false);
    expect(rules.getBool("unknown_rule", true)).toBe(true);
    expect(rules.getNumber("unknown_rule", 7)).toBe(7);
  });

  it("persists set() and invalidates cache immediately", () => {
    rules.set("ai_enabled", "true");
    expect(rules.get("ai_enabled")).toBe("true");
    const fresh = new RuleCenter(manager.getDb());
    expect(fresh.get("ai_enabled")).toBe("true");
    rules.set("ai_enabled", "false");
    expect(rules.get("ai_enabled")).toBe("false");
  });

  it("serves stale value within TTL and fresh value after expiry", async () => {
    const ttl = new RuleCenter(manager.getDb(), 30);
    ttl.get("ai_daily_call_limit");
    manager
      .getDb()
      .prepare("UPDATE business_rules SET rule_value = '1' WHERE rule_key = 'ai_daily_call_limit'")
      .run();
    expect(ttl.get("ai_daily_call_limit")).toBe("50"); // 缓存未过期
    await new Promise((r) => setTimeout(r, 60));
    expect(ttl.get("ai_daily_call_limit")).toBe("1"); // 过期后读库
    manager
      .getDb()
      .prepare("UPDATE business_rules SET rule_value = '50' WHERE rule_key = 'ai_daily_call_limit'")
      .run();
  });

  it("resetAll restores defaults", () => {
    rules.set("ai_enabled", "true");
    rules.set("comment_fetch_default_count", "9");
    rules.resetAll();
    expect(rules.get("ai_enabled")).toBe("false");
    expect(rules.get("comment_fetch_default_count")).toBe("3");
  });
});
