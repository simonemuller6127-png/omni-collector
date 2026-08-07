import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LifecycleManager } from "../src/lifecycle/lifecycle-manager.js";
import { EngineState } from "../src/lifecycle/engine-state.js";
import { AppError } from "../src/errors/app-error.js";

const REAL_MIGRATIONS = "D:/Github/My_Project/omni-collection/packages/database/migrations";

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-life-"));
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function newManager(disposers: Array<() => void> = []) {
  return new LifecycleManager({
    dataDir,
    migrationsDir: REAL_MIGRATIONS,
    releaseTimeoutMs: 1000,
    disposers,
  });
}

describe("LifecycleManager", () => {
  it("walks the frozen state machine", async () => {
    const m = newManager();
    const seen: EngineState[] = [];
    m.onStateChange((s) => seen.push(s));
    await m.start();
    await m.runTask({ id: "t1", kind: "sync" }, async () => ({ taskId: "t1", ok: true }));
    await m.requestStop();
    expect(seen).toEqual([
      EngineState.STARTING,
      EngineState.READY,
      EngineState.RUNNING,
      EngineState.IDLE,
      EngineState.STOPPING,
      EngineState.OFF,
    ]);
    expect(m.state).toBe(EngineState.OFF);
  });

  it("rejects starting twice while running (ENGINE_001)", async () => {
    const m = newManager();
    await m.start();
    await expect(m.start()).rejects.toThrowError("ENGINE_001");
    await m.requestStop();
  });

  it("releases lock and allows restart after stop", async () => {
    const m = newManager();
    await m.start();
    expect(fs.existsSync(path.join(dataDir, "engine.lock"))).toBe(true);
    await m.requestStop();
    expect(fs.existsSync(path.join(dataDir, "engine.lock"))).toBe(false);
    await m.start();
    expect(m.state).toBe(EngineState.READY);
    await m.requestStop();
  });

  it("calls disposers on stop", async () => {
    let released = 0;
    const m = newManager([
      () => {
        released += 1;
      },
    ]);
    await m.start();
    await m.requestStop();
    expect(released).toBe(1);
  });

  it("rejects invalid transitions", async () => {
    const m = newManager();
    await expect(m.runTask({ id: "x", kind: "sync" }, async () => ({ taskId: "x", ok: true }))).rejects.toThrowError(
      "ENGINE_003",
    );
    expect(m.state).toBe(EngineState.OFF);
  });

  it("keeps engine alive after a single task failure (fault isolation)", async () => {
    const m = newManager();
    await m.start();
    await expect(
      m.runTask({ id: "f", kind: "sync" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrowError("boom");
    expect(m.state).toBe(EngineState.IDLE);
    await m.requestStop();
  });
});
