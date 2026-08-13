import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface TopicRow {
  id: string;
  name: string;
  description?: string | null;
  status: "pending" | "accepted" | "rejected";
  tag_ids?: string | null;
  collection_ids?: string | null;
  content_group_ids?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TopicStat {
  id: string;
  name: string;
  status: TopicRow["status"];
  count: number;
  collection_ids: string[];
}

/**
 * Topic 仓储（Phase 6：Topic 生成落地）：
 * topics 表，collection_ids 以 JSON 数组存储；status 走 pending -> accepted 审核流。
 */
export class TopicRepository {
  constructor(private readonly db: Database.Database) {}

  createTopic(name: string, collectionId?: string): TopicRow {
    const id = randomUUID();
    const collectionIds = collectionId ? JSON.stringify([collectionId]) : JSON.stringify([]);
    this.db
      .prepare(
        `INSERT INTO topics (id, name, status, collection_ids, created_at, updated_at)
         VALUES (?, ?, 'pending', ?, datetime('now'), datetime('now'))`,
      )
      .run(id, name.trim(), collectionIds);
    return this.db.prepare("SELECT * FROM topics WHERE id = ?").get(id) as TopicRow;
  }

  addCollection(topicId: string, collectionId: string): void {
    const topic = this.findById(topicId);
    if (!topic) return;
    const ids = new Set<string>(JSON.parse(topic.collection_ids ?? "[]") as string[]);
    ids.add(collectionId);
    this.db
      .prepare(
        "UPDATE topics SET collection_ids = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(JSON.stringify([...ids]), topicId);
  }

  removeCollection(topicId: string, collectionId: string): void {
    const topic = this.findById(topicId);
    if (!topic) return;
    let ids: string[] = [];
    try {
      ids = JSON.parse(topic.collection_ids ?? "[]") as string[];
    } catch {
      ids = [];
    }
    const next = ids.filter((id) => id !== collectionId);
    this.db
      .prepare(
        "UPDATE topics SET collection_ids = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(JSON.stringify(next), topicId);
  }

  setStatus(topicId: string, status: TopicRow["status"]): void {
    this.db
      .prepare("UPDATE topics SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, topicId);
  }

  listTopics(status?: TopicRow["status"]): TopicRow[] {
    const sql = status
      ? "SELECT * FROM topics WHERE status = ? ORDER BY created_at DESC"
      : "SELECT * FROM topics ORDER BY created_at DESC";
    return (status ? this.db.prepare(sql).all(status) : this.db.prepare(sql).all()) as TopicRow[];
  }

  findByName(name: string): TopicRow | undefined {
    return this.db.prepare("SELECT * FROM topics WHERE name = ? LIMIT 1").get(name.trim()) as
      | TopicRow
      | undefined;
  }

  listTopicsOfCollection(collectionId: string): TopicRow[] {
    const all = this.listTopics();
    return all.filter((t) => {
      try {
        return (JSON.parse(t.collection_ids ?? "[]") as string[]).includes(collectionId);
      } catch {
        return false;
      }
    });
  }

  findById(id: string): TopicRow | undefined {
    return this.db.prepare("SELECT * FROM topics WHERE id = ?").get(id) as TopicRow | undefined;
  }

  listTopicsWithCounts(): TopicStat[] {
    return this.listTopics().map((t) => {
      let ids: string[] = [];
      try {
        ids = JSON.parse(t.collection_ids ?? "[]") as string[];
      } catch {
        ids = [];
      }
      return { id: t.id, name: t.name, status: t.status, count: ids.length, collection_ids: ids };
    });
  }

  renameTopic(topicId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.db
      .prepare("UPDATE topics SET name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(trimmed, topicId);
  }
}
