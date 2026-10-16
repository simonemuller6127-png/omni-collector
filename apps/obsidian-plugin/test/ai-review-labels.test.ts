import { describe, expect, it } from "vitest";
import {
  CONTENT_TYPE_VALUES,
  describePayload,
  parseTagList,
  TYPE_LABELS,
} from "../src/ui/ai-review-labels.js";

/**
 * 只测不依赖 obsidian 运行时的纯数据层（obsidian 包在 vitest 下无法加载：
 * package.json main 为空、仅有 types，故 ai-review.ts 本身无法单测）。
 * TYPE_LABELS 与渲染判断已抽到 src/ui/ai-review-labels.ts 并由 ai-review.ts re-export。
 */
describe("ai-review-labels", () => {
  it("TYPE_LABELS maps both new content types to Chinese labels", () => {
    expect(TYPE_LABELS.suggested_content_tags).toBe("内容标签建议");
    expect(TYPE_LABELS.suggested_content_type).toBe("形式标签建议");
    // 兜底：未知 type 仍返回裸类型名
    expect(TYPE_LABELS["suggested_unknown"] ?? "suggested_unknown").toBe("suggested_unknown");
  });

  it("suggested_content_type renders as a 形式 badge, not a plain text row", () => {
    const render = describePayload({ suggestion_type: "suggested_content_type", payload: "视频" });
    expect(render.kind).toBe("content-type");
    if (render.kind !== "content-type") throw new Error("unreachable");
    expect(render.value).toBe("视频");
    expect(CONTENT_TYPE_VALUES).toContain("视频" as (typeof CONTENT_TYPE_VALUES)[number]);
  });

  it("suggested_content_tags renders as a chip list", () => {
    const render = describePayload({
      suggestion_type: "suggested_content_tags",
      payload: '["前端","Agent 实践"]',
    });
    expect(render.kind).toBe("chips");
    if (render.kind !== "chips") throw new Error("unreachable");
    expect(render.tags).toEqual(["前端", "Agent 实践"]);
  });

  it("suggested_tag keeps the same chip rendering", () => {
    const render = describePayload({ suggestion_type: "suggested_tag", payload: "生活美学, 桌搭" });
    expect(render.kind).toBe("chips");
    if (render.kind !== "chips") throw new Error("unreachable");
    expect(render.tags).toEqual(["生活美学", "桌搭"]);
  });

  it("unknown type falls back to plain text", () => {
    const render = describePayload({ suggestion_type: "suggested_weird", payload: "raw" });
    expect(render).toEqual({ kind: "text", text: "raw" });
  });

  it("parseTagList handles array / comma / single / empty", () => {
    expect(parseTagList('["a","b"]')).toEqual(["a", "b"]);
    expect(parseTagList("a, b")).toEqual(["a", "b"]);
    expect(parseTagList("a")).toEqual(["a"]);
    expect(parseTagList("")).toEqual([]);
  });
});
