import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import {
  CollectionRepository,
  FileRepository,
  MigrationManager,
} from "@omni/database";
import { FileIndexer } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("FileIndexer enhanced (OMNI_SYSTEM link)", () => {
  it("links markdown with system zone url to the matching collection", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-fi-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    manager.migrate();
    const db = manager.getDb();

    const col = new CollectionRepository(db).upsertByPlatformItem("bilibili", "bv1", {
      url: "https://www.bilibili.com/video/bv1",
      title: "AI 编程实战",
    });
    const folder = path.join(dataDir, "notes");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, "AI 编程实战.md"),
      [
        "<!-- OMNI_SYSTEM_START -->",
        "title: [Engine 数据区，Plugin 自动写入]",
        "platform: bilibili",
        "url: https://www.bilibili.com/video/bv1",
        "sync_status: full",
        "<!-- OMNI_SYSTEM_END -->",
        "",
        "# AI 编程实战",
        "我的笔记",
      ].join("\n"),
      "utf8",
    );

    const files = new FileRepository(db);
    const indexer = new FileIndexer(files, (url) => new CollectionRepository(db).findByUrl(url)?.id);
    const report = indexer.scan(folder, true);
    expect(report.errors).toEqual([]);
    expect(report.indexed).toBe(1);
    const row = files.queryByPath(path.join(folder, "AI 编程实战.md"));
    expect(row?.linked_collection_id).toBe(col.id);
    manager.close();
  });
});
