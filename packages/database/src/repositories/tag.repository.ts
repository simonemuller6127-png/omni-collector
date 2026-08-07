import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface TagRow {
  id: string;
  name: string;
  created_at: string;
}

export interface CollectionTagRow {
  collection_id: string;
  tag_id: string;
  source: "user" | "ai";
  created_at: string;
}

/**
 * Tag 仓储（Phase 6：Topic/Tag 生成落地）：
 * tags + tag_aliases + content_tags 三表；source 区分用户手动与 AI 建议。
 */
export class TagRepository {
  constructor(private readonly db: Database.Database) {}

  ensureTag(name: string): TagRow {
    const trimmed = name.trim();
    const existing = this.db
      .prepare(
        `SELECT t.* FROM tags t
         LEFT JOIN tag_aliases a ON a.tag_id = t.id
         WHERE t.name = ? OR a.alias = ? LIMIT 1`,
      )
      .get(trimmed, trimmed) as TagRow | undefined;
    if (existing) return existing;
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, datetime('now'))")
      .run(id, trimmed);
    return this.db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as TagRow;
  }

  bindTag(collectionId: string, tagId: string, source: "user" | "ai" = "ai"): void {
    this.db
      .prepare(
        `INSERT INTO content_tags (collection_id, tag_id, source, created_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(collection_id, tag_id) DO UPDATE SET source = excluded.source`,
      )
      .run(collectionId, tagId, source);
  }

  listTagsOfCollection(collectionId: string): TagRow[] {
    return this.db
      .prepare(
        `SELECT t.* FROM tags t
         JOIN content_tags ct ON ct.tag_id = t.id
         WHERE ct.collection_id = ?
         ORDER BY t.name ASC`,
      )
      .all(collectionId) as TagRow[];
  }

  listCollectionsByTag(tagName: string, source?: "user" | "ai"): string[] {
    const sql = source
      ? `SELECT ct.collection_id FROM content_tags ct
         JOIN tags t ON t.id = ct.tag_id
         WHERE t.name = ? AND ct.source = ?`
      : `SELECT ct.collection_id FROM content_tags ct
         JOIN tags t ON t.id = ct.tag_id
         WHERE t.name = ?`;
    const rows = (source
      ? this.db.prepare(sql).all(tagName, source)
      : this.db.prepare(sql).all(tagName)) as Array<{ collection_id: string }>;
    return rows.map((r) => r.collection_id);
  }
}
