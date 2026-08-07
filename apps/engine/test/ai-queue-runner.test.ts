import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import type { AIProvider } from "@omni/ai";
import { AIRepository, CollectionRepository, MigrationManager } from "@omni/database";
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
});
