import { describe, expect, it } from "vitest";
import { findSeriesMatches, scoreSeriesPair } from "../src/index.js";

describe("series recognition", () => {
  it("matches same-author numbered videos", () => {
    const a = { id: "1", title: "Vue入门(1)", author: "UP", description: "第1期" };
    const b = { id: "2", title: "Vue入门(2)", author: "UP", description: "第2期" };
    const m = scoreSeriesPair(a, b);
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThanOrEqual(8);
    expect(m!.reasons).toContain("作者一致");
  });

  it("rejects different authors", () => {
    expect(scoreSeriesPair(
      { id: "1", title: "Vue入门(1)", author: "A" },
      { id: "2", title: "Vue入门(2)", author: "B" },
    )).toBeNull();
  });

  it("finds matches in a list", () => {
    const items = [
      { id: "1", title: "React教程(1)", author: "UP" },
      { id: "2", title: "React教程(2)", author: "UP" },
      { id: "3", title: "完全无关的视频", author: "Other" },
    ];
    const matches = findSeriesMatches(items);
    const ids = matches.map((m) => `${m.itemId}->${m.matchedWith}`);
    expect(ids).toContain("1->2");
    expect(ids).toContain("2->1");
  });
});
