import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import { CollectionRepository, MigrationManager, TagRepository, TopicRepository } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function setup(): { db: ReturnType<MigrationManager["getDb"]>; cleanup: () => void } {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-tt-"));
  tmpDirs.push(dataDir);
  const migDir = path.join(dataDir, "migrations");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
  manager.migrate();
  return { db: manager.getDb(), cleanup: () => manager.close() };
}

describe("TagRepository", () => {
  it("ensureTag dedupes and bindTag lists by source", () => {
    const { db, cleanup } = setup();
    try {
      const tags = new TagRepository(db);
      const collections = new CollectionRepository(db);
      const c1 = collections.upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T1" });
      const c2 = collections.upsertByPlatformItem("youtube", "yt1", { url: "https://x/2", title: "T2" });
      const a = tags.ensureTag("AI 编程");
      const b = tags.ensureTag("AI 编程");
      expect(a.id).toBe(b.id);
      tags.bindTag(c1.id, a.id, "ai");
      tags.bindTag(c2.id, a.id, "user");
      expect(tags.listCollectionsByTag("AI 编程", "ai")).toEqual([c1.id]);
      expect(tags.listCollectionsByTag("AI 编程")).toEqual([c1.id, c2.id]);
      expect(tags.listTagsOfCollection(c1.id).map((t) => t.name)).toEqual(["AI 编程"]);
    } finally {
      cleanup();
    }
  });
});

describe("TopicRepository", () => {
  it("creates topic, adds collections, accepts status", () => {
    const { db, cleanup } = setup();
    try {
      const topics = new TopicRepository(db);
      const t = topics.createTopic("AI 工程实践", "c1");
      topics.addCollection(t.id, "c2");
      topics.setStatus(t.id, "accepted");
      const found = topics.findByName("AI 工程实践");
      expect(found?.status).toBe("accepted");
      expect(JSON.parse(found?.collection_ids ?? "[]")).toEqual(["c1", "c2"]);
      expect(topics.listTopics("accepted")).toHaveLength(1);
    } finally {
      cleanup();
    }
  });
});
