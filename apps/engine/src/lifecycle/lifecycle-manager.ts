import fs from "node:fs";
import path from "node:path";
import { MigrationManager } from "@omni/database";
import { AppError, ErrorCodes } from "../errors/app-error.js";
import { EngineState } from "./engine-state.js";

export interface EngineTask {
  id: string;
  kind: "sync" | "ai" | "index" | "query";
  payload?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  ok: boolean;
  code?: string;
  data?: unknown;
}

export interface LifecycleOptions {
  dataDir: string;
  migrationsDir: string;
  /** T-105 将注入 Socket 服务启动钩子。 */
  onReady?: () => void;
  disposers?: Array<() => void | Promise<void>>;
  /** 资源释放硬时限，默认 30 秒（SPEC S3.3）。 */
  releaseTimeoutMs?: number;
}

const TRANSITIONS: Record<EngineState, EngineState[]> = {
  [EngineState.OFF]: [EngineState.STARTING],
  [EngineState.STARTING]: [EngineState.READY, EngineState.FAILED],
  [EngineState.READY]: [EngineState.RUNNING, EngineState.STOPPING],
  [EngineState.RUNNING]: [EngineState.IDLE, EngineState.FAILED, EngineState.STOPPING],
  [EngineState.IDLE]: [EngineState.RUNNING, EngineState.STOPPING],
  [EngineState.STOPPING]: [EngineState.OFF, EngineState.FAILED],
  [EngineState.FAILED]: [EngineState.OFF],
};

export class LifecycleManager {
  private _state: EngineState = EngineState.OFF;
  private readonly listeners: Array<(s: EngineState) => void> = [];
  private readonly lockPath: string;
  private readonly disposers: Array<() => void | Promise<void>>;

  constructor(private readonly opts: LifecycleOptions) {
    this.lockPath = path.join(opts.dataDir, "engine.lock");
    this.disposers = [...(opts.disposers ?? [])];
  }

  get state(): EngineState {
    return this._state;
  }

  onStateChange(cb: (s: EngineState) => void): void {
    this.listeners.push(cb);
  }

  private setState(next: EngineState): void {
    const allowed = TRANSITIONS[this._state] ?? [];
    if (!allowed.includes(next)) {
      throw new AppError(
        ErrorCodes.ENGINE_005,
        "ERROR",
        `${ErrorCodes.ENGINE_005}: invalid state transition: ${this._state} -> ${next}`,
      );
    }
    this._state = next;
    for (const l of this.listeners) l(next);
  }

  private acquireLock(): void {
    if (fs.existsSync(this.lockPath)) {
      const pid = Number(fs.readFileSync(this.lockPath, "utf8").trim());
      if (pid > 0 && this.isAlive(pid)) {
        throw new AppError(
          ErrorCodes.ENGINE_001,
          "ERROR",
          `${ErrorCodes.ENGINE_001}: engine already running (pid ${pid})`,
        );
      }
      fs.rmSync(this.lockPath, { force: true }); // 清理陈旧锁
    }
    fs.writeFileSync(this.lockPath, String(process.pid), "utf8");
  }

  private releaseLock(): void {
    fs.rmSync(this.lockPath, { force: true });
  }

  private isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "EPERM";
    }
  }

  async start(): Promise<void> {
    if (this._state !== EngineState.OFF) {
      throw new AppError(
        ErrorCodes.ENGINE_001,
        "ERROR",
        `${ErrorCodes.ENGINE_001}: start() requires state OFF, got ${this._state}`,
      );
    }
    this.setState(EngineState.STARTING);
    try {
      this.acquireLock();
      const migrator = new MigrationManager(
        path.join(this.opts.dataDir, "OmniCollector.db"),
        this.opts.migrationsDir,
        path.join(this.opts.dataDir, "backup"),
      );
      try {
        migrator.migrate();
      } finally {
        migrator.close();
      }
      this.opts.onReady?.();
      this.setState(EngineState.READY);
    } catch (err) {
      this.releaseLock();
      this.setState(EngineState.FAILED);
      if (err instanceof AppError) throw err;
      throw new AppError(
        ErrorCodes.ENGINE_002,
        "FATAL",
        `${ErrorCodes.ENGINE_002}: start failed: ${(err as Error).message}`,
      );
    }
  }

  async runTask(task: EngineTask, fn: () => Promise<TaskResult>): Promise<TaskResult> {
    if (this._state !== EngineState.READY && this._state !== EngineState.IDLE) {
      throw new AppError(
        ErrorCodes.ENGINE_003,
        "ERROR",
        `${ErrorCodes.ENGINE_003}: runTask requires READY or IDLE, got ${this._state}`,
      );
    }
    this.setState(EngineState.RUNNING);
    try {
      const result = await fn();
      this.setState(EngineState.IDLE);
      return result;
    } catch (err) {
      // 单任务失败不终止 Engine（SPEC S4.4 故障隔离）
      this.setState(EngineState.IDLE);
      throw err;
    }
  }

  async requestStop(reason = "user"): Promise<void> {
    if (this._state === EngineState.OFF) return;
    if (this._state !== EngineState.READY && this._state !== EngineState.IDLE) {
      throw new AppError(
        ErrorCodes.ENGINE_003,
        "ERROR",
        `${ErrorCodes.ENGINE_003}: requestStop requires READY or IDLE, got ${this._state}`,
      );
    }
    this.setState(EngineState.STOPPING);
    const timeoutMs = this.opts.releaseTimeoutMs ?? 30_000;
    await Promise.race([
      Promise.allSettled(this.disposers.map((d) => d())),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    this.releaseLock();
    this.setState(EngineState.OFF);
  }
}
