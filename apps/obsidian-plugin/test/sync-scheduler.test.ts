import { describe, expect, it } from "vitest";
import { dailyCapReached, isSyncDue, nextSyncAt } from "../src/sync/sync-scheduler.js";

describe("sync-scheduler", () => {
  it("schedules first sync soon when never synced", () => {
    const now = new Date("2026-08-14T00:00:00Z");
    const next = nextSyncAt({ frequency: "daily", lastRunAt: null, now });
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getTime()).toBeLessThanOrEqual(now.getTime() + 10 * 60 * 1000);
  });

  it("daily schedule lands between 24h and 24h+window", () => {
    const now = new Date("2026-08-14T00:00:00Z");
    const last = new Date("2026-08-13T00:00:00Z");
    const next = nextSyncAt({ frequency: "daily", lastRunAt: last.toISOString(), now, randomWindowMinutes: 120 });
    expect(next.getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(next.getTime()).toBeLessThanOrEqual(now.getTime() + 120 * 60 * 1000);
  });

  it("weekly schedule lands 7d after last run", () => {
    const now = new Date("2026-08-14T00:00:00Z");
    const last = new Date("2026-08-01T00:00:00Z");
    const next = nextSyncAt({ frequency: "weekly", lastRunAt: last.toISOString(), now, randomWindowMinutes: 0 });
    expect(next.toISOString()).toBe("2026-08-08T00:00:00.000Z");
  });

  it("isSyncDue and dailyCapReached", () => {
    expect(isSyncDue({ frequency: "daily", lastRunAt: new Date("2026-08-13T00:00:00Z").toISOString(), now: new Date("2026-08-14T12:00:00Z") })).toBe(true);
    expect(isSyncDue({ frequency: "daily", lastRunAt: new Date("2026-08-14T00:00:00Z").toISOString(), now: new Date("2026-08-14T01:00:00Z") })).toBe(false);
    expect(dailyCapReached(3, 3)).toBe(true);
    expect(dailyCapReached(2, 3)).toBe(false);
  });
});
