import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MigrationManager,
  CollectionRepository,
  CommentRepository,
  UserRepository,
} from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

let dataDir: string;
let manager: MigrationManager;
let collections: CollectionRepository;
let comments: CommentRepository;
let users: UserRepository;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-repo-"));
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
  comments = new CommentRepository(db);
  users = new UserRepository(db);
});

afterAll(() => {
  manager.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("CollectionRepository", () => {
  it("upserts by platform item id without duplicates", () => {
    const first = collections.upsertByPlatformItem("bilibili", "BV123", {
      url: "https://bilibili.com/video/BV123",
      title: "T1",
    });
    const second = collections.upsertByPlatformItem("bilibili", "BV123", {
      url: "https://bilibili.com/video/BV123",
      title: "T1-updated",
    });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("T1-updated");
    expect(collections.count()).toBe(1);
  });

  it("finds by url and lists pending inbox", () => {
    const row = collections.findByUrl("https://bilibili.com/video/BV123");
    expect(row?.platform).toBe("bilibili");
    expect(collections.listPendingInbox().map((c) => c.id)).toContain(row?.id);
  });

  it("updates organize/priority/inbox/deleted/archive states", () => {
    const row = collections.upsertByPlatformItem("youtube", "yt456", {
      url: "https://youtube.com/watch?v=yt456",
      save_type: "watch_later",
    });
    collections.markInbox(row.id, "done");
    collections.setOrganizeState(row.id, "viewed");
    collections.setPriority(row.id, "project");
    collections.markDeleted(row.id, "2026-08-07T00:00:00Z");
    collections.archive(row.id);
    const after = collections.findById(row.id);
    expect(after?.inbox_status).toBe("done");
    expect(after?.organize_status).toBe("archived");
    expect(after?.priority).toBe("project");
    expect(after?.content_status).toBe("deleted");
    expect(after?.deleted_at).toBe("2026-08-07T00:00:00Z");
  });

  it("deletes a collection", () => {
    const row = collections.upsertByPlatformItem("xiaohongshu", "xhs789", {
      url: "https://xhslink.com/xhs789",
    });
    collections.delete(row.id);
    expect(collections.findById(row.id)).toBeUndefined();
  });
});

describe("CommentRepository", () => {
  it("upserts comments and lists them by collection", () => {
    const c = collections.upsertByPlatformItem("bilibili", "BV-comment", {
      url: "https://bilibili.com/video/BV-comment",
    });
    comments.upsertComments(c.id, [
      { comment_id: "c1", author: "a1", content: "hello", like_count: 5 },
      { comment_id: "c1", author: "a1", content: "hello-updated", like_count: 9 },
    ]);
    const rows = comments.getByCollection(c.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("hello-updated");
    expect(rows[0].like_count).toBe(9);
    comments.setStarred(rows[0].id, true);
    expect(comments.getByCollection(c.id)[0].is_starred).toBe(1);
  });
});

describe("UserRepository", () => {
  it("upserts note, tags, rating and organize state", () => {
    const c = collections.upsertByPlatformItem("youtube", "yt-note", {
      url: "https://youtube.com/watch?v=yt-note",
    });
    users.upsertNote(c.id, "my note");
    users.mergeUserTags(c.id, ["tagA", "tagB"]);
    users.setRating(c.id, 4);
    users.syncOrganizeState(c.id, "organized");
    const note = users.getNote(c.id);
    expect(note?.note_md).toBe("my note");
    expect(JSON.parse(note?.user_tags ?? "[]")).toEqual(["tagA", "tagB"]);
    expect(note?.user_rating).toBe(4);
    expect(note?.organize_status).toBe("organized");
  });
});
