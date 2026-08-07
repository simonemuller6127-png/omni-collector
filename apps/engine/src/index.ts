import { openDatabase } from "@omni/database";
import { createProvider } from "@omni/ai";
import fs from "node:fs";
import path from "node:path";
import { EngineCommServer } from "./comm/comm-server.js";
import { TaskService } from "./comm/task-service.js";

export { EngineCommServer } from "./comm/comm-server.js";
export type { CommHandler, CommServerOptions, CommServerInfo } from "./comm/comm-server.js";
export { LifecycleManager } from "./lifecycle/lifecycle-manager.js";
export type { EngineTask, TaskResult, LifecycleOptions } from "./lifecycle/lifecycle-manager.js";
export { EngineState } from "./lifecycle/engine-state.js";
export { AppError, ErrorCodes } from "./errors/app-error.js";
export type { ErrorLevel } from "./errors/app-error.js";
export { FileIndexer } from "./fileindex/file-indexer.js";
export type { IndexReport } from "./fileindex/file-indexer.js";
export { SyncTaskState } from "./sync/sync-task-state.js";
export { SyncPipeline } from "./sync/sync-pipeline.js";
export type { SyncMode, SyncReport, SyncPipelineDeps } from "./sync/sync-pipeline.js";
export { BrowserSessionManager } from "./sync/browser-session.js";
export { parseStoredCookies } from "./sync/browser-session.js";
export type { BrowserSessionOptions, StoredCookie } from "./sync/browser-session.js";
export { SyncRunner, SUPPORTED_PLATFORMS } from "./sync/sync-runner.js";
export type { SyncRunnerOptions } from "./sync/sync-runner.js";
export { AiQueueRunner } from "./ai/ai-queue-runner.js";
export type { AiQueueRunnerOptions } from "./ai/ai-queue-runner.js";
export { TaskService } from "./comm/task-service.js";
export type { TaskServiceOptions } from "./comm/task-service.js";
export { ContentGroupService, findGroupCandidates, normalizeEntity, seriesBaseName } from "./group/content-group-service.js";
export type { ContentGroupDeps, GroupCandidate } from "./group/content-group-service.js";
export { CookieCipher } from "./crypto/cookie-cipher.js";
export { computeDeletionStage, watchLaterExpired, titleChangeNeedsNotice } from "./rules/content-retention.js";
export type { RetentionRules, DeletionStage } from "./rules/content-retention.js";
export { planInitialSync } from "./sync/init-sync-planner.js";
export type { InitSyncPlan } from "./sync/init-sync-planner.js";

export const PACKAGE_NAME = "@omni/engine";

/**
 * Engine 进程入口（T-107 可启动版本）：解析 --data-dir / --socket / --ws-port / --ws-token，
 * 初始化 SQLite 后启动 EngineCommServer，收到 SIGINT/SIGTERM 后广播 ENGINE_CLOSING 并退出。
 * 用法：node apps/engine/dist/index.js --data-dir <path> [--socket <name>] [--ws-port <n>] [--ws-token <token>]
 */
function arg(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dataDir = arg(argv, "--data-dir");
  if (!dataDir) {
    throw new Error("missing required argument: --data-dir <path>");
  }
  const db = openDatabase(dataDir);
  db.close();

  const service = new TaskService({
    dataDir,
    // 部署后 migrations 位于引擎脚本同目录；仓库开发态回退到 packages/database/migrations
    migrationsDir: (() => {
      const scriptDir = path.dirname(path.resolve(process.argv[1] ?? ""));
      const bundled = path.join(scriptDir, "migrations");
      return fs.existsSync(bundled) ? bundled : path.join(process.cwd(), "packages/database/migrations");
    })(),
    headless: true,
    getProvider: (rules) => {
      const type = rules.get("ai_provider");
      const key = process.env.OMNI_AI_API_KEY ?? rules.get("ai_api_key");
      if (!type || !key) return null;
      return createProvider(type === "openai" ? "openai" : "deepseek", { apiKey: key });
    },
  });
  const server = new EngineCommServer({ handlers: service.handlers() });
  const info = await server.start({
    pipeName: arg(argv, "--socket"),
    wsPort: arg(argv, "--ws-port") ? Number(arg(argv, "--ws-port")) : 0,
    wsToken: arg(argv, "--ws-token"),
  });
  console.log(`[engine] READY pipe=${info.pipePath} ws=${info.wsPort}`);

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
  await server.close("engine shutdown");
  process.exit(0);
}

if (process.argv[1] && /(index\.js|engine\.cjs)$/.test(process.argv[1])) {
  void main().catch((err) => {
    console.error(`[engine] fatal: ${(err as Error).message}`);
    process.exit(1);
  });
}
