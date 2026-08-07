import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { AiQueueRow, AiSuggestionRow } from "../types.js";

export interface NewSuggestion {
  collection_id: string;
  suggestion_type: string;
  payload?: string;
  model?: string;
  input_hash?: string;
  confidence?: number;
}

/**
 * AI 队列与 Suggestion 仓储（TDD Part 3.3 / SPEC S9）：
 * AI 输出只进 ai_suggestions 待审核，绝不直接写用户字段；
 * 批处理默认 100 条（ADR-007），input_hash 用于结果去重。
 */
export class AIRepository {
  constructor(private readonly db: Database.Database) {}

  enqueue(collectionId: string, priority = 0): void {
    this.db
      .prepare(
        `INSERT INTO ai_queue (id, collection_id, priority, status, retry_count, scheduled_at)
         VALUES (?, ?, ?, 'queued', 0, datetime('now'))`,
      )
      .run(randomUUID(), collectionId, priority);
  }

  nextBatch(limit = 100): AiQueueRow[] {
    return this.db
      .prepare(
        `SELECT * FROM ai_queue
         WHERE status = 'queued'
         ORDER BY priority DESC, created_at ASC
         LIMIT ?`,
      )
      .all(limit) as AiQueueRow[];
  }

  markProcessing(id: string): void {
    this.db
      .prepare("UPDATE ai_queue SET status = 'processing', processed_at = datetime('now') WHERE id = ?")
      .run(id);
  }

  markDone(id: string): void {
    this.db.prepare("UPDATE ai_queue SET status = 'done', processed_at = datetime('now') WHERE id = ?").run(id);
  }

  markFailed(id: string, error: string): void {
    this.db
      .prepare(
        `UPDATE ai_queue
         SET status = 'failed', error = ?, retry_count = retry_count + 1, processed_at = datetime('now')
         WHERE id = ?`,
      )
      .run(error, id);
  }

  saveSuggestion(s: NewSuggestion): AiSuggestionRow {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO ai_suggestions
         (id, collection_id, suggestion_type, payload, model, input_hash, confidence, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .run(
        id,
        s.collection_id,
        s.suggestion_type,
        s.payload ?? null,
        s.model ?? null,
        s.input_hash ?? null,
        s.confidence ?? null,
      );
    return this.db.prepare("SELECT * FROM ai_suggestions WHERE id = ?").get(id) as AiSuggestionRow;
  }

  findSuggestionByHash(inputHash: string): AiSuggestionRow | undefined {
    return this.db
      .prepare("SELECT * FROM ai_suggestions WHERE input_hash = ? ORDER BY created_at DESC LIMIT 1")
      .get(inputHash) as AiSuggestionRow | undefined;
  }

  updateSuggestionStatus(id: string, status: AiSuggestionRow["status"]): void {
    this.db
      .prepare(
        "UPDATE ai_suggestions SET status = ?, reviewed_at = datetime('now') WHERE id = ?",
      )
      .run(status, id);
  }

  listPendingSuggestions(limit?: number): AiSuggestionRow[] {
    const sql = limit
      ? "SELECT * FROM ai_suggestions WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?"
      : "SELECT * FROM ai_suggestions WHERE status = 'pending' ORDER BY created_at ASC";
    return (limit ? this.db.prepare(sql).all(limit) : this.db.prepare(sql).all()) as AiSuggestionRow[];
  }
}
