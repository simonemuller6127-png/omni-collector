import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { CollectionRow } from "../types.js";

export interface ContentGroupRow {
  id: string;
  name: string;
  type: "knowledge" | "person" | "project" | "product";
  created_at: string;
  updated_at: string;
}

/**
 * ContentGroup 仓储（ADR-010 冻结模型）：
 * Collection 永远代表平台收藏实例；ContentGroup 只承担跨平台关联，不合并平台数据。
 */
export class ContentGroupRepository {
  constructor(private readonly db: Database.Database) {}

  createGroup(name: string, type: ContentGroupRow["type"] = "knowledge"): ContentGroupRow {
    const stamp = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO content_groups (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, name, type, stamp, stamp);
    return this.db.prepare("SELECT * FROM content_groups WHERE id = ?").get(id) as ContentGroupRow;
  }

  bindCollection(groupId: string, collectionId: string): void {
    this.db
      .prepare(
        `INSERT INTO collection_group_mapping (collection_id, group_id)
         VALUES (?, ?)
         ON CONFLICT(collection_id) DO UPDATE SET group_id = excluded.group_id`,
      )
      .run(collectionId, groupId);
  }

  unbindCollection(collectionId: string): void {
    this.db
      .prepare("DELETE FROM collection_group_mapping WHERE collection_id = ?")
      .run(collectionId);
  }

  groupOfCollection(collectionId: string): ContentGroupRow | undefined {
    return this.db
      .prepare(
        `SELECT g.* FROM content_groups g
         JOIN collection_group_mapping m ON m.group_id = g.id
         WHERE m.collection_id = ?`,
      )
      .get(collectionId) as ContentGroupRow | undefined;
  }

  listCollectionsInGroup(groupId: string): CollectionRow[] {
    return this.db
      .prepare(
        `SELECT c.* FROM collections c
         JOIN collection_group_mapping m ON m.collection_id = c.id
         WHERE m.group_id = ?
         ORDER BY c.collected_at ASC`,
      )
      .all(groupId) as CollectionRow[];
  }
}
