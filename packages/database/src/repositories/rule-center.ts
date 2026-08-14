import type Database from "better-sqlite3";

interface CachedEntry {
  value: string | undefined;
  expiresAt: number;
}

export interface RuleEntry {
  rule_key: string;
  rule_value: string;
  default_value: string | null;
  description: string | null;
  impact: string | null;
  updated_at: string;
}

export interface RuleChange {
  id: number;
  rule_key: string;
  old_value: string | null;
  new_value: string;
  changed_at: string;
}

/**
 * 统一规则中心（TDD Part 3.3，SPEC S10 冻结）：
 * 所有业务数值/开关一律从 business_rules 读取，禁止硬编码。
 * 修改后缓存立即失效，Engine 下一次执行自动读取新配置，无需重启。
 */
export class RuleCenter {
  private readonly cache = new Map<string, CachedEntry>();
  private readonly ttlMs: number;

  constructor(
    private readonly db: Database.Database,
    ttlMs = 30_000,
  ) {
    this.ttlMs = ttlMs;
  }

  get(key: string): string | undefined {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    const row = this.db
      .prepare("SELECT rule_value FROM business_rules WHERE rule_key = ?")
      .get(key) as { rule_value: string } | undefined;
    const value = row?.rule_value;
    this.cache.set(key, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  getNumber(key: string, fallback: number): number {
    const value = this.get(key);
    if (value === undefined || value === "") return fallback;
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
  }

  getBool(key: string, fallback: boolean): boolean {
    const value = this.get(key);
    if (value === undefined) return fallback;
    return value === "true" || value === "1";
  }

  set(key: string, value: string): void {
    const old = this.get(key);
    this.db
      .prepare(
        `INSERT INTO business_rules(rule_key, rule_value)
         VALUES (?, ?)
         ON CONFLICT(rule_key) DO UPDATE SET
           rule_value = excluded.rule_value,
           updated_at = datetime('now')`,
      )
      .run(key, value);
    this.db
      .prepare(
        `INSERT INTO rule_change_log(rule_key, old_value, new_value)
         VALUES (?, ?, ?)`,
      )
      .run(key, old ?? null, value);
    this.cache.delete(key);
  }

  resetAll(): void {
    this.db
      .prepare(
        `UPDATE business_rules SET rule_value = default_value, updated_at = datetime('now')
         WHERE default_value IS NOT NULL`,
      )
      .run();
    this.cache.clear();
  }

  /** 规则中心表格数据（名称/当前值/默认值/说明/影响）。 */
  listAll(): RuleEntry[] {
    return this.db
      .prepare(
        `SELECT rule_key, rule_value, default_value, description, impact, updated_at
         FROM business_rules
         ORDER BY rule_key ASC`,
      )
      .all() as RuleEntry[];
  }

  /** 规则变更记录（最近 N 条）。 */
  recentChanges(limit = 50): RuleChange[] {
    return this.db
      .prepare(
        `SELECT id, rule_key, old_value, new_value, changed_at
         FROM rule_change_log
         ORDER BY changed_at DESC, id DESC
         LIMIT ?`,
      )
      .all(limit) as RuleChange[];
  }
}
