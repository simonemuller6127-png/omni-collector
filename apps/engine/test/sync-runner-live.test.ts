import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import { CookieCipher, SyncRunner } from "../src/index.js";

const DATA_DIR = "D:/Github/My_Project/omni-collection/data";
const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

const hasBiliCookie = (() => {
  try {
    return !!new CookieCipher(DATA_DIR).decryptCookie("bilibili");
  } catch {
    return false;
  }
})();

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe.skipIf(!hasBiliCookie)("SyncRunner (live, full pipeline into temp db)", () => {
  it(
    "runs bilibili catalog sync: browser session -> adapter -> sqlite",
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-runner-"));
      tmpDirs.push(dataDir);
      const migDir = path.join(dataDir, "migrations");
      fs.cpSync(REAL_MIGRATIONS, migDir, { recursive: true });
      // SyncRunner 在同一 dataDir 中同时读 cookie 库与数据库，因此把真实 cookie 库复制进临时目录
      fs.cpSync(path.join(DATA_DIR, "cookies"), path.join(dataDir, "cookies"), { recursive: true });
      fs.copyFileSync(path.join(DATA_DIR, "key.bin"), path.join(dataDir, "key.bin"));
      const runner = new SyncRunner({ dataDir, migrationsDir: migDir, headless: true });
      const report = await runner.run("bilibili", "catalog");
      expect(report.status).toBe("success");
      expect(report.itemsAdded).toBeGreaterThanOrEqual(1);
      expect(report.errorCode).toBeUndefined();
    },
    240_000,
  );
});
