import { describe, expect, it } from "vitest";
import { buildManualTemplate, buildManualBatchTemplate } from "../src/ui/manual-template.js";
import type { CollectionDTO } from "@omni/shared-core";

/**
 * C（评论进 AI 输入）在 Manual 路径的覆盖：
 * 队列路径（queue-processor）已由 packages/ai/test/queue-processor.test.ts 锁定；
 * 本文件锁定插件侧 Manual 模板与批量模板的「热门评论」段口径，
 * 保证两条路径对 ai_comment_context_limit 的行为一致。
 */
function dto(partial: Partial<CollectionDTO> & { id: string }): CollectionDTO {
  return {
    platform: "bilibili",
    platformItemId: partial.id,
    url: `https://x/${partial.id}`,
    title: partial.id,
    contentType: "video",
    saveType: "favorited",
    contentStatus: "active",
    syncStatus: "full",
    organizeStatus: "unorganized",
    priority: "normal",
    collectedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const comments = [
  { author: "低", content: "评论1", likeCount: 1 },
  { author: "高", content: "评论6", likeCount: 99 },
  { author: "中", content: "评论3", likeCount: 50 },
];

describe("manual template 热门评论段（C）", () => {
  it("single template appends 热门评论 ordered by likeCount desc", () => {
    const tpl = buildManualTemplate(dto({ id: "a", comments }));
    expect(tpl).toContain("热门评论");
    expect(tpl.indexOf("评论6")).toBeLessThan(tpl.indexOf("评论3"));
    expect(tpl.indexOf("评论3")).toBeLessThan(tpl.indexOf("评论1"));
  });

  it("single template truncates to the injected commentLimit", () => {
    const tpl = buildManualTemplate(dto({ id: "a", comments }), undefined, { commentLimit: 2 });
    expect(tpl).toContain("评论6");
    expect(tpl).toContain("评论3");
    expect(tpl).not.toContain("评论1");
  });

  it("single template omits the whole 评论段 when no comments (or limit=0)", () => {
    expect(buildManualTemplate(dto({ id: "a" }))).not.toContain("热门评论");
    expect(
      buildManualTemplate(dto({ id: "a", comments }), undefined, { commentLimit: 0 }),
    ).not.toContain("热门评论");
    // 空内容评论不计入
    expect(
      buildManualTemplate(dto({ id: "a", comments: [{ author: "x", content: "   ", likeCount: 9 }] })),
    ).not.toContain("热门评论");
  });

  it("single template keeps 已有Tag / 受控词表 / --- 收藏内容 --- 分隔 intact", () => {
    const tpl = buildManualTemplate(
      dto({ id: "a", tags: ["前端"], comments }),
      { tags: ["前端", "TypeScript"] },
      { commentLimit: 1 },
    );
    expect(tpl).toContain("已有Tag：前端");
    expect(tpl).toContain("受控词表 · Tag：前端, TypeScript");
    expect(tpl).toContain("--- 收藏内容 ---");
    // 评论段出现在收藏内容之后
    expect(tpl.indexOf("热门评论")).toBeGreaterThan(tpl.indexOf("--- 收藏内容 ---"));
  });

  it("batch template appends per-item 评论段 and skips items without comments", () => {
    const tpl = buildManualBatchTemplate([dto({ id: "0", comments }), dto({ id: "1" })], undefined, {
      commentLimit: 2,
    });
    expect(tpl).toContain("热门评论");
    expect(tpl).toContain("评论6");
    expect(tpl).not.toContain("评论1");
    // 只有第一条收藏带评论 → 段只出现一次
    expect(tpl.split("热门评论").length - 1).toBe(1);
  });

  it("batch template omits 评论段 entirely when limit=0", () => {
    const tpl = buildManualBatchTemplate([dto({ id: "0", comments })], undefined, { commentLimit: 0 });
    expect(tpl).not.toContain("热门评论");
  });
});
