import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { SyncLogRow } from "../types.js";

export interface NewSyncLog {
  adapter: string;
  task_type: string;
  started_at?: string;
  finished_at?: string;
  status: "success" | "failed" | "retrying";
  items_added?: number;
  items_updated?: number;
  error_code?: string;
  error_detail?: string;
}

export class SyncLogRepository {
  constructor(private readonly db: Database.Database) {}

  add(entry: NewSyncLog): SyncLogRow {
    this.db
      .prepare(
        `INSERT INTO sync_log
         (id, adapter, task_type, started_at, finished_at, status, items_added, items_updated, error_code, error_detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        entry.adapter,
        entry.task_type,
        entry.started_at ?? null,
        entry.finished_at ?? null,
        entry.status,
        entry.items_added ?? 0,
        entry.items_updated ?? 0,
        entry.error_code ?? null,
        entry.error_detail ?? null,
      );
    return this.db
      .prepare("SELECT * FROM sync_log ORDER BY created_at DESC LIMIT 1")
      .get() as SyncLogRow;
  }

  list(adapter?: string, limit = 20): SyncLogRow[] {
    const sql = adapter
      ? "SELECT * FROM sync_log WHERE adapter = ? ORDER BY created_at DESC LIMIT ?"
      : "SELECT * FROM sync_log ORDER BY created_at DESC LIMIT ?";
    return (adapter ? this.db.prepare(sql).all(adapter, limit) : this.db.prepare(sql).all(limit)) as SyncLogRow[];
  }
}
