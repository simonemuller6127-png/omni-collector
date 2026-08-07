import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, DATA_SUBDIRS } from "../src/index.js";

describe("connection", () => {
  it("creates OmniCollector.db with WAL + foreign_keys in the given data dir", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-db-"));
    const db = openDatabase(dataDir);
    try {
      expect(fs.existsSync(path.join(dataDir, "OmniCollector.db"))).toBe(true);
      expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
      for (const sub of DATA_SUBDIRS) {
        expect(fs.existsSync(path.join(dataDir, sub))).toBe(true);
      }
    } finally {
      db.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
