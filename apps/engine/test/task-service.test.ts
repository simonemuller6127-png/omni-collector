import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import type { AIProvider } from "@omni/ai";
import type { OmniMessage } from "@omni/shared-core";
import { AIRepository, CollectionRepository, MigrationManager, RuleCenter } from "@omni/database";
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
});
