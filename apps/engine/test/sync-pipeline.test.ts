import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MigrationManager,
  AccountRepository,
  AIRepository,
  CollectionRepository,
  CommentRepository,
  RuleCenter,
  SyncLogRepository,
  TagRepository,
} from "@omni/database";
import { BaseAdapter, type CollectionDetail, type CollectionRaw, type SyncCursor, type UniversalCollection } from "@omni/adapters";
import { SyncPipeline } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

class FakeAdapter extends BaseAdapter {
  readonly platform = "fake";
  readonly listUrl = "https://example.com";
  readonly itemSelector = ".i";
  readonly titleSelector = ".t";
  readonly urlSelector = "a";
  readonly authorSelector = ".a";
  readonly coverSelector = "img";
  readonly nextPage = "click";
  constructor(private readonly fail = false) {
    super();
  }
  async authenticate(): Promise<void> {}
  async validateSession(): Promise<"valid"> {
    return "valid";
  }
  async fetchCatalog(_ctx: unknown, _cursor: SyncCursor): Promise<CollectionRaw[]> {
    if (this.fail) throw new Error("adapter exploded");
    return Array.from({ length: 12 }, (_, i) => ({
      platformItemId: `BV-fake-${i}`,
      url: `https://example.com/video/BV-fake-${i}`,
      title: `视频 ${i}`,
      author: "UP",
      collectedAt: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
      saveType: "favorited" as const,
    }));
  }
  async fetchDetail(): Promise<CollectionDetail> {
    return {
      description: "描述",
      comments: [{ commentId: "c1", author: "用户", content: "好视频" }],
      publishedAt: "2026-01-01T00:00:00Z",
      contentType: "video",
    };
  }
  normalize(raw: CollectionRaw, detail?: CollectionDetail): UniversalCollection {
    return {
      platform: this.platform,
      platformItemId: raw.platformItemId,
      url: raw.url,
      title: raw.title,
      contentType: "video",
      saveType: raw.saveType,
      comments: detail?.comments ?? [],
      status: "active",
    };
  }
  async healthCheck() {
    return { platform: this.platform, parseFailureRate: 0, slowPageRatio: 0, collectedAt: new Date().toISOString() };
  }
  async cleanup(): Promise<void> {}
}

let dataDir: string;
let manager: MigrationManager;
let pipeline: SyncPipeline;
let collections: CollectionRepository;
let rulesCenter: RuleCenter;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-sp-"));
  const migDir = path.join(dataDir, "migrations");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  manager = new MigrationManager(
    path.join(dataDir, "OmniCollector.db"),
    migDir,
    path.join(dataDir, "backup"),
  );
  manager.migrate();
  const db = manager.getDb();
  collections = new CollectionRepository(db);
  rulesCenter = new RuleCenter(db);
  pipeline = new SyncPipeline({
    getAdapter: (platform) => (platform === "broken" ? new FakeAdapter(true) : new FakeAdapter()),
    collections,
    comments: new CommentRepository(db),
    accounts: new AccountRepository(db),
    rules: rulesCenter,
    logs: new SyncLogRepository(db),
    ai: new AIRepository(db),
  });
});

afterAll(() => {
  manager.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("SyncPipeline", () => {
  it("runs full sync: catalog -> sqlite -> details -> comments -> inbox done", async () => {
    const report = await pipeline.run("fake", "full");
    expect(report.status).toBe("success");
    expect(report.itemsAdded).toBe(12);
    expect(collections.count()).toBe(12);
    const row = collections.listByStatus("active")[0];
    expect(row.detail_synced).toBe(1);
    expect(row.inbox_status).toBe("done");
    expect(manager.getDb().prepare("SELECT COUNT(*) AS n FROM comments").get()).toEqual({ n: 12 });
    expect(manager.getDb().prepare("SELECT COUNT(*) AS n FROM sync_log WHERE status='success'").get()).toEqual({ n: 1 });
  });

  it("is incremental on second run (no duplicates)", async () => {
    const report = await pipeline.run("fake", "full");
    expect(report.status).toBe("success");
    expect(report.itemsAdded).toBe(0);
    expect(report.itemsUpdated).toBe(12);
    expect(collections.count()).toBe(12);
  });

  it("isolates a failing platform and logs failure", async () => {
    const report = await pipeline.run("broken", "catalog");
    expect(report.status).toBe("failed");
    expect(report.errorCode).toBe("SYNC_001");
    expect(manager.getDb().prepare("SELECT COUNT(*) AS n FROM sync_log WHERE status='failed'").get()).toEqual({ n: 1 });
    // 故障平台不影响其他平台
    const ok = await pipeline.run("fake", "catalog");
    expect(ok.status).toBe("success");
  });

  it("enqueues AI tasks when ai_enabled is on", async () => {
    rulesCenter.set("ai_enabled", "true");
    const report = await pipeline.run("fake", "full");
    expect(report.status).toBe("success");
    const queued = manager.getDb().prepare("SELECT COUNT(*) AS n FROM ai_queue WHERE status='queued'").get();
    expect((queued as { n: number }).n).toBe(12);
    rulesCenter.set("ai_enabled", "false");
  });

  it("extracts platform hashtags into tags with source=platform", async () => {
    const db = manager.getDb();
    const adapter = new FakeAdapter();
    adapter.fetchCatalog = async () => [
      {
        platformItemId: "BV-hashtag-1",
        url: "https://example.com/video/BV-hashtag-1",
        title: "桌搭推荐#生活美学 #桌搭好物",
        author: "UP",
        collectedAt: "2026-02-01T00:00:00Z",
        saveType: "favorited" as const,
      },
    ];
    const p = new SyncPipeline({
      getAdapter: () => adapter,
      collections: new CollectionRepository(db),
      comments: new CommentRepository(db),
      accounts: new AccountRepository(db),
      rules: rulesCenter,
      logs: new SyncLogRepository(db),
      ai: new AIRepository(db),
      tags: new TagRepository(db),
    });
    const report = await p.run("fake", "catalog");
    expect(report.status).toBe("success");
    const tags = new TagRepository(db);
    const names = tags.listTags().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["生活美学", "桌搭好物"]));
    const col = collections.findByUrl("https://example.com/video/BV-hashtag-1");
    expect(tags.listCollectionsByTag("生活美学", "platform")).toContain((col as { id: string }).id);
  });

  it("respects maxItems depth cap (deep history limit)", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-sp-depth-"));
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const m = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    m.migrate();
    const db = m.getDb();
    const p = new SyncPipeline({
      getAdapter: () => new FakeAdapter(),
      collections: new CollectionRepository(db),
      comments: new CommentRepository(db),
      accounts: new AccountRepository(db),
      rules: new RuleCenter(db),
      logs: new SyncLogRepository(db),
      ai: new AIRepository(db),
    });
    const report = await p.run("fake", "catalog", undefined, 5);
    expect(report.status).toBe("success");
    expect(report.itemsAdded).toBe(5);
    expect(new CollectionRepository(db).count()).toBe(5);
    m.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
