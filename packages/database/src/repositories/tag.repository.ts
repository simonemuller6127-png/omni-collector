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
  source: "platform" | "user" | "ai";
  created_at: string;
}

export interface TagStat {
  id: string;
  name: string;
  count: number;
  aliases: string[];
}

const SOURCE_RANK: Record<string, number> = { platform: 0, ai: 1, user: 2 };

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Tag 仓储（Phase 6：Topic/Tag 生成落地）：
 * tags + tag_aliases + content_tags 三表；source 区分用户手动与 AI 建议。
 */
export class TagRepository {
  constructor(private readonly db: Database.Database) {}

  ensureTag(name: string): TagRow {
    const trimmed = normalizeName(name);
    const existing = this.findByNameOrAlias(trimmed);
    if (existing) return existing;
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, datetime('now'))")
      .run(id, trimmed);
    return this.db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as TagRow;
  }

  findByNameOrAlias(nameOrAlias: string): TagRow | undefined {
    return this.db
      .prepare(
        `SELECT t.* FROM tags t
         LEFT JOIN tag_aliases a ON a.tag_id = t.id
         WHERE t.name = ? OR a.alias = ? LIMIT 1`,
      )
      .get(normalizeName(nameOrAlias), normalizeName(nameOrAlias)) as TagRow | undefined;
  }

  findByAlias(alias: string): TagRow | undefined {
    return this.db
      .prepare(
        `SELECT t.* FROM tags t
         JOIN tag_aliases a ON a.tag_id = t.id
         WHERE a.alias = ? LIMIT 1`,
      )
      .get(normalizeName(alias)) as TagRow | undefined;
  }

  addAlias(nameOrAlias: string, alias: string): void {
    const tag = this.ensureTag(nameOrAlias);
    const normalized = normalizeName(alias);
    if (!normalized || normalized === tag.name) return;
    this.db
      .prepare(
        `INSERT INTO tag_aliases (id, tag_id, alias, language)
         VALUES (?, ?, ?, 'zh')
         ON CONFLICT(alias) DO UPDATE SET tag_id = excluded.tag_id`,
      )
      .run(randomUUID(), tag.id, normalized);
  }

  listAliases(tagId?: string): Array<{ id: string; tag_id: string; alias: string; language: string }> {
    if (tagId) {
      return this.db
        .prepare("SELECT * FROM tag_aliases WHERE tag_id = ? ORDER BY alias ASC")
        .all(tagId) as Array<{ id: string; tag_id: string; alias: string; language: string }>;
    }
    return this.db.prepare("SELECT * FROM tag_aliases ORDER BY tag_id, alias ASC").all() as Array<{
      id: string;
      tag_id: string;
      alias: string;
      language: string;
    }>;
  }

  listTags(): TagStat[] {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.name,
                COUNT(ct.collection_id) AS count,
                COALESCE(GROUP_CONCAT(a.alias, '\u001f'), '') AS aliases_raw
         FROM tags t
         LEFT JOIN content_tags ct ON ct.tag_id = t.id
         LEFT JOIN tag_aliases a ON a.tag_id = t.id
         GROUP BY t.id
         ORDER BY count DESC, t.name ASC`,
      )
      .all() as Array<{ id: string; name: string; count: number; aliases_raw: string }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      count: r.count,
      aliases: r.aliases_raw ? r.aliases_raw.split("\u001f").filter(Boolean).sort() : [],
    }));
  }

  bindTag(collectionId: string, tagId: string, source: "platform" | "user" | "ai" = "ai"): void {
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

  listCollectionsByTag(tagName: string, source?: "platform" | "user" | "ai"): string[] {
    const name = normalizeName(tagName);
    const base = `SELECT ct.collection_id FROM content_tags ct
         JOIN tags t ON t.id = ct.tag_id
         WHERE (t.name = ? OR EXISTS (SELECT 1 FROM tag_aliases a WHERE a.tag_id = t.id AND a.alias = ?))`;
    const sql = source ? `${base} AND ct.source = ?` : base;
    const rows = (
      source ? this.db.prepare(sql).all(name, name, source) : this.db.prepare(sql).all(name, name)
    ) as Array<{ collection_id: string }>;
    return rows.map((r) => r.collection_id);
  }

  /** 合并两个 Tag：绑定/别名并入 target，删除 source。 */
  mergeTags(sourceName: string, targetName: string): void {
    const source = this.findByNameOrAlias(sourceName);
    const target = this.findByNameOrAlias(targetName);
    if (!source || !target || source.id === target.id) return;
    const tx = this.db.transaction(() => {
      const bindings = this.db
        .prepare("SELECT collection_id, source FROM content_tags WHERE tag_id = ?")
        .all(source.id) as Array<{ collection_id: string; source: string }>;
      const upsert = this.db.prepare(
        `INSERT INTO content_tags (collection_id, tag_id, source, created_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(collection_id, tag_id) DO NOTHING`,
      );
      const getSource = this.db.prepare("SELECT source FROM content_tags WHERE collection_id = ? AND tag_id = ?");
      const updateSource = this.db.prepare(
        "UPDATE content_tags SET source = ?, created_at = datetime('now') WHERE collection_id = ? AND tag_id = ?",
      );
      for (const b of bindings) {
        const existing = getSource.get(b.collection_id, target.id) as { source: string } | undefined;
        if (!existing) {
          upsert.run(b.collection_id, target.id, b.source);
        } else if (SOURCE_RANK[b.source] > SOURCE_RANK[existing.source]) {
          updateSource.run(b.source, b.collection_id, target.id);
        }
      }
      this.db
        .prepare(
          `UPDATE tag_aliases SET tag_id = ?
           WHERE tag_id = ? AND alias NOT IN (SELECT alias FROM tag_aliases WHERE tag_id = ?)`,
        )
        .run(target.id, source.id, target.id);
      if (source.name !== target.name) {
        this.db
          .prepare(
            `INSERT INTO tag_aliases (id, tag_id, alias, language)
             SELECT ?, ?, ?, 'zh'
             WHERE NOT EXISTS (
               SELECT 1 FROM tag_aliases WHERE alias = ?
             ) AND NOT EXISTS (
               SELECT 1 FROM tags WHERE name = ? AND id != ?
             )`,
          )
          .run(randomUUID(), target.id, source.name, source.name, source.name, source.id);
      }
      this.db.prepare("DELETE FROM content_tags WHERE tag_id = ?").run(source.id);
      this.db.prepare("DELETE FROM tag_aliases WHERE tag_id = ?").run(source.id);
      this.db.prepare("DELETE FROM tags WHERE id = ?").run(source.id);
    });
    tx();
  }

  /** 重命名：若新名称已存在（含别名）则合并，否则直接改名。 */
  renameTag(current: string, next: string): TagRow {
    const tag = this.findByNameOrAlias(current);
    const normalized = normalizeName(next);
    if (!tag || !normalized || normalized === tag.name) return tag ?? this.ensureTag(next);
    const existing = this.findByNameOrAlias(normalized);
    if (existing && existing.id !== tag.id) {
      this.mergeTags(tag.name, existing.name);
      return existing;
    }
    this.db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(normalized, tag.id);
    return this.db.prepare("SELECT * FROM tags WHERE id = ?").get(tag.id) as TagRow;
  }
}
