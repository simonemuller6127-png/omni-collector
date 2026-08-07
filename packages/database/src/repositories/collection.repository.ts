import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { BaseRepository } from "./base.js";
import type { CollectionRow } from "../types.js";

type OrganizeState = CollectionRow["organize_status"];
type Priority = CollectionRow["priority"];
type InboxStatus = CollectionRow["inbox_status"];

export class CollectionRepository extends BaseRepository<CollectionRow> {
  constructor(db: Database.Database) {
    super(db, "collections");
  }

  upsertByPlatformItem(
    platform: string,
    platformItemId: string,
    data: Partial<CollectionRow>,
  ): CollectionRow {
    const existing = this.db
      .prepare("SELECT * FROM collections WHERE platform = ? AND platform_item_id = ?")
      .get(platform, platformItemId) as CollectionRow | undefined;
    if (existing) {
      return this.update(existing.id, data);
    }
    const stamp = new Date().toISOString();
    const row: CollectionRow = {
      id: randomUUID(),
      platform,
      platform_item_id: platformItemId,
      url: data.url ?? "",
      content_type: data.content_type ?? "video",
      save_type: data.save_type ?? "favorited",
      content_status: data.content_status ?? "active",
      sync_status: data.sync_status ?? "catalog",
      catalog_synced: data.catalog_synced ?? 0,
      detail_synced: data.detail_synced ?? 0,
      inbox_status: data.inbox_status ?? "pending",
      organize_status: data.organize_status ?? "unorganized",
      priority: data.priority ?? "normal",
      collected_at: data.collected_at ?? stamp,
      created_at: stamp,
      updated_at: stamp,
      ...data,
    };
    const bind = {
      id: row.id,
      platform: row.platform,
      platform_item_id: row.platform_item_id,
      url: row.url,
      title: row.title ?? null,
      author: row.author ?? null,
      cover_url: row.cover_url ?? null,
      description: row.description ?? null,
      content_type: row.content_type,
      save_type: row.save_type,
      content_status: row.content_status,
      sync_status: row.sync_status,
      catalog_synced: row.catalog_synced,
      detail_synced: row.detail_synced,
      inbox_status: row.inbox_status,
      organize_status: row.organize_status,
      priority: row.priority,
      collected_at: row.collected_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    this.db
      .prepare(
        `INSERT INTO collections (id, platform, platform_item_id, url, title, author, cover_url,
         description, content_type, save_type, content_status, sync_status, catalog_synced,
         detail_synced, inbox_status, organize_status, priority, collected_at, created_at, updated_at)
         VALUES (@id, @platform, @platform_item_id, @url, @title, @author, @cover_url,
         @description, @content_type, @save_type, @content_status, @sync_status, @catalog_synced,
         @detail_synced, @inbox_status, @organize_status, @priority, @collected_at, @created_at, @updated_at)`,
      )
      .run(bind);
    return this.findById(row.id) as CollectionRow;
  }

  findByUrl(url: string): CollectionRow | undefined {
    return this.db.prepare("SELECT * FROM collections WHERE url = ?").get(url) as
      | CollectionRow
      | undefined;
  }

  listByStatus(status: CollectionRow["content_status"], limit?: number): CollectionRow[] {
    const sql = limit
      ? "SELECT * FROM collections WHERE content_status = ? ORDER BY collected_at DESC LIMIT ?"
      : "SELECT * FROM collections WHERE content_status = ? ORDER BY collected_at DESC";
    return (limit ? this.db.prepare(sql).all(status, limit) : this.db.prepare(sql).all(status)) as CollectionRow[];
  }

  listAll(limit?: number): CollectionRow[] {
    const sql = limit
      ? "SELECT * FROM collections WHERE content_status = 'active' ORDER BY collected_at ASC LIMIT ?"
      : "SELECT * FROM collections WHERE content_status = 'active' ORDER BY collected_at ASC";
    return (limit ? this.db.prepare(sql).all(limit) : this.db.prepare(sql).all()) as CollectionRow[];
  }

  listByOrganizeStatus(status: CollectionRow["organize_status"], limit?: number): CollectionRow[] {
    const sql = limit
      ? "SELECT * FROM collections WHERE organize_status = ? ORDER BY collected_at DESC LIMIT ?"
      : "SELECT * FROM collections WHERE organize_status = ? ORDER BY collected_at DESC";
    return (limit ? this.db.prepare(sql).all(status, limit) : this.db.prepare(sql).all(status)) as CollectionRow[];
  }

  listPendingInbox(limit?: number): CollectionRow[] {
    const sql = limit
      ? "SELECT * FROM collections WHERE inbox_status = 'pending' ORDER BY collected_at ASC LIMIT ?"
      : "SELECT * FROM collections WHERE inbox_status = 'pending' ORDER BY collected_at ASC";
    return (limit ? this.db.prepare(sql).all(limit) : this.db.prepare(sql).all()) as CollectionRow[];
  }

  markInbox(collectionId: string, status: InboxStatus): void {
    this.db.prepare("UPDATE collections SET inbox_status = ?, updated_at = ? WHERE id = ?").run(
      status,
      new Date().toISOString(),
      collectionId,
    );
  }

  setOrganizeState(collectionId: string, state: OrganizeState): void {
    // ADR-006：organize_status 权威为 Markdown 用户区，本表为同步副本
    this.db.prepare("UPDATE collections SET organize_status = ?, updated_at = ? WHERE id = ?").run(
      state,
      new Date().toISOString(),
      collectionId,
    );
  }

  setPriority(collectionId: string, priority: Priority): void {
    // ADR-006：priority 权威为 Markdown 用户区，本表为同步副本
    this.db.prepare("UPDATE collections SET priority = ?, updated_at = ? WHERE id = ?").run(
      priority,
      new Date().toISOString(),
      collectionId,
    );
  }

  markDeleted(collectionId: string, deletedAt: string): void {
    this.db
      .prepare(
        "UPDATE collections SET content_status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(deletedAt, new Date().toISOString(), collectionId);
  }

  archive(collectionId: string): void {
    this.db.prepare("UPDATE collections SET organize_status = 'archived', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      collectionId,
    );
  }

  updateMarkdownPath(collectionId: string, path: string): void {
    this.db.prepare("UPDATE collections SET markdown_path = ?, updated_at = ? WHERE id = ?").run(
      path,
      new Date().toISOString(),
      collectionId,
    );
  }
}
