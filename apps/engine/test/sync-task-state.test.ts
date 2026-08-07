import { describe, expect, it } from "vitest";
import { validateSyncTransition } from "@omni/shared-core";
import { SyncTaskState } from "../src/index.js";

describe("validateSyncTransition", () => {
  it("allows the frozen happy path", () => {
    expect(validateSyncTransition("pending", "running").ok).toBe(true);
    expect(validateSyncTransition("running", "success").ok).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(validateSyncTransition("pending", "success").ok).toBe(false);
    expect(validateSyncTransition("success", "running").ok).toBe(false);
  });
});

describe("SyncTaskState", () => {
  it("walks pending -> running -> success", () => {
    const s = new SyncTaskState();
    s.start();
    expect(s.status).toBe("running");
    s.succeed();
    expect(s.status).toBe("success");
  });

  it("enters human_queue after max retries (SYNC_003)", () => {
    const s = new SyncTaskState(3);
    s.start();
    s.fail();
    expect(s.status).toBe("retrying");
    expect(s.retryCount).toBe(1);
    s.retry();
    s.fail();
    expect(s.status).toBe("retrying");
    expect(s.retryCount).toBe(2);
    s.retry();
    s.fail();
    expect(s.status).toBe("human_queue");
    expect(s.retryCount).toBe(3);
  });

  it("succeeds on a retry before exhausting attempts", () => {
    const s = new SyncTaskState(3);
    s.start();
    s.fail();
    s.retry();
    s.succeed();
    expect(s.status).toBe("success");
  });
});
