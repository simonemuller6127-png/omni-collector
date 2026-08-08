import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import type { AIProvider } from "@omni/ai";
import type { OmniMessage } from "@omni/shared-core";
import {
  AIRepository,
  CollectionRepository,
  ContentGroupRepository,
  MigrationManager,
  RuleCenter,
  TagRepository,
  TopicRepository,
} from "@omni/database";
import { TaskService } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

class FakeProvider implements AIProvider {
  readonly name = "fake";
  calls = 0;
  async chat() {
    this.calls += 1;
    return { text: JSON.stringify([{ type: "suggested_summary", payload: "内部测试摘要" }]) };
  }
}

function makeMsg(message_type: OmniMessage["message_type"], payload: Record<string, unknown>): OmniMessage {
  return {
    request_id: `req-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    message_type,
    payload,
  };
}

function makeDataDir(): string {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-task-"));
  tmpDirs.push(dataDir);
  const migDir = path.join(dataDir, "migrations");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  return dataDir;
}

describe("TaskService (internal, fake provider)", () => {
  it("RULE_UPDATE persists rule (makerworld_sync_likes toggle)", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const res = await service.handlers().RULE_UPDATE?.(makeMsg("RULE_UPDATE", { rule_key: "makerworld_sync_likes", rule_value: "true" }));
      expect(res?.message_type).toBe("TASK_COMPLETE");
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      expect(new RuleCenter(manager.getDb()).getBool("makerworld_sync_likes", false)).toBe(true);
      manager.close();
    } finally {
      service.dispose();
    }
  });

  it("TASK_AI without provider returns clear error", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const res = await service.handlers().TASK_AI?.(makeMsg("TASK_AI", { collection_id: "c1" }));
      expect(res?.message_type).toBe("TASK_ERROR");
      expect(String(res?.payload?.code)).toContain("AI_002");
    } finally {
      service.dispose();
    }
  });

  it("TASK_AI with fake provider enqueues and produces pending suggestion", async () => {
    const dataDir = makeDataDir();
    const provider = new FakeProvider();
    const service = new TaskService({
      dataDir,
      migrationsDir: path.join(dataDir, "migrations"),
      getProvider: () => provider,
    });
    try {
      // 先入库一条收藏
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      new CollectionRepository(db).upsertByPlatformItem("makerworld", "model-1", {
        url: "https://makerworld.com.cn/zh/models/1",
        title: "测试模型",
      });
      const col = new CollectionRepository(db).findByUrl("https://makerworld.com.cn/zh/models/1");
      manager.close();

      const res = await service.handlers().TASK_AI?.(makeMsg("TASK_AI", { collection_id: (col as { id: string }).id }));
      expect(res?.message_type).toBe("TASK_COMPLETE");
      expect(provider.calls).toBe(1);

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const pending = new AIRepository(verifier.getDb()).listPendingSuggestions();
      expect(pending).toHaveLength(1);
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("TASK_SYNC with unknown platform returns failed report", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const res = await service.handlers().TASK_SYNC?.(makeMsg("TASK_SYNC", { platform: "nope", mode: "catalog" }));
      expect(res?.message_type).toBe("TASK_ERROR");
    } finally {
      service.dispose();
    }
  });

  it("AI_REVIEW_LIST + AI_REVIEW_UPDATE full review flow", async () => {
    const dataDir = makeDataDir();
    const provider = new FakeProvider();
    const service = new TaskService({
      dataDir,
      migrationsDir: path.join(dataDir, "migrations"),
      getProvider: () => provider,
    });
    try {
      // 先产生一条建议
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      new CollectionRepository(db).upsertByPlatformItem("xiaohongshu", "n-1", {
        url: "https://www.xiaohongshu.com/explore/n-1",
        title: "AI 笔记",
      });
      const col = new CollectionRepository(db).findByUrl("https://www.xiaohongshu.com/explore/n-1");
      manager.close();
      await service.handlers().TASK_AI?.(makeMsg("TASK_AI", { collection_id: (col as { id: string }).id }));

      const listRes = await service.handlers().AI_REVIEW_LIST?.(makeMsg("AI_REVIEW_LIST", {}));
      expect(listRes?.message_type).toBe("TASK_COMPLETE");
      const suggestions = (listRes?.payload?.suggestions ?? []) as Array<{ id: string; suggestion_type: string }>;
      expect(suggestions).toHaveLength(1);

      const updateRes = await service.handlers().AI_REVIEW_UPDATE?.(
        makeMsg("AI_REVIEW_UPDATE", { suggestion_id: suggestions[0].id, status: "accepted" }),
      );
      expect(updateRes?.message_type).toBe("TASK_COMPLETE");

      const after = await service.handlers().AI_REVIEW_LIST?.(makeMsg("AI_REVIEW_LIST", {}));
      expect((after?.payload?.suggestions ?? [])).toHaveLength(0);

      const bad = await service.handlers().AI_REVIEW_UPDATE?.(makeMsg("AI_REVIEW_UPDATE", { suggestion_id: "x", status: "nope" }));
      expect(bad?.message_type).toBe("TASK_ERROR");
    } finally {
      service.dispose();
    }
  });

  it("accepting suggested_group / suggested_topic / suggested_tag materializes", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const collections = new CollectionRepository(db);
      const c1 = collections.upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "AI 编程实战", author: "张三" });
      const c2 = collections.upsertByPlatformItem("youtube", "yt1", { url: "https://x/2", title: "AI 编程实战", author: "张三" });
      const ai = new AIRepository(db);
      const groupS = ai.saveSuggestion({
        collection_id: c1.id,
        suggestion_type: "suggested_group",
        payload: JSON.stringify({ name: "AI 编程实战", collection_ids: [c1.id, c2.id] }),
      });
      const topicS = ai.saveSuggestion({
        collection_id: c1.id,
        suggestion_type: "suggested_topic",
        payload: "AI 编程",
      });
      const tagS = ai.saveSuggestion({
        collection_id: c1.id,
        suggestion_type: "suggested_tag",
        payload: "编程",
      });
      manager.close();

      const h = service.handlers();
      expect((await h.AI_REVIEW_UPDATE?.(makeMsg("AI_REVIEW_UPDATE", { suggestion_id: groupS.id, status: "accepted" })))?.message_type).toBe("TASK_COMPLETE");
      expect((await h.AI_REVIEW_UPDATE?.(makeMsg("AI_REVIEW_UPDATE", { suggestion_id: topicS.id, status: "accepted" })))?.message_type).toBe("TASK_COMPLETE");
      expect((await h.AI_REVIEW_UPDATE?.(makeMsg("AI_REVIEW_UPDATE", { suggestion_id: tagS.id, status: "accepted" })))?.message_type).toBe("TASK_COMPLETE");

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const vdb = verifier.getDb();
      const groups = new ContentGroupRepository(vdb);
      expect(groups.groupOfCollection(c1.id)?.name).toBe("AI 编程实战");
      expect(new TopicRepository(vdb).findByName("AI 编程")?.status).toBe("accepted");
      expect(new TagRepository(vdb).listCollectionsByTag("编程", "ai")).toContain(c1.id);
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("TASK_ORGANIZE updates organize state and validates input", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("bilibili", "bv1", {
        url: "https://x/1",
        title: "T",
      });
      manager.close();

      const h = service.handlers();
      const bad = await h.TASK_ORGANIZE?.(makeMsg("TASK_ORGANIZE", { collection_id: col.id, organize_status: "nope" }));
      expect(bad?.message_type).toBe("TASK_ERROR");
      const ok = await h.TASK_ORGANIZE?.(makeMsg("TASK_ORGANIZE", { collection_id: col.id, organize_status: "organized" }));
      expect(ok?.message_type).toBe("TASK_COMPLETE");

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const updated = new CollectionRepository(verifier.getDb()).findById(col.id);
      expect(updated?.organize_status).toBe("organized");
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("TASK_TAG / TASK_TOPIC / TASK_PRIORITY apply user edits", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("xiaohongshu", "n1", { url: "https://x/1", title: "T" });
      manager.close();

      const h = service.handlers();
      expect((await h.TASK_TAG?.(makeMsg("TASK_TAG", { collection_id: col.id, tag: "AI" })))?.message_type).toBe("TASK_COMPLETE");
      expect((await h.TASK_TOPIC?.(makeMsg("TASK_TOPIC", { collection_id: col.id, topic: "AI 工程" })))?.message_type).toBe("TASK_COMPLETE");
      expect((await h.TASK_PRIORITY?.(makeMsg("TASK_PRIORITY", { collection_id: col.id, priority: "important" })))?.message_type).toBe("TASK_COMPLETE");

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const vdb = verifier.getDb();
      expect(new TagRepository(vdb).listTagsOfCollection(col.id).map((t) => t.name)).toEqual(["AI"]);
      expect(new TopicRepository(vdb).listTopicsOfCollection(col.id).map((t) => t.name)).toEqual(["AI 工程"]);
      expect(new CollectionRepository(vdb).findById(col.id)?.priority).toBe("important");
      verifier.close();
    } finally {
      service.dispose();
    }
  });
});
