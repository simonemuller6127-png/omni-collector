import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import type { AIProvider } from "@omni/ai";
import { AIRepository, CollectionRepository, MigrationManager, RuleCenter } from "@omni/database";
import { AiQueueRunner } from "../src/index.js";

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
    return {
      text: JSON.stringify([
        { type: "suggested_tag", payload: '["AI", "编程"]', confidence: 0.9 },
        { type: "suggested_summary", payload: "AI 编程技巧汇总", confidence: 0.8 },
      ]),
    };
  }
}

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
});
