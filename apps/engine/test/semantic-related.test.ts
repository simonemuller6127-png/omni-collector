import { describe, expect, it } from "vitest";
import {
  buildSemanticIndex,
  semanticRelated,
  tokenizeSemantic,
  type SemanticDoc,
} from "../src/group/semantic-related.js";

describe("local semantic related (TF-IDF, PRD 2.0 lightweight)", () => {
  it("tokenizes ascii words and CJK bigrams", () => {
    expect(tokenizeSemantic("Vue3 入门教程 Part1")).toContain("vue3");
    expect(tokenizeSemantic("Vue3 入门教程")).toContain("入门");
    expect(tokenizeSemantic("Vue3 入门教程")).toContain("门教");
  });

  it("ranks same-topic docs above unrelated ones and excludes self", () => {
    const docs: SemanticDoc[] = [
      { id: "a", title: "Vue3 入门教程 第1期", tags: ["vue", "前端"] },
      { id: "b", title: "Vue3 入门教程 第2期", tags: ["vue", "前端"] },
      { id: "c", title: "Vue3 进阶实战", tags: ["vue"] },
      { id: "d", title: "红烧肉的家常做法", tags: ["美食"] },
      { id: "e", title: "荔浦芋头扣肉", tags: ["美食"] },
    ];
    const index = buildSemanticIndex(docs);
    const hits = semanticRelated(index, "a", 3);
    expect(hits[0]?.id).toBe("b");
    expect(hits.map((h) => h.id)).not.toContain("a");
    expect(hits.map((h) => h.id)).not.toContain("d");
  });

  it("returns empty for unknown id and respects topN", () => {
    const docs: SemanticDoc[] = [
      { id: "x", title: "alpha beta" },
      { id: "y", title: "alpha gamma" },
      { id: "z", title: "alpha delta" },
    ];
    const index = buildSemanticIndex(docs);
    expect(semanticRelated(index, "missing", 2)).toEqual([]);
    expect(semanticRelated(index, "x", 1)).toHaveLength(1);
  });
});
