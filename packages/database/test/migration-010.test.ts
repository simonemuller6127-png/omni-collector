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

describe("migration 010: AI 标签策略拆分 + 热门评论规则", () => {
  it("seeds all six AI tag/comment rules with correct defaults and non-empty docs", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-m010-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    manager.migrate();
    expect(manager.getDb().pragma("user_version", { simple: true })).toBe(10);
    const rules = new RuleCenter(manager.getDb());

    // 数值类
    expect(rules.get("ai_tag_max_count")).toBe("7");
    expect(rules.getNumber("ai_comment_context_limit", 0)).toBe(5);
    expect(rules.getNumber("ai_duplicate_tag_min_count", 0)).toBe(20);
    expect(rules.getNumber("ai_duplicate_tag_report_limit", 0)).toBe(20);
    // 开关类
    expect(rules.getBool("ai_content_tag_enabled", false)).toBe(true);
    expect(rules.getBool("ai_content_type_enabled", false)).toBe(true);

    // 六条规则都有 description/impact（人工可审阅）
    const keys = [
      "ai_tag_max_count",
      "ai_comment_context_limit",
      "ai_content_tag_enabled",
      "ai_content_type_enabled",
      "ai_duplicate_tag_min_count",
      "ai_duplicate_tag_report_limit",
    ];
    const all = rules.listAll();
    for (const k of keys) {
      const entry = all.find((r) => r.rule_key === k);
      expect(entry, k).toBeDefined();
      expect((entry!.description ?? "").length, k).toBeGreaterThan(0);
      expect((entry!.impact ?? "").length, k).toBeGreaterThan(0);
    }

    // 设置后可读回
    rules.set("ai_tag_max_count", "5");
    expect(rules.getNumber("ai_tag_max_count", 0)).toBe(5);
    manager.close();
  });
});
