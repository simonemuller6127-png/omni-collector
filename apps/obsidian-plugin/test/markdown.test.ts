import { describe, expect, it } from "vitest";
import { MarkdownBuilder } from "../src/markdown/markdown-builder.js";
import type { CollectionDTO } from "@omni/shared-core";

const SYSTEM_END_MARKER = "<!-- OMNI_SYSTEM_END -->";

const dto: CollectionDTO = {
  id: "c1",
  platform: "bilibili",
  platformItemId: "BV1",
  url: "https://bilibili.com/video/BV1",
  title: "视频标题",
  contentType: "video",
  saveType: "favorited",
  contentStatus: "active",
  syncStatus: "full",
  organizeStatus: "unorganized",
  priority: "normal",
  collectedAt: "2026-08-07T00:00:00Z",
};

describe("MarkdownBuilder", () => {
  it("builds the frozen system/user zone layout", () => {
    const md = new MarkdownBuilder().buildFromDTO(dto);
    expect(md).toContain("<!-- OMNI_SYSTEM_START -->");
    expect(md).toContain("<!-- OMNI_SYSTEM_END -->");
    expect(md).toContain('title: "视频标题"');
    expect(md).toContain('sync_status: "full"');
    expect(md).toContain("<!-- 以下为用户私有编辑区，任何自动化逻辑禁止修改 -->");
  });

  it("replaces only the system zone and preserves user content", () => {
    const builder = new MarkdownBuilder();
    let md = builder.buildFromDTO(dto);
    md += "\n我的私有笔记内容\n";
    const next: CollectionDTO = { ...dto, title: "新标题", syncStatus: "catalog" };
    const updated = builder.replaceSystemZone(md, next);
    expect(updated).toContain('title: "新标题"');
    expect(updated).toContain('sync_status: "catalog"');
    expect(updated).toContain("我的私有笔记内容");
    expect(updated.indexOf("我的私有笔记内容")).toBeGreaterThan(updated.indexOf(SYSTEM_END_MARKER));
  });

  it("rejects marker-missing files", () => {
    const builder = new MarkdownBuilder();
    expect(builder.validateMarkers("no markers here")).toBe(false);
    expect(() => builder.replaceSystemZone("no markers", dto)).toThrowError("PLUGIN_002");
  });

  it("extracts user zone sections", () => {
    const md = new MarkdownBuilder().buildFromDTO(dto);
    const withContent = md.replace("## 我的笔记\n", "## 我的笔记\n这是我的笔记");
    const zone = new MarkdownBuilder().extractUserZone(withContent);
    expect(zone.note).toBe("这是我的笔记");
  });

  it("writes tags/topics into YAML frontmatter with safe quoting", () => {
    const withTags: CollectionDTO = {
      ...dto,
      title: "桌搭推荐: 进阶#生活美学 #桌搭好物",
      tags: ["生活美学", "桌搭好物"],
      topics: ["桌搭设计"],
    };
    const md = new MarkdownBuilder().buildFromDTO(withTags);
    expect(md).toContain('title: "桌搭推荐: 进阶#生活美学 #桌搭好物"');
    expect(md).toContain('tags: ["生活美学","桌搭好物"]');
    expect(md).toContain('topics: ["桌搭设计"]');
    expect(md).toContain("# 桌搭推荐: 进阶\\#生活美学 \\#桌搭好物");
  });

  it("replaceSystemZone refreshes frontmatter tags/topics without touching user zone", () => {
    const builder = new MarkdownBuilder();
    const first = builder.buildFromDTO({ ...dto, tags: ["旧标签"] });
    const updated = builder.replaceSystemZone(first + "\n用户笔记内容", {
      ...dto,
      title: "新标题",
      tags: ["新标签"],
      topics: ["新主题"],
    });
    expect(updated).toContain('tags: ["新标签"]');
    expect(updated).toContain('topics: ["新主题"]');
    expect(updated).toContain('title: "新标题"');
    expect(updated).toContain("用户笔记内容");
    expect(updated).not.toContain("旧标签");
  });

  it("builds topic hub note with wikilinks", () => {
    const hub = new MarkdownBuilder().buildTopicHub("桌搭设计", [
      "Omni Collector/xiaohongshu/桌搭推荐",
      "Omni Collector/bilibili/桌搭视频",
    ]);
    expect(hub).toContain("# 桌搭设计");
    expect(hub).toContain("[[Omni Collector/xiaohongshu/桌搭推荐]]");
    expect(hub).toContain("[[Omni Collector/bilibili/桌搭视频]]");
  });
});
