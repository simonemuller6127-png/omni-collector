import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MigrationManager, AIRepository, CollectionRepository } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

let dataDir: string;
let manager: MigrationManager;
let ai: AIRepository;
let collections: CollectionRepository;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-ai-"));
  const migDir = path.join(dataDir, "migrations");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  manager = new MigrationManager(
    path.join(dataDir, "OmniCollector.db"),
    migDir,
    path.join(dataDir, "backup"),
  );
  manager.migrate();
  ai = new AIRepository(manager.getDb());
  collections = new CollectionRepository(manager.getDb());
});

afterAll(() => {
  manager.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function collectionId(): string {
  return collections.upsertByPlatformItem("youtube", `yt-ai-${Math.random()}`, {
    url: `https://youtube.com/watch?v=yt-ai-${Math.random()}`,
  }).id;
}

describe("AIRepository", () => {
  it("enqueues and returns batch ordered by priority desc", () => {
    ai.enqueue(collectionId(), 1);
    ai.enqueue(collectionId(), 5);
    ai.enqueue(collectionId(), 3);
    const batch = ai.nextBatch(10);
    const priorities = batch.map((r) => r.priority);
    expect(priorities).toEqual([5, 3, 1]);
  });

  it("walks queue status transitions", () => {
    ai.enqueue(collectionId(), 0);
    const row = ai.nextBatch(1)[0];
    ai.markProcessing(row.id);
    ai.markDone(row.id);
    const done = ai.nextBatch(10);
    expect(done.find((r) => r.id === row.id)?.status).toBeUndefined();
  });

  it("increments retry_count on failure", () => {
    ai.enqueue(collectionId(), 0);
    const row = ai.nextBatch(1)[0];
    ai.markFailed(row.id, "AI_001: api timeout");
    const failed = ai.nextBatch(10);
    expect(failed.find((r) => r.id === row.id)).toBeUndefined();
    const fromDb = manager
      .getDb()
      .prepare("SELECT status, retry_count, error FROM ai_queue WHERE id = ?")
      .get(row.id) as { status: string; retry_count: number; error: string };
    expect(fromDb.status).toBe("failed");
    expect(fromDb.retry_count).toBe(1);
    expect(fromDb.error).toContain("AI_001");
  });

  it("saves suggestions, dedupes by input_hash and updates status", () => {
    const cid = collectionId();
    const s1 = ai.saveSuggestion({
      collection_id: cid,
      suggestion_type: "suggested_tag",
      payload: JSON.stringify({ tags: ["前端"] }),
      model: "deepseek",
      input_hash: "hash-1",
      confidence: 0.9,
    });
    ai.saveSuggestion({
      collection_id: cid,
      suggestion_type: "suggested_summary",
      payload: JSON.stringify({ summary: "x" }),
      input_hash: "hash-1",
    });
    expect(ai.findSuggestionByHash("hash-1")?.id).toBe(s1.id);
    expect(ai.listPendingSuggestions().length).toBeGreaterThanOrEqual(2);
    ai.updateSuggestionStatus(s1.id, "accepted");
    expect(ai.findSuggestionByHash("hash-1")?.status).toBe("accepted");
  });

  it("records user feedback events", () => {
    const cid = collectionId();
    ai.recordFeedback(cid, "ai_tag_accepted", { suggestion_id: "s1", tag_ids: ["t1"] });
    ai.recordFeedback(cid, "ai_tag_rejected", { suggestion_id: "s2" });
    const rows = manager.getDb().prepare("SELECT * FROM user_feedback WHERE collection_id = ? ORDER BY created_at").all(cid) as Array<{
      event_type: string;
      event_data: string;
    }>;
    expect(rows.map((r) => r.event_type)).toEqual(["ai_tag_accepted", "ai_tag_rejected"]);
    expect(JSON.parse(rows[0].event_data)).toEqual({ suggestion_id: "s1", tag_ids: ["t1"] });
  });

  it("expires old pending suggestions beyond retention days", () => {
    const cid = collectionId();
    const old = ai.saveSuggestion({ collection_id: cid, suggestion_type: "suggested_tag", payload: "x" });
    manager.getDb().prepare("UPDATE ai_suggestions SET created_at = datetime('now','-31 days') WHERE id = ?").run(old.id);
    const fresh = ai.saveSuggestion({ collection_id: cid, suggestion_type: "suggested_tag", payload: "y" });
    expect(ai.expireOldPending(30)).toBe(1);
    const status = manager.getDb().prepare("SELECT status FROM ai_suggestions WHERE id = ?").get(old.id) as { status: string };
    expect(status.status).toBe("expired");
    expect(manager.getDb().prepare("SELECT status FROM ai_suggestions WHERE id = ?").get(fresh.id) as { status: string }).toMatchObject({ status: "pending" });
  });
});
