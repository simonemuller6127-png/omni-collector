import { describe, expect, it } from "vitest";
import { computeDeletionStage, watchLaterExpired, titleChangeNeedsNotice } from "../src/index.js";

const rules = {
  deletionRetentionDays: 180,
  reminder1Days: 30,
  reminder2Days: 150,
  watchLaterExpiryDays: 30,
  titleChangeNoticeDays: 14,
};

const base = "2026-08-07T00:00:00.000Z";
const at = (daysAgo: number): string =>
  new Date(Date.parse(base) - daysAgo * 86_400_000).toISOString();

describe("content retention", () => {
  it("walks deletion stages", () => {
    expect(computeDeletionStage(at(10), new Date(base), rules)).toBe("none");
    expect(computeDeletionStage(at(31), new Date(base), rules)).toBe("reminder1");
    expect(computeDeletionStage(at(160), new Date(base), rules)).toBe("reminder2");
    expect(computeDeletionStage(at(200), new Date(base), rules)).toBe("cleanup");
  });

  it("flags watch-later expiry", () => {
    expect(watchLaterExpired(at(29), new Date(base), rules)).toBe(false);
    expect(watchLaterExpired(at(31), new Date(base), rules)).toBe(true);
  });

  it("limits title change notice window", () => {
    expect(titleChangeNeedsNotice(at(13), new Date(base), rules)).toBe(true);
    expect(titleChangeNeedsNotice(at(15), new Date(base), rules)).toBe(false);
  });
});
