import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { UserNoteRow } from "../types.js";

/**
 * 用户区同步副本（ADR-006）：权威为 Markdown 用户区，
 * 本表仅保存同步副本供查询/过滤；系统逻辑禁止在此写入业务判断。
 */
export class UserRepository {
  constructor(private readonly db: Database.Database) {}

  getNote(collectionId: string): UserNoteRow | undefined {
    return this.db.prepare("SELECT * FROM user_notes WHERE collection_id = ?").get(collectionId) as
      | UserNoteRow
      | undefined;
  }

  upsertNote(collectionId: string, noteMd: string): UserNoteRow {
    const stamp = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO user_notes (id, collection_id, note_md, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(collection_id) DO UPDATE SET note_md = excluded.note_md, updated_at = excluded.updated_at`,
      )
      .run(randomUUID(), collectionId, noteMd, stamp);
    return this.getNote(collectionId) as UserNoteRow;
  }

  mergeUserTags(collectionId: string, tags: string[]): UserNoteRow {
    const stamp = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO user_notes (id, collection_id, user_tags, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(collection_id) DO UPDATE SET
           user_tags = excluded.user_tags, updated_at = excluded.updated_at`,
      )
      .run(randomUUID(), collectionId, JSON.stringify(tags), stamp);
    return this.getNote(collectionId) as UserNoteRow;
  }

  setRating(collectionId: string, rating: number): UserNoteRow {
    const stamp = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO user_notes (id, collection_id, user_rating, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(collection_id) DO UPDATE SET
           user_rating = excluded.user_rating, updated_at = excluded.updated_at`,
      )
      .run(randomUUID(), collectionId, rating, stamp);
    return this.getNote(collectionId) as UserNoteRow;
  }

  syncOrganizeState(collectionId: string, state: string): UserNoteRow {
    const stamp = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO user_notes (id, collection_id, organize_status, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(collection_id) DO UPDATE SET
           organize_status = excluded.organize_status, updated_at = excluded.updated_at`,
      )
      .run(randomUUID(), collectionId, state, stamp);
    return this.getNote(collectionId) as UserNoteRow;
  }
}
