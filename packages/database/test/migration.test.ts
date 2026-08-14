import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MigrationManager } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

function makeDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function setupManager(): { manager: MigrationManager; cleanup: () => void } {
  const dataDir = makeDir("omni-mig-");
  const migDir = path.join(dataDir, "migrations");
  const backupDir = path.join(dataDir, "backup");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, backupDir);
  return {
    manager,
    cleanup: () => {
      manager.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

describe("MigrationManager", () => {
  it("migrates an empty db to latest version and is idempotent", () => {
    const { manager, cleanup } = setupManager();
    try {
      const first = manager.migrate();
  expect(first.applied).toHaveLength(7);
  expect(manager.currentVersion()).toBe(7);
  expect(manager.getDb().pragma("user_version", { simple: true })).toBe(7);

      const second = manager.migrate();
      expect(second.applied).toHaveLength(0);
  expect(manager.currentVersion()).toBe(7);
    } finally {
      cleanup();
    }
  });

  it("fails safely on a bad migration and restores the backup", () => {
    const dataDir = makeDir("omni-mig-bad-");
    const migDir = path.join(dataDir, "migrations");
    const backupDir = path.join(dataDir, "backup");
    fs.mkdirSync(migDir, { recursive: true });
    fs.copyFileSync(path.join(REAL_MIGRATIONS, "001_initial.sql"), path.join(migDir, "001_initial.sql"));
    fs.writeFileSync(
      path.join(migDir, "002_bad.sql"),
      "ALTER TABLE missing_table ADD COLUMN nope TEXT;",
      "utf8",
    );
    const manager = new MigrationManager(path.join(dataDir, "OmniCollector.db"), migDir, backupDir);
    try {
      expect(() => manager.migrate()).toThrowError("ENGINE_002");
      expect(manager.currentVersion()).toBe(1);
      const backups = fs.readdirSync(backupDir).filter((f) => f.endsWith(".db"));
      expect(backups.length).toBeGreaterThan(0);
      // db must still be usable after restore
      const row = manager
        .getDb()
        .prepare("SELECT MAX(version) AS v FROM schema_versions")
        .get() as { v: number };
      expect(row.v).toBe(1);
    } finally {
      manager.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("keeps at most 3 backups", () => {
    const { manager, cleanup } = setupManager();
    try {
      for (let i = 0; i < 5; i++) {
        manager.backupNow(`t${i}`);
      }
      const backups = fs
        .readdirSync(path.join(path.dirname(manager.getDb().name), "backup"))
        .filter((f) => f.endsWith(".db"));
      expect(backups.length).toBe(3);
    } finally {
      cleanup();
    }
  });
});
