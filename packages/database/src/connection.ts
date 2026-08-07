import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Omni Collector 数据目录结构（TDD Part 2.3，ADR-014 冻结）。
 * 数据库/备份/Cookie/缓存/日志/迁移全部位于用户指定数据目录，
 * 不随插件升级或卸载删除，不放在 Obsidian Vault 或插件目录。
 */
export const DATA_SUBDIRS = ["backup", "cookies", "cache", "logs", "migrations"] as const;

export function ensureDataDir(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const sub of DATA_SUBDIRS) {
    fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
  }
}

/**
 * 打开 SQLite 主库（TDD Part 2.1）。
 * 强制 PRAGMA：WAL、外键、busy_timeout，保证并发读写与数据一致性。
 */
export function openDatabase(dataDir: string): Database.Database {
  ensureDataDir(dataDir);
  const db = new Database(path.join(dataDir, "OmniCollector.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}
