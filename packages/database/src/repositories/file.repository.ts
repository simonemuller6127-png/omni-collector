import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { FileIndexRow, LocalFileRow } from "../types.js";

export interface NewLocalFile {
  file_path: string;
  file_name?: string;
  file_type?: string | null;
  file_size?: number;
  created_at?: string;
  modified_at?: string;
  file_hash?: string;
  linked_collection_id?: string;
}

export interface NewFileIndex {
  extracted_title?: string | null;
  toc_json?: string;
  chapter_titles?: string;
  sheet_names?: string;
  analysis_status?: FileIndexRow["analysis_status"];
}

/** 本地文件轻量索引仓储（TDD Part 2.4.9 / SPEC S12：不全文解析、不生成 TXT 副本）。 */
export class FileRepository {
  constructor(private readonly db: Database.Database) {}

  upsertLocalFile(row: NewLocalFile): LocalFileRow {
    const stamp = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO local_files
         (id, file_path, file_name, file_type, file_size, created_at, modified_at, file_hash,
          content_status, linked_collection_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
         ON CONFLICT(file_path) DO UPDATE SET
           file_name = excluded.file_name,
           file_type = excluded.file_type,
           file_size = excluded.file_size,
           created_at = excluded.created_at,
           modified_at = excluded.modified_at,
           file_hash = excluded.file_hash,
           linked_collection_id = excluded.linked_collection_id,
           content_status = 'active',
           updated_at = excluded.updated_at`,
      )
      .run(
        randomUUID(),
        row.file_path,
        row.file_name ?? null,
        row.file_type ?? null,
        row.file_size ?? null,
        row.created_at ?? null,
        row.modified_at ?? null,
        row.file_hash ?? null,
        row.linked_collection_id ?? null,
        stamp,
      );
    return this.queryByPath(row.file_path) as LocalFileRow;
  }

  queryByPath(filePath: string): LocalFileRow | undefined {
    return this.db.prepare("SELECT * FROM local_files WHERE file_path = ?").get(filePath) as
      | LocalFileRow
      | undefined;
  }

  markMissing(id: string): void {
    this.db
      .prepare("UPDATE local_files SET content_status = 'file_missing', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  upsertIndex(fileId: string, data: NewFileIndex): FileIndexRow {
    this.db
      .prepare(
        `INSERT INTO file_index
         (file_id, extracted_title, toc_json, chapter_titles, sheet_names, analysis_status, analyzed_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(file_id) DO UPDATE SET
           extracted_title = excluded.extracted_title,
           toc_json = excluded.toc_json,
           chapter_titles = excluded.chapter_titles,
           sheet_names = excluded.sheet_names,
           analysis_status = excluded.analysis_status,
           analyzed_at = excluded.analyzed_at`,
      )
      .run(
        fileId,
        data.extracted_title ?? null,
        data.toc_json ?? null,
        data.chapter_titles ?? null,
        data.sheet_names ?? null,
        data.analysis_status ?? "none",
      );
    return this.db.prepare("SELECT * FROM file_index WHERE file_id = ?").get(fileId) as FileIndexRow;
  }
}
