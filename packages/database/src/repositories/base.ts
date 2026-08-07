import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface Entity {
  id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Repository 基类（TDD Part 3.3）。
 * 表名由子类常量提供并做白名单校验，杜绝 SQL 注入；
 * 业务模块禁止绕过 Repository 直接执行 SQL（ADR-013）。
 */
export abstract class BaseRepository<T extends Entity> {
  protected readonly table: string;

  constructor(
    protected readonly db: Database.Database,
    table: string,
  ) {
    if (!/^[a-z_]+$/.test(table)) {
      throw new Error(`invalid table name: ${table}`);
    }
    this.table = table;
  }

  findById(id: string): T | undefined {
    return this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id) as T | undefined;
  }

  create(row: Partial<T> & { id?: string }): T {
    const id = row.id ?? randomUUID();
    const stamp = new Date().toISOString();
    const record = { ...row, id, created_at: stamp, updated_at: stamp } as Record<string, unknown>;
    const keys = Object.keys(record);
    const cols = keys.join(", ");
    const placeholders = keys.map(() => "?").join(", ");
    this.db.prepare(`INSERT INTO ${this.table} (${cols}) VALUES (${placeholders})`).run(
      ...keys.map((k) => record[k]),
    );
    return this.findById(id) as T;
  }

  update(id: string, patch: Partial<T>): T {
    const keys = Object.keys(patch).filter((k) => k !== "id");
    if (keys.length === 0) return this.findById(id) as T;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (patch as Record<string, unknown>)[k]);
    this.db
      .prepare(`UPDATE ${this.table} SET ${setClause}, updated_at = ? WHERE id = ?`)
      .run(...values, new Date().toISOString(), id);
    return this.findById(id) as T;
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }

  count(filter?: Partial<T>): number {
    if (!filter || Object.keys(filter).length === 0) {
      const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ${this.table}`).get() as { n: number };
      return row.n;
    }
    const keys = Object.keys(filter);
    const where = keys.map((k) => `${k} = ?`).join(" AND ");
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM ${this.table} WHERE ${where}`)
      .get(...keys.map((k) => (filter as Record<string, unknown>)[k])) as { n: number };
    return row.n;
  }
}
