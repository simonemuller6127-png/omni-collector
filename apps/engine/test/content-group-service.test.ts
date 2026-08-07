import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import {
  AIRepository,
  CollectionRepository,
  ContentGroupRepository,
  MigrationManager,
} from "@omni/database";
import {
  ContentGroupService,
  findGroupCandidates,
  normalizeEntity,
  seriesBaseName,
  type GroupCandidate,
} from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function setup(): {
  db: ReturnType<MigrationManager["getDb"]>;
  manager: MigrationManager;
  cleanup: () => void;
} {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-group-"));
  tmpDirs.push(dataDir);
  const migDir = path.join(dataDir, "migrations");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
  manager.migrate();
  return {
    db: manager.getDb(),
    manager,
    cleanup: () => manager.close(),
  };
}

describe("findGroupCandidates", () => {
  it("normalizes entity keys", () => {
    expect(normalizeEntity("  AI 编程 技巧！")).toBe("ai编程技巧");
    expect(seriesBaseName("第3集 入门教程")).toBe("入门教程");
  });

  it("clusters same entity across platforms (title + author)", () => {
    const candidates = findGroupCandidates([
      { id: "a", title: "AI 编程实战", author: "张三", url: "https://a/1", platform_item_id: "1", content_type: "video", save_type: "favorited", content_status: "active", sync_status: "full", catalog_synced: 1, detail_synced: 1, inbox_status: "done", organize_status: "unorganized", priority: "normal", collected_at: new Date().toISOString(), created_at: "", updated_at: "", platform: "bilibili" } as never,
      { id: "b", title: "AI 编程实战", author: "张三", url: "https://b/2", platform_item_id: "2", content_type: "video", save_type: "favorited", content_status: "active", sync_status: "full", catalog_synced: 1, detail_synced: 1, inbox_status: "done", organize_status: "unorganized", priority: "normal", collected_at: new Date().toISOString(), created_at: "", updated_at: "", platform: "youtube" } as never,
      { id: "c", title: "完全无关", author: "李四", url: "https://c/3", platform_item_id: "3", content_type: "note", save_type: "favorited", content_status: "active", sync_status: "full", catalog_synced: 1, detail_synced: 1, inbox_status: "done", organize_status: "unorganized", priority: "normal", collected_at: new Date().toISOString(), created_at: "", updated_at: "", platform: "xiaohongshu" } as never,
    ] as never);
    expect(candidates.some((c) => c.reason === "entity" && c.collectionIds.includes("a") && c.collectionIds.includes("b"))).toBe(true);
  });
});

describe("ContentGroupService", () => {
  it("suggests candidates (dedup by hash) and materializes on acceptance", () => {
    const { db, cleanup } = setup();
    try {
      const collections = new CollectionRepository(db);
      const groups = new ContentGroupRepository(db);
      const ai = new AIRepository(db);
      const c1 = collections.upsertByPlatformItem("bilibili", "bv1", {
        url: "https://www.bilibili.com/video/bv1",
        title: "AI 编程实战",
        author: "张三",
      });
      const c2 = collections.upsertByPlatformItem("youtube", "yt1", {
        url: "https://youtu.be/yt1",
        title: "AI 编程实战",
        author: "张三",
      });
      const service = new ContentGroupService({ groups, collections, ai });
      const candidate: GroupCandidate = {
        name: "AI 编程实战",
        collectionIds: [c1.id, c2.id],
        reason: "entity",
      };

      const first = service.suggestCandidates([candidate]);
      expect(first.suggested).toBe(1);
      // 同 hash 去重
      const second = service.suggestCandidates([candidate]);
      expect(second.suggested).toBe(0);
      expect(second.skipped).toBe(1);

      const pending = ai.listPendingSuggestions();
      expect(pending).toHaveLength(1);
      expect(pending[0].suggestion_type).toBe("suggested_group");

      // 接受 -> 落地
      const materialized = service.materializeSuggestion(pending[0].payload ?? "");
      expect(materialized.bound).toBe(2);
      expect(groups.groupOfCollection(c1.id)?.name).toBe("AI 编程实战");
      expect(groups.listCollectionsInGroup(materialized.groupId)).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("skips collections already bound to a group", () => {
    const { db, cleanup } = setup();
    try {
      const collections = new CollectionRepository(db);
      const groups = new ContentGroupRepository(db);
      const ai = new AIRepository(db);
      const c1 = collections.upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T1", author: "A" });
      const c2 = collections.upsertByPlatformItem("youtube", "yt1", { url: "https://x/2", title: "T1", author: "A" });
      const c3 = collections.upsertByPlatformItem("xiaohongshu", "xhs1", { url: "https://x/3", title: "T1", author: "A" });
      const g = groups.createGroup("已有分组");
      groups.bindCollection(g.id, c1.id);
      const service = new ContentGroupService({ groups, collections, ai });
      const result = service.suggestCandidates([{ name: "T1", collectionIds: [c1.id, c2.id, c3.id], reason: "entity" }]);
      expect(result.suggested).toBe(1); // 已绑定的 c1 被过滤，剩余 c2+c3 仍可建组
      expect(result.skipped).toBe(0);
    } finally {
      cleanup();
    }
  });
});
