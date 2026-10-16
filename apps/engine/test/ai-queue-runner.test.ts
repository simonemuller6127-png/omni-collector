import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import type { AIProvider } from "@omni/ai";
import {
  AIRepository,
  CollectionRepository,
  CommentRepository,
  MigrationManager,
  RuleCenter,
} from "@omni/database";
import { AiQueueRunner } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

class FakeProvider implements AIProvider {
  readonly name = "fake";
  calls = 0;
  /** 记录每次 user prompt，供断言评论段与排序。 */
  prompts: string[] = [];
  constructor(
    private readonly reply = JSON.stringify([
      { type: "suggested_tag", payload: '["AI", "编程"]', confidence: 0.9 },
      { type: "suggested_summary", payload: "AI 编程技巧汇总", confidence: 0.8 },
    ]),
  ) {}
  async chat(messages: Array<{ role: string; content: string }>) {
    this.calls += 1;
    this.prompts.push(messages[1]?.content ?? "");
    return { text: this.reply };
  }
}

const NEW_TYPES_REPLY = JSON.stringify([
  { type: "suggested_tag", payload: '["AI", "编程"]', confidence: 0.9 },
  { type: "suggested_content_tags", payload: '["编程", "Agent 实践"]', confidence: 0.9 },
  { type: "suggested_content_type", payload: "视频", confidence: 0.9 },
  { type: "suggested_summary", payload: "AI 编程技巧汇总", confidence: 0.8 },
]);

describe("AiQueueRunner", () => {
  it("joins queue items with collection content and saves pending suggestions", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-ai-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });

    // 种子数据：1 条收藏 + 1 条队列
    const seeder = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    seeder.migrate();
    const db = seeder.getDb();
    const collections = new CollectionRepository(db);
    collections.upsertByPlatformItem("xiaohongshu", "note-1", {
      url: "https://www.xiaohongshu.com/explore/note-1",
      title: "AI 编程技巧",
      description: "Agent 最佳实践",
    });
    const col = collections.findByUrl("https://www.xiaohongshu.com/explore/note-1");
    expect(col).toBeDefined();
    const aiRepo = new AIRepository(db);
    aiRepo.enqueue((col as { id: string }).id);
    new RuleCenter(db).set("ai_enabled", "true");
    seeder.close();

    const provider = new FakeProvider();
    const runner = new AiQueueRunner({ dataDir, migrationsDir: migDir, provider });
    const result = await runner.run();
    expect(result.processed).toBe(1);
    expect(result.suggestionsCreated).toBe(2);
    expect(result.failed).toBe(0);
    expect(provider.calls).toBe(1);

    // 验证落库：pending 建议 + 队列 done
    const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    verifier.migrate();
    const vdb = verifier.getDb();
    const pending = new AIRepository(vdb).listPendingSuggestions();
    expect(pending).toHaveLength(2);
    expect(pending.every((s) => s.status === "pending")).toBe(true);
    const queueDone = vdb.prepare("SELECT COUNT(*) AS n FROM ai_queue WHERE status = 'done'").get() as { n: number };
    expect(queueDone.n).toBe(1);
    verifier.close();
  });

  it("respects per-feature AI switches (tag disabled -> only summary saved)", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-ai-feat-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const seeder = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    seeder.migrate();
    const db = seeder.getDb();
    const collections = new CollectionRepository(db);
    collections.upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T" });
    const col = collections.findByUrl("https://x/1");
    const aiRepo = new AIRepository(db);
    aiRepo.enqueue((col as { id: string }).id);
    const rules = new RuleCenter(db);
    rules.set("ai_enabled", "true");
    rules.set("ai_tag_enabled", "false");
    seeder.close();

    const provider = new FakeProvider();
    const result = await new AiQueueRunner({ dataDir, migrationsDir: migDir, provider }).run();
    expect(result.suggestionsCreated).toBe(1);
    expect(provider.calls).toBe(1);
    const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    verifier.migrate();
    const pending = new AIRepository(verifier.getDb()).listPendingSuggestions();
    expect(pending.map((s) => s.suggestion_type)).toEqual(["suggested_summary"]);
    verifier.close();
  });

  it("skips execution when daily call cap is reached", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-ai-cap-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const seeder = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    seeder.migrate();
    const db = seeder.getDb();
    const collections = new CollectionRepository(db);
    collections.upsertByPlatformItem("bilibili", "bv1", { url: "https://x/1", title: "T1" });
    collections.upsertByPlatformItem("bilibili", "bv2", { url: "https://x/2", title: "T2" });
    const c1 = collections.findByUrl("https://x/1");
    const c2 = collections.findByUrl("https://x/2");
    const aiRepo = new AIRepository(db);
    // 今天已消耗 1 次调用（done 队列）
    aiRepo.enqueue((c1 as { id: string }).id);
    const doneRow = aiRepo.nextBatch(1)[0];
    aiRepo.markProcessing(doneRow.id);
    aiRepo.markDone(doneRow.id);
    aiRepo.enqueue((c2 as { id: string }).id);
    const rules = new RuleCenter(db);
    rules.set("ai_enabled", "true");
    rules.set("ai_daily_call_limit", "1");
    seeder.close();

    const provider = new FakeProvider();
    const result = await new AiQueueRunner({ dataDir, migrationsDir: migDir, provider }).run();
    expect(result.processed).toBe(0);
    expect(provider.calls).toBe(0);
    const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    verifier.migrate();
    expect(verifier.getDb().prepare("SELECT COUNT(*) n FROM ai_queue WHERE status='queued'").get()).toEqual({ n: 1 });
    verifier.close();
  });

  it("feeds top-N comments by like_count desc into the prompt and re-analyzes on comment change", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-ai-cmt-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const seeder = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    seeder.migrate();
    const db = seeder.getDb();
    const collections = new CollectionRepository(db);
    collections.upsertByPlatformItem("bilibili", "bv-cmt", { url: "https://x/cmt", title: "带评论的视频" });
    const col = collections.findByUrl("https://x/cmt");
    const commentRepo = new CommentRepository(db);
    // 6 条评论，like_count 递增：验证只取前 5 且按点赞降序
    for (let i = 1; i <= 6; i += 1) {
      commentRepo.upsertComments((col as { id: string }).id, [
        { comment_id: `c${i}`, content: `评论${i}`, like_count: i },
      ]);
    }
    const aiRepo = new AIRepository(db);
    aiRepo.enqueue((col as { id: string }).id);
    const rules = new RuleCenter(db);
    rules.set("ai_enabled", "true");
    rules.set("ai_comment_context_limit", "5");
    seeder.close();

    const provider = new FakeProvider(NEW_TYPES_REPLY);
    const first = await new AiQueueRunner({ dataDir, migrationsDir: migDir, provider }).run();
    expect(first.suggestionsCreated).toBe(4);
    expect(provider.calls).toBe(1);
    const prompt = provider.prompts[0];
    expect(prompt).toContain("评论6"); // 最高赞在场
    expect(prompt).toContain("评论2"); // 第 5 名在场
    expect(prompt).not.toContain("评论1"); // 第 6 名被截断
    expect(prompt.indexOf("评论6")).toBeLessThan(prompt.indexOf("评论5"));
    // 新类型全部落库
    const v1 = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    v1.migrate();
    expect(new AIRepository(v1.getDb()).listPendingSuggestions().map((s) => s.suggestion_type).sort()).toEqual([
      "suggested_content_tags",
      "suggested_content_type",
      "suggested_summary",
      "suggested_tag",
    ]);
    v1.close();

    // 改一条评论内容 → 指纹变化 → 重新入队后重新分析（provider 再被调用一次）
    const reopen = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    reopen.migrate();
    new CommentRepository(reopen.getDb()).upsertComments((col as { id: string }).id, [
      { comment_id: "c6", content: "评论6-已改", like_count: 6 },
    ]);
    // 模拟评论刷新后重新入队（真实链路由 refreshComments/sync 触发）
    new AIRepository(reopen.getDb()).enqueue((col as { id: string }).id);
    reopen.close();
    const before = provider.calls;
    await new AiQueueRunner({ dataDir, migrationsDir: migDir, provider }).run();
    expect(provider.calls).toBe(before + 1);
    expect(provider.prompts[provider.prompts.length - 1]).toContain("评论6-已改");
  });

  it("honors the new per-feature switches (content_tag disabled -> not saved)", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-ai-ct-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const seeder = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    seeder.migrate();
    const db = seeder.getDb();
    const collections = new CollectionRepository(db);
    collections.upsertByPlatformItem("bilibili", "bv-ct", { url: "https://x/ct", title: "T" });
    const col = collections.findByUrl("https://x/ct");
    new AIRepository(db).enqueue((col as { id: string }).id);
    const rules = new RuleCenter(db);
    rules.set("ai_enabled", "true");
    rules.set("ai_content_tag_enabled", "false");
    seeder.close();

    const provider = new FakeProvider(NEW_TYPES_REPLY);
    const result = await new AiQueueRunner({ dataDir, migrationsDir: migDir, provider }).run();
    expect(result.suggestionsCreated).toBe(3); // 4 条去掉 content_tags 后剩 3 条
    const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    verifier.migrate();
    const types = new AIRepository(verifier.getDb()).listPendingSuggestions().map((s) => s.suggestion_type).sort();
    expect(types).not.toContain("suggested_content_tags");
    expect(types).toContain("suggested_content_type");
    verifier.close();
  });

  it("truncates content_tags suggestions to ai_tag_max_count", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-ai-max-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const seeder = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    seeder.migrate();
    const db = seeder.getDb();
    const collections = new CollectionRepository(db);
    collections.upsertByPlatformItem("bilibili", "bv-max", { url: "https://x/max", title: "T" });
    const col = collections.findByUrl("https://x/max");
    new AIRepository(db).enqueue((col as { id: string }).id);
    const rules = new RuleCenter(db);
    rules.set("ai_enabled", "true");
    rules.set("ai_tag_max_count", "2");
    seeder.close();

    const provider = new FakeProvider(
      JSON.stringify([{ type: "suggested_content_tags", payload: '["甲","乙","丙","丁"]' }]),
    );
    await new AiQueueRunner({ dataDir, migrationsDir: migDir, provider }).run();
    const verifier = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    verifier.migrate();
    const saved = new AIRepository(verifier.getDb()).listPendingSuggestions();
    expect(saved).toHaveLength(1);
    expect(JSON.parse(saved[0].payload ?? "[]")).toEqual(["甲", "乙"]);
    verifier.close();
  });
});
