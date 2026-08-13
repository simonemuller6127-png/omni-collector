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

  it("adds aliases and resolves tags through aliases", () => {
    const { db, cleanup } = setup();
    try {
      const tags = new TagRepository(db);
      const canonical = tags.ensureTag("生活美学");
      tags.addAlias("生活美学", "生活美");
      tags.addAlias("生活美学", "life aesthetics");
      expect(tags.findByAlias("生活美")?.id).toBe(canonical.id);
      expect(tags.ensureTag("生活美").id).toBe(canonical.id);
      expect(tags.ensureTag("life aesthetics").id).toBe(canonical.id);
      const listed = tags.listTags();
      expect(listed.find((t) => t.name === "生活美学")?.aliases.sort()).toEqual(["life aesthetics", "生活美"]);
    } finally {
      cleanup();
    }
  });

  it("listCollectionsByTag resolves aliases", () => {
    const { db, cleanup } = setup();
    try {
      const tags = new TagRepository(db);
      const collections = new CollectionRepository(db);
      const c1 = collections.upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T1" });
      const tag = tags.ensureTag("前端开发");
      tags.bindTag(c1.id, tag.id, "platform");
      tags.addAlias("前端开发", "前端工程");
      expect(tags.listCollectionsByTag("前端工程")).toEqual([c1.id]);
    } finally {
      cleanup();
    }
  });

  it("merges tags: rebinds collections, merges aliases, deletes source", () => {
    const { db, cleanup } = setup();
    try {
      const tags = new TagRepository(db);
      const collections = new CollectionRepository(db);
      const c1 = collections.upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T1" });
      const c2 = collections.upsertByPlatformItem("youtube", "yt1", { url: "https://x/2", title: "T2" });
      const source = tags.ensureTag("生活美");
      const target = tags.ensureTag("生活美学");
      tags.bindTag(c1.id, source.id, "platform");
      tags.bindTag(c2.id, source.id, "user");
      tags.bindTag(c2.id, target.id, "ai");
      tags.addAlias("生活美", "shm");
      tags.mergeTags("生活美", "生活美学");
      expect(tags.listCollectionsByTag("生活美学").sort()).toEqual([c1.id, c2.id]);
      expect(tags.findByAlias("shm")?.name).toBe("生活美学");
      expect(tags.ensureTag("生活美").id).toBe(target.id);
      const c2Tags = tags.listTagsOfCollection(c2.id);
      expect(c2Tags).toHaveLength(1);
      expect(c2Tags[0].name).toBe("生活美学");
    } finally {
      cleanup();
    }
  });

  it("renames a tag, merging into existing name when present", () => {
    const { db, cleanup } = setup();
    try {
      const tags = new TagRepository(db);
      const collections = new CollectionRepository(db);
      const c1 = collections.upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T1" });
      tags.ensureTag("旧名");
      const target = tags.ensureTag("新名");
      tags.bindTag(c1.id, target.id, "user");
      const renamed = tags.renameTag("旧名", "新名");
      expect(renamed.id).toBe(target.id);
      expect(tags.listTags().find((t) => t.name === "旧名")).toBeUndefined();
      expect(tags.listCollectionsByTag("新名")).toEqual([c1.id]);
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

  it("lists topics with counts and renames", () => {
    const { db, cleanup } = setup();
    try {
      const topics = new TopicRepository(db);
      const t = topics.createTopic("旧主题", "c1");
      topics.addCollection(t.id, "c2");
      topics.setStatus(t.id, "accepted");
      const stats = topics.listTopicsWithCounts();
      expect(stats.find((s) => s.id === t.id)?.count).toBe(2);
      topics.renameTopic(t.id, "新主题");
      expect(topics.findById(t.id)?.name).toBe("新主题");
    } finally {
      cleanup();
    }
  });

  it("removes a collection from topic membership", () => {
    const { db, cleanup } = setup();
    try {
      const topics = new TopicRepository(db);
      const t = topics.createTopic("主题", "c1");
      topics.addCollection(t.id, "c2");
      topics.removeCollection(t.id, "c1");
      expect(JSON.parse(topics.findById(t.id)?.collection_ids ?? "[]")).toEqual(["c2"]);
    } finally {
      cleanup();
    }
  });
});
