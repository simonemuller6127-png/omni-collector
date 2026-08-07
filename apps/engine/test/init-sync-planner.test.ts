import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MigrationManager, RuleCenter } from "@omni/database";
import { planInitialSync } from "../src/index.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

let dataDir: string;
let manager: MigrationManager;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-init-"));
  const migDir = path.join(dataDir, "migrations");
  fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
  manager = new MigrationManager(
    path.join(dataDir, "OmniCollector.db"),
    migDir,
    path.join(dataDir, "backup"),
  );
  manager.migrate();
});

afterAll(() => {
  manager.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("planInitialSync", () => {
  it("uses seeded default 50", () => {
    expect(planInitialSync(new RuleCenter(manager.getDb())).fullDetailLimit).toBe(50);
  });

  it("clamps to 20..80", () => {
    const rules = new RuleCenter(manager.getDb());
    rules.set("init_sync_full_limit", "5");
    expect(planInitialSync(rules).fullDetailLimit).toBe(20);
    rules.set("init_sync_full_limit", "500");
    expect(planInitialSync(rules).fullDetailLimit).toBe(80);
  });
});
