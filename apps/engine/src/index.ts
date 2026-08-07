import { openDatabase } from "@omni/database";
import { EngineCommServer } from "./comm/comm-server.js";

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

  const server = new EngineCommServer();
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

if (process.argv[1]?.endsWith("index.js")) {
  void main().catch((err) => {
    console.error(`[engine] fatal: ${(err as Error).message}`);
    process.exit(1);
  });
}
