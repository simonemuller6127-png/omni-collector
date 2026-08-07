// 手动同步入口：node apps/engine/scripts/sync.mjs <platform> [catalog|full|detail]
// 数据目录默认 ./data（可 --data-dir 覆盖）
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SyncRunner, SUPPORTED_PLATFORMS } = require("../dist/index.js");

const args = process.argv.slice(2);
const platform = args[0];
const mode = (args.find((a) => ["catalog", "full", "detail"].includes(a)) ?? "full");
const dataDirArg = args.find((a) => a.startsWith("--data-dir="))?.split("=")[1];
if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
  console.error(`usage: node sync.mjs <platform> [catalog|full|detail] [--data-dir=...]\nplatforms: ${SUPPORTED_PLATFORMS.join(", ")}`);
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = dataDirArg ?? path.resolve(here, "../../../data");
const migrationsDir = path.resolve(here, "../../../packages/database/migrations");

console.log(`[sync] platform=${platform} mode=${mode} dataDir=${dataDir}`);
const runner = new SyncRunner({ dataDir, migrationsDir, headless: true });
const report = await runner.run(platform, mode);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "success" ? 0 : 1);
