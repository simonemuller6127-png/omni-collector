import { describe, expect, it } from "vitest";
import { MarkdownBuilder, topicHubWikilinkPath } from "../src/markdown/markdown-builder.js";
import {
  ensureDir,
  isHierarchicalTopic,
  parseTopicSegments,
  topicDepth,
  topicHubRelPath,
  topicLeafName,
  topicParentPath,
} from "../src/markdown/topic-path.js";

/**
 * B（Topic 多级 · 路径命名）覆盖：
 * 层级用「路径命名」Topic 名实现（Topics/游戏/F1赛车.md + frontmatter parent），
 * 不做 topics.parent_id migration、不上 Embedding/Clustering。
 * 纯函数模块 + MarkdownBuilder 不依赖 obsidian 运行时，可单测。
 */
describe("topic-path 纯函数", () => {
  it("parses 路径命名 segments by ':'", () => {
    expect(parseTopicSegments("游戏:F1赛车")).toEqual(["游戏", "F1赛车"]);
    expect(parseTopicSegments("桌搭设计")).toEqual(["桌搭设计"]);
    expect(parseTopicSegments("")).toEqual([]);
    // 空段被剔除（容错「游戏::F1」与首尾冒号）
    expect(parseTopicSegments("游戏::F1")).toEqual(["游戏", "F1"]);
    expect(parseTopicSegments(" :游戏: ")).toEqual(["游戏"]);
  });

  it("derives parent / leaf / depth", () => {
    expect(topicParentPath("游戏:F1赛车")).toBe("游戏");
    expect(topicParentPath("游戏:F1:排位赛")).toBe("游戏:F1");
    expect(topicParentPath("桌搭设计")).toBeUndefined();
    expect(topicLeafName("游戏:F1赛车")).toBe("F1赛车");
    expect(topicLeafName("桌搭设计")).toBe("桌搭设计");
    expect(topicDepth("桌搭设计")).toBe(1);
    expect(topicDepth("游戏:F1赛车")).toBe(2);
    expect(topicDepth("游戏:F1:排位赛")).toBe(3);
    expect(isHierarchicalTopic("游戏:F1赛车")).toBe(true);
    expect(isHierarchicalTopic("桌搭设计")).toBe(false);
  });

  it("maps topic name to hub relative path (path-named)", () => {
    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_");
    expect(topicHubRelPath("游戏:F1赛车", sanitize)).toBe("游戏/F1赛车");
    expect(topicHubRelPath("桌搭设计", sanitize)).toBe("桌搭设计");
    expect(topicHubWikilinkPath("游戏:F1赛车")).toBe("游戏/F1赛车");
    // 段内非法字符被清洗，不产生路径穿越
    expect(topicHubRelPath("a:..:b", sanitize)).toBe("a/../b");
    // "a:../b" 按 ':' 拆成 ["a", "../b"]，段内 "/" 被 sanitize 清成 "_" → 无穿越
    expect(topicHubWikilinkPath("a:../b")).toBe("a/.._b");
  });

  it("ensureDir creates parents first and is idempotent", async () => {
    const existing = new Set<string>(["vault", "vault/Omni Collector", "vault/Omni Collector/Topics"]);
    const created: string[] = [];
    const checker = { exists: async (p: string) => existing.has(p) };
    const creator = {
      createFolder: (p: string) => {
        created.push(p);
        existing.add(p);
      },
    };
    await ensureDir(checker, creator, "vault/Omni Collector/Topics/游戏");
    expect(created).toEqual(["vault/Omni Collector/Topics/游戏"]);
    // 幂等：已存在则不再创建
    await ensureDir(checker, creator, "vault/Omni Collector/Topics/游戏");
    expect(created).toEqual(["vault/Omni Collector/Topics/游戏"]);
    // 多层缺失时逐级创建父目录
    created.length = 0;
    await ensureDir(checker, creator, "vault/A/B/C");
    expect(created).toEqual(["vault/A", "vault/A/B", "vault/A/B/C"]);
  });
});

describe("buildTopicHub 路径命名（B）", () => {
  it("hierarchical topic: frontmatter parent + 叶子 H1 + 系统区层级段", () => {
    const hub = new MarkdownBuilder().buildTopicHub("游戏:F1赛车", ["Omni Collector/bilibili/F1 集锦"]);
    // frontmatter 带 parent
    expect(hub).toContain('topic: "游戏:F1赛车"');
    expect(hub).toContain('parent: "游戏"');
    // H1 用叶子名（与文件名一致）
    expect(hub).toContain("# F1赛车");
    // 系统区「层级」段：父级链接 + 深度
    expect(hub).toContain("## 层级");
    expect(hub).toContain("父级：[[Omni Collector/Topics/游戏]]");
    expect(hub).toContain("深度：2");
    // 动态索引仍按全名匹配（frontmatter topics 存全路径名）
    expect(hub).toContain('WHERE contains(topics, "游戏:F1赛车")');
    // 区域隔离协议不变
    expect(hub).toContain("## 我的整理");
    expect(hub).toContain("aliases: []");
  });

  it("flat topic keeps the old format byte-for-byte (no parent key, no 层级段)", () => {
    const hub = new MarkdownBuilder().buildTopicHub("桌搭设计", ["Omni Collector/bilibili/桌搭视频"]);
    expect(hub).toContain("# 桌搭设计");
    expect(hub).not.toContain("parent:");
    expect(hub).not.toContain("## 层级");
    expect(hub).toContain('WHERE contains(topics, "桌搭设计")');
  });

  it("three-level topic chains parent path correctly", () => {
    const hub = new MarkdownBuilder().buildTopicHub("游戏:F1:排位赛", ["Omni Collector/bilibili/排位"]);
    expect(hub).toContain('parent: "游戏:F1"');
    expect(hub).toContain("深度：3");
    expect(hub).toContain("# 排位赛");
    // 父级链接指向路径命名位置
    expect(hub).toContain("父级：[[Omni Collector/Topics/游戏/F1]]");
  });

  it("collection notes link hierarchical topics to their path-named hub node", () => {
    const md = new MarkdownBuilder().buildFromDTO({
      id: "c1",
      platform: "bilibili",
      platformItemId: "BV1",
      url: "https://bilibili.com/video/BV1",
      title: "F1 集锦",
      contentType: "video",
      saveType: "favorited",
      contentStatus: "active",
      syncStatus: "full",
      organizeStatus: "unorganized",
      priority: "normal",
      collectedAt: "2026-08-07T00:00:00Z",
      topics: ["游戏:F1赛车"],
    });
    expect(md).toContain("[[Omni Collector/Topics/游戏/F1赛车]]");
  });

  it("replaceHubSystemZone keeps user zone and refreshes hierarchical hub", () => {
    const builder = new MarkdownBuilder();
    const hub = builder.buildTopicHub("游戏:F1赛车", ["Omni Collector/bilibili/旧集锦"]);
    const userEdit = hub.replace("## 我的整理", "## 我的整理\n\n我自己的 F1 整理，不能被覆盖");
    const next = builder.replaceHubSystemZone(
      userEdit,
      "F1赛车",
      ["Omni Collector/bilibili/新集锦"],
      "topics",
    )!;
    expect(next).not.toBeNull();
    expect(next).toContain("[[Omni Collector/bilibili/新集锦]]");
    expect(next).toContain("我自己的 F1 整理，不能被覆盖");
    expect(next).toContain("# F1赛车");
  });
});
