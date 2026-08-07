import type Database from "better-sqlite3";

interface CachedEntry {
  value: string | undefined;
  expiresAt: number;
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
    this.db
      .prepare(
        `INSERT INTO business_rules(rule_key, rule_value)
         VALUES (?, ?)
         ON CONFLICT(rule_key) DO UPDATE SET
           rule_value = excluded.rule_value,
           updated_at = datetime('now')`,
      )
      .run(key, value);
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
}
