import { describe, expect, it } from "vitest";
import { filterCollections, pickDailyReview } from "../src/ui/helpers.js";
import { buildManualTemplate } from "../src/ui/manual-template.js";
import { buildManualBatchTemplate } from "../src/ui/manual-template.js";
import type { CollectionDTO } from "@omni/shared-core";

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

describe("keyword search (borrowed from Karakeep/Cubox)", () => {
  const items = [
    dto({ id: "a", title: "Vue3 入门", tags: ["前端"], author: "小明" }),
    dto({ id: "b", title: "红烧肉做法", topics: ["美食"], groupName: "家常菜" }),
    dto({ id: "c", title: "TypeScript 进阶", description: "深入类型系统" }),
  ];

  it("matches title/author/tags/topics/group/description, case-insensitive", () => {
    expect(filterCollections(items, { keyword: "vue3" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterCollections(items, { keyword: "小明" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterCollections(items, { keyword: "美食" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterCollections(items, { keyword: "家常菜" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterCollections(items, { keyword: "类型系统" }).map((i) => i.id)).toEqual(["c"]);
    expect(filterCollections(items, { keyword: "" }).length).toBe(3);
  });
});

describe("daily review (borrowed from Readwise daily review)", () => {
  it("returns null for empty pool", () => {
    expect(pickDailyReview([], () => 0)).toBeNull();
    expect(
      pickDailyReview([dto({ id: "x", organizeStatus: "archived" })], () => 0),
    ).toBeNull();
  });

  it("prefers unorganized and oldest first window, deterministic with fixed random", () => {
    const items = [
      dto({ id: "old-archived", organizeStatus: "archived", collectedAt: "2020-01-01T00:00:00Z" }),
      dto({ id: "old-unorg", collectedAt: "2021-01-01T00:00:00Z" }),
      dto({ id: "new-unorg", collectedAt: "2026-06-01T00:00:00Z" }),
      dto({ id: "old-organized", organizeStatus: "organized", collectedAt: "2021-02-01T00:00:00Z" }),
    ];
    expect(pickDailyReview(items, () => 0)?.id).toBe("old-unorg");
    // 未整理不存在时回退到全部（最旧优先窗口）
    const noUnorg = items.filter((i) => i.id !== "old-unorg" && i.id !== "new-unorg");
    expect(pickDailyReview(noUnorg, () => 0)?.id).toBe("old-organized");
  });
});

describe("manual AI templates inject controlled vocabulary (borrowed from Cubox)", () => {
  it("single template lists tag/topic/group vocabulary", () => {
    const tpl = buildManualTemplate(dto({ id: "a" }), {
      tags: ["前端", "TypeScript"],
      topics: ["AI 工程"],
      groups: ["Vue 系列"],
    });
    expect(tpl).toContain("受控词表 · Tag：前端, TypeScript");
    expect(tpl).toContain("受控词表 · Topic：AI 工程");
    expect(tpl).toContain("受控词表 · 分组：Vue 系列");
  });

  it("batch template omits vocabulary block when absent", () => {
    const tpl = buildManualBatchTemplate([dto({ id: "a" })]);
    expect(tpl).not.toContain("受控词表");
  });
});
