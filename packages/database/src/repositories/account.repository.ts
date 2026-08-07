import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { PlatformAccountRow } from "../types.js";

/** 平台账号与同步游标仓储（TDD Part 2.4.3）。 */
export class AccountRepository {
  constructor(private readonly db: Database.Database) {}

  getOrCreate(platform: string): PlatformAccountRow {
    this.db
      .prepare(
        `INSERT INTO platform_accounts (id, platform, status)
         VALUES (?, ?, 'inactive')
         ON CONFLICT(platform) DO NOTHING`,
      )
      .run(randomUUID(), platform);
    return this.db.prepare("SELECT * FROM platform_accounts WHERE platform = ?").get(platform) as
      PlatformAccountRow;
  }

  updateCursor(platform: string, cursor: string): void {
    this.db
      .prepare(
        "UPDATE platform_accounts SET sync_cursor = ?, last_sync_at = ?, status = 'active', updated_at = ? WHERE platform = ?",
      )
      .run(cursor, new Date().toISOString(), new Date().toISOString(), platform);
  }

  setStatus(platform: string, status: PlatformAccountRow["status"], errorReason?: string): void {
    this.db
      .prepare(
        "UPDATE platform_accounts SET status = ?, error_reason = ?, updated_at = ? WHERE platform = ?",
      )
      .run(status, errorReason ?? null, new Date().toISOString(), platform);
  }
}
