import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import { CollectionRepository, MigrationManager } from "@omni/database";
import { selectRecentCommentCollections } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("selectRecentCommentCollections", () => {
  it("picks active collections synced within N days or never detail-synced", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-comment-"));
    tmpDirs.push(dataDir);
    const migDir = path.join(dataDir, "migrations");
    fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
    const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, path.join(dataDir, "backup"));
    manager.migrate();
    const db = manager.getDb();
    const collections = new CollectionRepository(db);
    const recent = collections.upsertByPlatformItem("bilibili", "r1", { url: "https://x/r", title: "R" });
    const old = collections.upsertByPlatformItem("bilibili", "o1", { url: "https://x/o", title: "O" });
    const never = collections.upsertByPlatformItem("bilibili", "n1", { url: "https://x/n", title: "N" });
    db.prepare("UPDATE collections SET last_synced_at = datetime('now','-2 days'), detail_synced=1 WHERE id = ?").run(recent.id);
    db.prepare("UPDATE collections SET last_synced_at = datetime('now','-30 days'), detail_synced=1 WHERE id = ?").run(old.id);
    db.prepare("UPDATE collections SET last_synced_at = NULL, detail_synced=0 WHERE id = ?").run(never.id);
    const picked = selectRecentCommentCollections(db, "bilibili", 7, 100);
    const ids = picked.map((r) => r.id).sort();
    expect(ids).toEqual([never.id, recent.id].sort());
    manager.close();
  });
});
