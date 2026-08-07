import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MigrationManager,
  ContentGroupRepository,
  CollectionRepository,
} from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

let dataDir: string;
let manager: MigrationManager;
let groups: ContentGroupRepository;
let collections: CollectionRepository;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-cg-"));
  const migDir = path.join(dataDir, "migrations");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  manager = new MigrationManager(
    path.join(dataDir, "OmniCollector.db"),
    migDir,
    path.join(dataDir, "backup"),
  );
  manager.migrate();
  groups = new ContentGroupRepository(manager.getDb());
  collections = new CollectionRepository(manager.getDb());
});

afterAll(() => {
  manager.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("ContentGroupRepository", () => {
  it("binds multiple collections to one group and lists them in order", () => {
    const group = groups.createGroup("RV 减速器设计", "knowledge");
    const c1 = collections.upsertByPlatformItem("bilibili", "BV-rv1", {
      url: "https://bilibili.com/video/BV-rv1",
      collected_at: "2026-01-01T00:00:00Z",
    });
    const c2 = collections.upsertByPlatformItem("youtube", "yt-rv2", {
      url: "https://youtube.com/watch?v=yt-rv2",
      collected_at: "2026-02-01T00:00:00Z",
    });
    groups.bindCollection(group.id, c1.id);
    groups.bindCollection(group.id, c2.id);

    expect(groups.groupOfCollection(c1.id)?.id).toBe(group.id);
    expect(groups.groupOfCollection(c2.id)?.id).toBe(group.id);
    const list = groups.listCollectionsInGroup(group.id);
    expect(list.map((c) => c.platform)).toEqual(["bilibili", "youtube"]);
  });

  it("re-binds a collection to another group (0..1 constraint)", () => {
    const g1 = groups.createGroup("组A", "project");
    const g2 = groups.createGroup("组B", "knowledge");
    const c = collections.upsertByPlatformItem("xiaohongshu", "xhs-cg", {
      url: "https://xhslink.com/xhs-cg",
    });
    groups.bindCollection(g1.id, c.id);
    groups.bindCollection(g2.id, c.id);
    expect(groups.groupOfCollection(c.id)?.id).toBe(g2.id);
  });

  it("unbinds a collection", () => {
    const g = groups.createGroup("组C", "knowledge");
    const c = collections.upsertByPlatformItem("makerworld", "mw-cg", {
      url: "https://makerworld.com/mw-cg",
    });
    groups.bindCollection(g.id, c.id);
    groups.unbindCollection(c.id);
    expect(groups.groupOfCollection(c.id)).toBeUndefined();
  });
});
