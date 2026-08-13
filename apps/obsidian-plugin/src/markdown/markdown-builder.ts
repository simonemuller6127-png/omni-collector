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
    const frontmatter = this.buildFrontmatter(dto);
    const topicLinks = (dto.topics ?? [])
      .map((t) => `- [[Omni Collector/Topics/${sanitizeFilename(t)}]]`)
      .join("\n");
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
      ...(topicLinks ? ['## 关联', '', topicLinks, ''] : []),
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
      '## 精选评论',
      '',
      '## 评分与优先级',
      '',
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
    return out;
  }

  /** Topic 聚合页（PRD 17 / 关系图谱联动）：wikilink 指向全部成员笔记。 */
  buildTopicHub(topicName: string, noteLinks: string[]): string {
    const name = (topicName || "未命名主题").trim();
    const links = [...new Set(noteLinks.filter(Boolean))]
      .map((l) => `- [[${l.replace(/\.md$/i, "")}]]`)
      .join("\n");
    return [
      "---",
      `topic: ${yamlString(name)}`,
      `tags: ["topic/${sanitizeFilename(name)}"]`,
      "---",
      "",
      `# ${name}`,
      "",
      "> 主题聚合页（Omni Collector 自动生成，修改会被覆盖）",
      "",
      "## 收藏",
      "",
      links,
      "",
    ].join("\n");
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
