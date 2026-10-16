import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MigrationManager, FileRepository } from "@omni/database";
import { FileIndexer } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

let dataDir: string;
let folder: string;
let manager: MigrationManager;
let files: FileRepository;
let indexer: FileIndexer;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-fi-"));
  const migDir = path.join(dataDir, "migrations");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  manager = new MigrationManager(
    path.join(dataDir, "OmniCollector.db"),
    migDir,
    path.join(dataDir, "backup"),
  );
  manager.migrate();
  files = new FileRepository(manager.getDb());
  indexer = new FileIndexer(files);

  folder = path.join(dataDir, "docs");
  fs.mkdirSync(path.join(folder, "sub"), { recursive: true });
  fs.writeFileSync(
    path.join(folder, "a.md"),
    "---\ntitle: 我的笔记\ntags: [前端, TypeScript]\n---\n# 标题\n正文",
    "utf8",
  );
  fs.writeFileSync(path.join(folder, "b.txt"), "hello", "utf8");
  fs.writeFileSync(path.join(folder, "sub", "c.pdf"), "pdf-bytes", "utf8");
});

afterAll(() => {
  manager.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("FileIndexer", () => {
  it("indexes files with metadata only and extracts markdown frontmatter", () => {
    const report = indexer.scan(folder, { enhanced: true, hashing: true });
    expect(report.scanned).toBe(3);
    expect(report.errors).toHaveLength(0);
    const md = files.queryByPath(path.join(folder, "a.md"));
    expect(md?.file_type).toBe(".md");
    expect(md?.file_hash).toHaveLength(64);
    const index = manager
      .getDb()
      .prepare("SELECT * FROM file_index WHERE file_id = ?")
      .get(md?.id) as { extracted_title: string; analysis_status: string };
    expect(index.extracted_title).toBe("我的笔记");
    expect(index.analysis_status).toBe("done");
    const txt = files.queryByPath(path.join(folder, "b.txt"));
    const txtIndex = manager
      .getDb()
      .prepare("SELECT analysis_status FROM file_index WHERE file_id = ?")
      .get(txt?.id) as { analysis_status: string };
    expect(txtIndex.analysis_status).toBe("skipped");
  });

  it("does not create any TXT copies and is idempotent", () => {
    const before = fs.readdirSync(folder, { recursive: true }).filter((f) => String(f).endsWith(".txt"));
    indexer.scan(folder, { enhanced: true, hashing: true });
    const after = fs.readdirSync(folder, { recursive: true }).filter((f) => String(f).endsWith(".txt"));
    expect(after).toEqual(before);
    expect(files.queryByPath(path.join(folder, "a.md"))).toBeDefined();
    expect(manager.getDb().prepare("SELECT COUNT(*) AS n FROM local_files").get()).toEqual({ n: 3 });
  });

  it("marks files missing via repository", () => {
    const row = files.queryByPath(path.join(folder, "b.txt"));
    files.markMissing(row!.id);
    expect(files.queryByPath(path.join(folder, "b.txt"))?.content_status).toBe("file_missing");
  });

  it("relocates missing files by hash after a move (PRD 9.7 second layer)", () => {
    // b.txt 已在上一用例标记为 missing；把它移动到 sub/ 下再扫描
    const oldPath = path.join(folder, "b.txt");
    const oldHash = files.queryByPath(oldPath)!.file_hash;
    fs.rmSync(oldPath);
    fs.writeFileSync(path.join(folder, "sub", "b.txt"), "hello", "utf8");
    const report = indexer.scan(folder, { enhanced: false, hashing: true });
    expect(report.relocated).toBeGreaterThanOrEqual(1);
    // 新路径行接管：同哈希、active；旧路径的丢失行被合并删除
    const moved = files.queryByPath(path.join(folder, "sub", "b.txt"));
    expect(moved).toBeDefined();
    expect(moved?.content_status).toBe("active");
    expect(moved?.file_hash).toBe(oldHash);
    expect(files.queryByPath(oldPath)).toBeUndefined();
  });

  it("extracts chapter titles and toc only in enhanced mode", () => {
    const mdPath = path.join(folder, "a.md");
    fs.writeFileSync(mdPath, "---\ntitle: 我的笔记\n---\n# 我的笔记\n## 背景\n正文\n### 目标\n更多\n", "utf8");
    const db = manager.getDb();
    const row = files.queryByPath(mdPath)!;
    // 关闭增强：只写标题
    indexer.scan(folder, { enhanced: false, hashing: false });
    const plain = db.prepare("SELECT * FROM file_index WHERE file_id = ?").get(row.id) as { chapter_titles: string | null };
    expect(plain.chapter_titles).toBeNull();
    // 开启增强：写入章节与 TOC
    indexer.scan(folder, { enhanced: true, hashing: false });
    const enhanced = db.prepare("SELECT * FROM file_index WHERE file_id = ?").get(row.id) as {
      chapter_titles: string;
      toc_json: string;
    };
    expect(JSON.parse(enhanced.chapter_titles)).toEqual(["背景", "目标"]);
    expect(JSON.parse(enhanced.toc_json)).toEqual([
      { level: 1, title: "我的笔记" },
      { level: 2, title: "背景" },
      { level: 3, title: "目标" },
    ]);
  });
});
