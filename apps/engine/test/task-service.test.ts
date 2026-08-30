import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import type { AIProvider } from "@omni/ai";
import type { OmniMessage } from "@omni/shared-core";
import {
  AIRepository,
  AccountRepository,
  CollectionRepository,
  CommentRepository,
  ContentGroupRepository,
  MigrationManager,
  RuleCenter,
  TagRepository,
  TopicRepository,
  UserRepository,
} from "@omni/database";
import { CookieCipher, TaskService } from "../src/index.js";

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

  it("accepting suggested_tag with JSON array splits into individual tags", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("xiaohongshu", "n1", {
        url: "https://x/1",
        title: "桌搭笔记",
      });
      const ai = new AIRepository(db);
      const s = ai.saveSuggestion({
        collection_id: col.id,
        suggestion_type: "suggested_tag",
        payload: '["生活美学","美术生"]',
      });
      manager.close();

      const h = service.handlers();
      expect((await h.AI_REVIEW_UPDATE?.(makeMsg("AI_REVIEW_UPDATE", { suggestion_id: s.id, status: "accepted" })))?.message_type).toBe("TASK_COMPLETE");

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const vdb = verifier.getDb();
      const tags = new TagRepository(vdb);
      expect(tags.listCollectionsByTag("生活美学", "ai")).toContain(col.id);
      expect(tags.listCollectionsByTag("美术生", "ai")).toContain(col.id);
      expect(tags.listTags().map((t) => t.name)).not.toContain('["生活美学","美术生"]');
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("accepting suggested_summary writes ai_summary and marks done", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("youtube", "yt1", { url: "https://x/1", title: "T" });
      const s = new AIRepository(db).saveSuggestion({
        collection_id: col.id,
        suggestion_type: "suggested_summary",
        payload: "这是一段 AI 摘要。",
      });
      manager.close();
      const h = service.handlers();
      expect((await h.AI_REVIEW_UPDATE?.(makeMsg("AI_REVIEW_UPDATE", { suggestion_id: s.id, status: "accepted" })))?.message_type).toBe("TASK_COMPLETE");
      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const row = new CollectionRepository(verifier.getDb()).findById(col.id);
      expect(row?.ai_summary).toBe("这是一段 AI 摘要。");
      expect(row?.ai_status).toBe("done");
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("AI_REVIEW_UNDO reverts accepted tag within 24h and restores pending", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T" });
      const s = new AIRepository(db).saveSuggestion({ collection_id: col.id, suggestion_type: "suggested_tag", payload: '"生活美学"' });
      manager.close();

      const h = service.handlers();
      await h.AI_REVIEW_UPDATE?.(makeMsg("AI_REVIEW_UPDATE", { suggestion_id: s.id, status: "accepted" }));
      const undo = await h.AI_REVIEW_UNDO?.(makeMsg("AI_REVIEW_UNDO", { suggestion_id: s.id }));
      expect(undo?.message_type).toBe("TASK_COMPLETE");

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const vdb = verifier.getDb();
      expect(new TagRepository(vdb).listCollectionsByTag("生活美学", "ai")).not.toContain(col.id);
      expect(new AIRepository(vdb).findById(s.id)?.status).toBe("pending");
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("AI_REVIEW_UNDO rejects suggestions accepted more than 24h ago", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T" });
      const s = new AIRepository(db).saveSuggestion({ collection_id: col.id, suggestion_type: "suggested_tag", payload: "x" });
      db.prepare("UPDATE ai_suggestions SET status='accepted', reviewed_at=datetime('now','-25 hours') WHERE id=?").run(s.id);
      manager.close();
      const res = await service.handlers().AI_REVIEW_UNDO?.(makeMsg("AI_REVIEW_UNDO", { suggestion_id: s.id }));
      expect(res?.message_type).toBe("TASK_ERROR");
    } finally {
      service.dispose();
    }
  });

  it("AI_REVIEW_LIST expires old pending and returns collection title", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "我的收藏标题" });
      const old = new AIRepository(db).saveSuggestion({ collection_id: col.id, suggestion_type: "suggested_tag", payload: "旧" });
      db.prepare("UPDATE ai_suggestions SET created_at = datetime('now','-31 days') WHERE id = ?").run(old.id);
      const fresh = new AIRepository(db).saveSuggestion({ collection_id: col.id, suggestion_type: "suggested_tag", payload: "新" });
      manager.close();
      const res = await service.handlers().AI_REVIEW_LIST?.(makeMsg("AI_REVIEW_LIST", {}));
      const items = (res?.payload?.suggestions ?? []) as Array<{ id: string; collection_title?: string }>;
      expect(items.find((i) => i.id === fresh.id)?.collection_title).toBe("我的收藏标题");
      expect(items.find((i) => i.id === old.id)).toBeUndefined();
    } finally {
      service.dispose();
    }
  });

  it("rejecting a suggestion records user feedback", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T" });
      const s = new AIRepository(db).saveSuggestion({ collection_id: col.id, suggestion_type: "suggested_tag", payload: "x" });
      manager.close();
      const res = await service.handlers().AI_REVIEW_UPDATE?.(makeMsg("AI_REVIEW_UPDATE", { suggestion_id: s.id, status: "rejected" }));
      expect(res?.message_type).toBe("TASK_COMPLETE");
      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const fb = verifier.getDb().prepare("SELECT event_type, event_data FROM user_feedback WHERE collection_id = ?").all(col.id) as Array<{ event_type: string; event_data: string }>;
      expect(fb.some((r) => r.event_type === "ai_tag_rejected" && JSON.parse(r.event_data).suggestion_id === s.id)).toBe(true);
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("TAG_LIST / TAG_ALIAS_ADD / TAG_MERGE / TAG_RENAME / TOPIC_LIST / TOPIC_RENAME handlers work", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const collections = new CollectionRepository(db);
      const col = collections.upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T" });
      const tags = new TagRepository(db);
      const a = tags.ensureTag("生活美");
      tags.bindTag(col.id, a.id, "platform");
      tags.ensureTag("生活美学");
      const topics = new TopicRepository(db);
      const topic = topics.createTopic("设计", col.id);
      topics.setStatus(topic.id, "accepted");
      manager.close();

      const h = service.handlers();
      const listTags = await h.TAG_LIST?.(makeMsg("TAG_LIST", {}));
      const tagRows = (listTags?.payload?.tags ?? []) as Array<{ name: string; count: number }>;
      expect(tagRows.find((t) => t.name === "生活美")?.count).toBe(1);
      expect((await h.TAG_ALIAS_ADD?.(makeMsg("TAG_ALIAS_ADD", { tag: "生活美", alias: "shm" })))?.message_type).toBe("TASK_COMPLETE");
      expect((await h.TAG_MERGE?.(makeMsg("TAG_MERGE", { source: "生活美", target: "生活美学" })))?.message_type).toBe("TASK_COMPLETE");
      expect((await h.TAG_RENAME?.(makeMsg("TAG_RENAME", { tag: "生活美学", next: "生活美学设计" })))?.message_type).toBe("TASK_COMPLETE");

      const listTopics = await h.TOPIC_LIST?.(makeMsg("TOPIC_LIST", {}));
      const topicRows = (listTopics?.payload?.topics ?? []) as Array<{ name: string; count: number }>;
      expect(topicRows.find((t) => t.name === "设计")?.count).toBe(1);
      expect((await h.TOPIC_RENAME?.(makeMsg("TOPIC_RENAME", { topic_id: topic.id, name: "设计思维" })))?.message_type).toBe("TASK_COMPLETE");

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const vdb = verifier.getDb();
      expect(new TagRepository(vdb).ensureTag("生活美").name).toBe("生活美学设计");
      expect(new TopicRepository(vdb).findById(topic.id)?.name).toBe("设计思维");
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("summary includes topics count", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T" });
      const topics = new TopicRepository(db);
      const t = topics.createTopic("主题", col.id);
      topics.setStatus(t.id, "accepted");
      manager.close();
      const res = await service.handlers().STATUS_QUERY?.(makeMsg("STATUS_QUERY", { scope: "summary" }));
      expect((res?.payload?.summary as { topics: number }).topics).toBe(1);
    } finally {
      service.dispose();
    }
  });

  it("TASK_AI_MANUAL_BATCH saves suggestions per indexed collection", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const c1 = new CollectionRepository(db).upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T1" });
      const c2 = new CollectionRepository(db).upsertByPlatformItem("youtube", "yt1", { url: "https://x/2", title: "T2" });
      manager.close();

      const reply = JSON.stringify([
        { index: 0, suggestions: [{ type: "suggested_tag", payload: '["生活美学"]' }] },
        { index: 1, suggestions: [{ type: "suggested_topic", payload: "设计" }] },
      ]);
      const res = await service.handlers().TASK_AI_MANUAL_BATCH?.(
        makeMsg("TASK_AI_MANUAL_BATCH", { collection_ids: [c1.id, c2.id], reply }),
      );
      expect(res?.message_type).toBe("TASK_COMPLETE");
      expect((res?.payload?.saved as number)).toBe(2);

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const rows = (verifier
        .getDb()
        .prepare("SELECT collection_id, suggestion_type, model FROM ai_suggestions")
        .all() as Array<{ collection_id: string; suggestion_type: string; model: string }>)
        .sort((a, b) => (a.collection_id < b.collection_id ? -1 : 1));
      expect(rows).toEqual(
        [
          { collection_id: c1.id, suggestion_type: "suggested_tag", model: "manual-batch" },
          { collection_id: c2.id, suggestion_type: "suggested_topic", model: "manual-batch" },
        ].sort((a, b) => (a.collection_id < b.collection_id ? -1 : 1)),
      );
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("COOKIE_IMPORT encrypts cookies locally and COOKIE_STATUS reports them", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const h = service.handlers();
      const bad = await h.COOKIE_IMPORT?.(makeMsg("COOKIE_IMPORT", { platform: "bilibili", cookies_json: "[]" }));
      expect(bad?.message_type).toBe("TASK_ERROR");

      const json = JSON.stringify([{ name: "SESSDATA", value: "abc", domain: ".bilibili.com" }]);
      const ok = await h.COOKIE_IMPORT?.(makeMsg("COOKIE_IMPORT", { platform: "bilibili", cookies_json: json }));
      expect(ok?.message_type).toBe("TASK_COMPLETE");
      expect(ok?.payload?.cookie_count).toBe(1);

      const status = await h.COOKIE_STATUS?.(makeMsg("COOKIE_STATUS", { platform: "bilibili" }));
      expect(status?.message_type).toBe("TASK_COMPLETE");
      expect(status?.payload).toMatchObject({
        platform: "bilibili",
        has_cookie: true,
        cookie_count: 1,
        valid: true,
        account_status: "active",
      });
      expect(new CookieCipher(dataDir).decryptCookie("bilibili")).toBe(json);

      const unknown = await h.COOKIE_STATUS?.(makeMsg("COOKIE_STATUS", { platform: "nope" }));
      expect(unknown?.message_type).toBe("TASK_ERROR");
    } finally {
      service.dispose();
    }
  });

  it("RULE_LIST returns rules with impact and recent changes", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const h = service.handlers();
      await h.RULE_UPDATE?.(makeMsg("RULE_UPDATE", { rule_key: "init_full_detail_limit", rule_value: "60" }));
      const res = await h.RULE_LIST?.(makeMsg("RULE_LIST", {}));
      expect(res?.message_type).toBe("TASK_COMPLETE");
      const rules = (res?.payload?.rules ?? []) as Array<{ rule_key: string; impact?: string | null }>;
      expect(rules.find((r) => r.rule_key === "ai_enabled")?.impact).toContain("全局开关");
      const changes = (res?.payload?.changes ?? []) as Array<{ rule_key: string; new_value: string }>;
      expect(changes[0].rule_key).toBe("init_full_detail_limit");
      expect(changes[0].new_value).toBe("60");
    } finally {
      service.dispose();
    }
  });

  it("STATUS_QUERY platforms returns health level with error reason", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const accounts = new AccountRepository(db);
      accounts.getOrCreate("bilibili");
      accounts.updateCursor("bilibili", "{}");
      accounts.getOrCreate("youtube");
      accounts.setStatus("youtube", "error", "cookie expired");
      manager.close();
      const res = await service.handlers().STATUS_QUERY?.(makeMsg("STATUS_QUERY", { scope: "platforms" }));
      const platforms = (res?.payload?.platforms ?? []) as Array<{
        platform: string;
        health?: { level: string; reason?: string };
      }>;
      expect(platforms.find((p) => p.platform === "bilibili")?.health?.level).toBe("green");
      const yt = platforms.find((p) => p.platform === "youtube");
      expect(yt?.health?.level).toBe("red");
      expect(yt?.health?.reason).toContain("cookie");
    } finally {
      service.dispose();
    }
  });

  it("summary includes anomaly counts (deleted/syncFailed/fileMissing)", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const collections = new CollectionRepository(db);
      collections.upsertByPlatformItem("bilibili", "d1", { url: "https://x/1", title: "D" });
      collections.upsertByPlatformItem("bilibili", "f1", { url: "https://x/2", title: "F" });
      collections.upsertByPlatformItem("bilibili", "m1", { url: "https://x/3", title: "M" });
      db.prepare("UPDATE collections SET content_status='deleted' WHERE platform_item_id='d1'").run();
      db.prepare("UPDATE collections SET sync_status='failed' WHERE platform_item_id='f1'").run();
      db.prepare("UPDATE collections SET content_status='file_missing' WHERE platform_item_id='m1'").run();
      manager.close();
      const res = await service.handlers().STATUS_QUERY?.(makeMsg("STATUS_QUERY", { scope: "summary" }));
      expect((res?.payload?.summary as { anomalies: { deleted: number; syncFailed: number; fileMissing: number } }).anomalies).toEqual({
        deleted: 1,
        syncFailed: 1,
        fileMissing: 1,
      });
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

  it("TASK_RATING writes user_rating sync copy (PRD 29.2), 0 clears", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const col = new CollectionRepository(manager.getDb()).upsertByPlatformItem("bilibili", "bv1", { url: "https://b23.tv/BV1", title: "视频" });
      manager.close();

      const h = service.handlers();
      const bad = await h.TASK_RATING?.(makeMsg("TASK_RATING", { collection_id: col.id, rating: 6 }));
      expect(bad?.message_type).toBe("TASK_ERROR");
      expect(String(bad?.payload?.code)).toContain("RAT_001");

      const set = await h.TASK_RATING?.(makeMsg("TASK_RATING", { collection_id: col.id, rating: 4 }));
      expect(set?.message_type).toBe("TASK_COMPLETE");
      expect(set?.payload?.rating).toBe(4);

      const clear = await h.TASK_RATING?.(makeMsg("TASK_RATING", { collection_id: col.id, rating: 0 }));
      expect(clear?.message_type).toBe("TASK_COMPLETE");
      expect(clear?.payload?.rating).toBeNull();

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      expect(new UserRepository(verifier.getDb()).getNote(col.id)?.user_rating ?? null).toBeNull();
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("TASK_COMMENT_STAR toggles is_starred within collection scope (PRD 7.3)", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const db = manager.getDb();
      const col = new CollectionRepository(db).upsertByPlatformItem("bilibili", "bv2", { url: "https://b23.tv/BV2", title: "视频2" });
      new CommentRepository(db).upsertComments(col.id, [
        { comment_id: "c1", author: "甲", content: "好文", like_count: 10 },
        { comment_id: "c2", author: "乙", content: "收藏了", like_count: 5 },
      ]);
      const comments = new CommentRepository(db).getByCollection(col.id);
      manager.close();
      const target = comments.find((c) => c.comment_id === "c1")!;

      const h = service.handlers();
      const star = await h.TASK_COMMENT_STAR?.(makeMsg("TASK_COMMENT_STAR", { collection_id: col.id, comment_id: target.id, starred: true }));
      expect(star?.message_type).toBe("TASK_COMPLETE");

      const mismatch = await h.TASK_COMMENT_STAR?.(makeMsg("TASK_COMMENT_STAR", { collection_id: "no-such", comment_id: target.id, starred: true }));
      expect(mismatch?.message_type).toBe("TASK_ERROR");
      expect(String(mismatch?.payload?.code)).toContain("STAR_002");

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const after = new CommentRepository(verifier.getDb()).getByCollection(col.id).find((c) => c.id === target.id);
      expect(after?.is_starred).toBe(1);
      verifier.close();
    } finally {
      service.dispose();
    }
  });

  it("user_feedback events recorded on organize/priority/rating (PRD 18.1)", async () => {
    const dataDir = makeDataDir();
    const service = new TaskService({ dataDir, migrationsDir: path.join(dataDir, "migrations") });
    try {
      const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      manager.migrate();
      const col = new CollectionRepository(manager.getDb()).upsertByPlatformItem("bilibili", "bv3", { url: "https://b23.tv/BV3", title: "视频3" });
      manager.close();

      const h = service.handlers();
      await h.TASK_ORGANIZE?.(makeMsg("TASK_ORGANIZE", { collection_id: col.id, organize_status: "organized" }));
      await h.TASK_PRIORITY?.(makeMsg("TASK_PRIORITY", { collection_id: col.id, priority: "project" }));
      await h.TASK_RATING?.(makeMsg("TASK_RATING", { collection_id: col.id, rating: 5 }));

      const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), path.join(dataDir, "migrations"), path.join(dataDir, "backup"));
      verifier.migrate();
      const events = (verifier.getDb().prepare("SELECT event_type FROM user_feedback WHERE collection_id = ?").all(col.id) as Array<{ event_type: string }>).map((r) => r.event_type);
      expect(events).toContain("organize_status_set");
      expect(events).toContain("organize_completed");
      expect(events).toContain("priority_set");
      expect(events).toContain("rating_set");
      verifier.close();
    } finally {
      service.dispose();
    }
  });
});
