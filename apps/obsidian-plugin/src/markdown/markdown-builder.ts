import type { CollectionDTO, UserZone } from "@omni/shared-core";

const SYSTEM_START = "<!-- OMNI_SYSTEM_START -->";
const SYSTEM_END = "<!-- OMNI_SYSTEM_END -->";

/** YAML 双引号安全序列化（标题含 : # " 时仍可解析）。 */
function yamlString(v: string): string {
  return JSON.stringify(String(v ?? ""));
}

/** 展示标题：转义 # 避免 Obsidian 把标题话题当作内联标签。 */
function escapeTitleHash(title: string): string {
  return (title ?? "").replace(/#/g, "\\#");
}

/** 文件名安全化（Windows 非法字符 + 长度）。 */
export function sanitizeFilename(name: string): string {
  return (name || "untitled").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 评分展示（PRD 29.2：1~5 星，用户区）。 */
export function renderRating(rating?: number | null): string {
  const n = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
  return n === 0 ? "" : `${"★".repeat(n)}${"☆".repeat(5 - n)}（${n}/5）`;
}

/**
 * Markdown 区域隔离协议（TDD Part 8，SPEC S7 冻结）：
 * 系统区由 Plugin 依据 Engine DTO 生成；用户区任何自动化逻辑禁止修改（ADR-011/ADR-006）。
 */
export class MarkdownBuilder {
  buildFromDTO(dto: CollectionDTO): string {
    const system = [
      `title: ${yamlString(dto.title)}`,
      `platform: ${yamlString(dto.platform)}`,
      `url: ${yamlString(dto.url)}`,
      `sync_status: ${yamlString(dto.syncStatus)}`,
    ].join('\n');
    const comments = (dto.comments ?? []).map((c) => `- **${c.author}**：${c.content}`).join('\n');
    const starred = (dto.comments ?? [])
      .filter((c) => c.starred)
      .map((c) => `- **${c.author}**：${c.content}`)
      .join('\n');
    const ratingText = renderRating(dto.rating);
    const frontmatter = this.buildFrontmatter(dto);
    const graphLinks = this.buildGraphLinks(dto);
    return [
      frontmatter,
      '---',
      '# Omni Collector System Zone',
      SYSTEM_START,
      system,
      SYSTEM_END,
      '---',
      '',
      `# ${escapeTitleHash(dto.title)}`,
      '',
      ...(graphLinks ? ['## 关联', '', graphLinks, ''] : []),
      ...(dto.coverUrl ? [`![cover](${dto.coverUrl})`, ''] : []),
      ...(dto.author ? [`作者：${dto.author}`, ''] : []),
      ...(dto.description ? ['## 简介', '', dto.description, ''] : []),
      ...(comments ? ['## 评论', '', comments, ''] : []),
      '## 整理与优先级',
      '',
      `优先级：${dto.priority} / 整理状态：${dto.organizeStatus}`,
      '',
      '<!-- 以下为用户私有编辑区，任何自动化逻辑禁止修改 -->',
      '## 我的笔记',
      '',
      ...(starred ? ['## 精选评论', '', starred, ''] : ['## 精选评论', '']),
      ...(ratingText ? ['## 评分与优先级', '', ratingText, ''] : ['## 评分与优先级', '']),
    ].join('\n');
  }

  private buildFrontmatter(dto: CollectionDTO): string {
    const tags = JSON.stringify(dto.tags ?? []);
    const topics = JSON.stringify(dto.topics ?? []);
    return [
      "---",
      `platform: ${yamlString(dto.platform)}`,
      `url: ${yamlString(dto.url)}`,
      `priority: ${yamlString(dto.priority)}`,
      `organize_status: ${yamlString(dto.organizeStatus)}`,
      `tags: ${tags}`,
      `topics: ${topics}`,
      "---",
    ].join("\n");
  }

  validateMarkers(md: string): boolean {
    const start = md.indexOf(SYSTEM_START);
    const end = md.indexOf(SYSTEM_END);
    return start >= 0 && end > start;
  }

  replaceSystemZone(md: string, dto: CollectionDTO): string {
    if (!this.validateMarkers(md)) {
      throw new Error("PLUGIN_002: system zone markers missing or misordered");
    }
    const system = [
      `title: ${yamlString(dto.title)}`,
      `platform: ${yamlString(dto.platform)}`,
      `url: ${yamlString(dto.url)}`,
      `sync_status: ${yamlString(dto.syncStatus)}`,
    ].join("\n");
    let out = md.replace(
      new RegExp(`${SYSTEM_START}[\\s\\S]*?${SYSTEM_END}`),
      `${SYSTEM_START}\n${system}\n${SYSTEM_END}`,
    );
    // 重建 YAML frontmatter（tags/topics/优先级等系统字段）
    const newFrontmatter = this.buildFrontmatter(dto);
    if (/^---\n[\s\S]*?\n---\n/.test(out)) {
      out = out.replace(/^---\n[\s\S]*?\n---\n/, `${newFrontmatter}\n`);
    } else {
      out = `${newFrontmatter}\n${out}`;
    }
    // 正文 H1 是标题镜像：转义 # 避免 Obsidian 把标题话题当内联标签（用户区不动）
    const markerIdx = out.indexOf(SYSTEM_END);
    if (markerIdx >= 0) {
      const head = out.slice(0, markerIdx + SYSTEM_END.length);
      let tail = out.slice(markerIdx + SYSTEM_END.length);
      tail = tail.replace(/^# .*$/m, `# ${escapeTitleHash(dto.title)}`);
      // 重建「关联」区（Tag/Topic 聚合页双链），旧链接随标签变更移除
      const links = this.buildGraphLinks(dto);
      const sectionRe = /^## 关联\s*$[\s\S]*?(?=^## |^# |\Z)/m;
      if (links) {
        tail = tail.replace(sectionRe, `## 关联\n\n${links}\n\n`);
      } else {
        tail = tail.replace(sectionRe, "");
      }
      out = head + tail;
    }
    return out;
  }

  private buildGraphLinks(dto: CollectionDTO): string {
    const topicLinks = (dto.topics ?? [])
      .map((t) => `- [[Omni Collector/Topics/${sanitizeFilename(t)}]]`)
      .join("\n");
    const tagLinks = (dto.tags ?? [])
      .map((t) => `- [[Omni Collector/Tags/${sanitizeFilename(t)}]]`)
      .join("\n");
    return [topicLinks, tagLinks].filter(Boolean).join("\n");
  }

  /** Topic 聚合页（PRD 17 / 关系图谱联动）：wikilink 指向全部成员笔记。 */
  buildTopicHub(topicName: string, noteLinks: string[]): string {
    const name = (topicName || "未命名主题").trim();
    return this.buildHub(name, noteLinks, {
      frontmatterKey: "topic",
      tags: [JSON.stringify(`topic/${sanitizeFilename(name)}`)],
      dataviewField: "topics",
    });
  }

  /** Tag 聚合页（PRD 16 / 关系图谱联动）：主 Tag 节点 + 成员笔记 wikilink。 */
  buildTagHub(tagName: string, noteLinks: string[]): string {
    const name = (tagName || "未命名标签").trim();
    return this.buildHub(name, noteLinks, {
      frontmatterKey: "tag",
      tags: [JSON.stringify(sanitizeFilename(name))],
      dataviewField: "tags",
    });
  }

  /**
   * 聚合页统一构造（PRD 17/16）：与收藏笔记相同的区域隔离协议——
   * 系统区（成员 wikilink + Dataview 动态索引）自动维护；「我的整理」起为用户区，自动化禁止触碰。
   * frontmatter 的 aliases 供用户自定义别名（图谱/解析原生生效）。
   */
  private buildHub(
    name: string,
    noteLinks: string[],
    cfg: { frontmatterKey: "topic" | "tag"; tags: string[]; dataviewField: "topics" | "tags" },
  ): string {
    return [
      "---",
      `${cfg.frontmatterKey}: ${yamlString(name)}`,
      `tags: [${cfg.tags.join(", ")}]`,
      "aliases: []",
      "---",
      "",
      `# ${escapeTitleHash(name)}`,
      "",
      `> 聚合页说明：系统区（标记注释之间）由 Omni Collector 自动维护；「## 我的整理」及之后为用户区，任何自动化逻辑禁止修改。`,
      "",
      SYSTEM_START,
      this.buildHubSystemZone(name, noteLinks, cfg.dataviewField),
      SYSTEM_END,
      "",
      "## 我的整理",
      "",
    ].join("\n");
  }

  /** 聚合页系统区：成员 wikilink（图谱边）+ Dataview 动态索引（按 frontmatter 元数据实时查询）。 */
  private buildHubSystemZone(name: string, noteLinks: string[], dataviewField: "topics" | "tags"): string {
    const links = [...new Set(noteLinks.filter(Boolean))]
      .map((l) => `- [[${l.replace(/\.md$/i, "")}]]`)
      .join("\n");
    const safeName = name.replace(/"/g, "'");
    return [
      "## 收藏",
      "",
      links || "（暂无成员）",
      "",
      "## 动态索引",
      "",
      "```dataview",
      "TABLE priority AS 优先级, organize_status AS 整理状态, collected_at AS 收藏日期",
      'FROM "Omni Collector"',
      `WHERE contains(${dataviewField}, "${safeName}")`,
      "SORT collected_at DESC",
      "```",
      "",
    ].join("\n");
  }

  /**
   * 更新聚合页系统区（成员/标题变化时）：只替换标记内内容并镜像 H1，
   * frontmatter（含用户 aliases）与「我的整理」用户区原样保留。
   * 返回 null 表示文件缺少系统区标记（旧格式，由调用方决定升级策略）。
   */
  replaceHubSystemZone(
    md: string,
    hubTitle: string,
    noteLinks: string[],
    dataviewField: "topics" | "tags",
  ): string | null {
    if (!this.validateMarkers(md)) return null;
    const start = md.indexOf(SYSTEM_START);
    const end = md.indexOf(SYSTEM_END) + SYSTEM_END.length;
    const head = md.slice(0, start);
    const tail = md.slice(end);
    const system = `${SYSTEM_START}\n${this.buildHubSystemZone(hubTitle, noteLinks, dataviewField)}${SYSTEM_END}`;
    const updatedHead = head.replace(/^# .*$/m, `# ${escapeTitleHash(hubTitle)}`);
    return `${updatedHead}${system}${tail}`;
  }

  /**
   * 替换用户区指定小节的内容（仅系统区标记之后）。
   * 仅用于物化用户在插件 UI 的显式操作（评分 PRD 29.2 / 精选评论 PRD 7.3），
   * 等同用户本人编辑，不属于自动化覆盖。
   */
  replaceUserZoneSection(md: string, headerKeyword: string, content: string): string | null {
    if (!this.validateMarkers(md)) return null;
    const markerIdx = md.indexOf(SYSTEM_END) + SYSTEM_END.length;
    const head = md.slice(0, markerIdx);
    const tail = md.slice(markerIdx);
    const re = new RegExp(
      `(^##\\s+.*${escapeRegExp(headerKeyword)}.*\\n)([\\s\\S]*?)(?=^##\\s|^#\\s|(?![\\s\\S]))`,
      "m",
    );
    if (!re.test(tail)) return null;
    const body = content.trim() ? `${content.trim()}\n\n` : "\n";
    return head + tail.replace(re, `$1${body}`);
  }

  extractUserZone(md: string): UserZone {
    const zone: UserZone = {};
    const sections = md.split(/^##\s+/m);
    for (const section of sections.slice(1)) {
      const [header, ...body] = section.split("\n");
      const content = body.join("\n").trim();
      if (header.includes("我的笔记")) zone.note = content;
      else if (header.includes("精选评论")) zone.starredComments = content;
      else if (header.includes("评分")) zone.rating = content;
      else if (header.includes("优先级")) zone.priority = content;
    }
    return zone;
  }
}
