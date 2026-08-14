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

  /** Tag 聚合页（PRD 16 / 关系图谱联动）：主 Tag 节点 + 成员笔记 wikilink。 */
  buildTagHub(tagName: string, noteLinks: string[]): string {
    const name = (tagName || "未命名标签").trim();
    const links = [...new Set(noteLinks.filter(Boolean))]
      .map((l) => `- [[${l.replace(/\.md$/i, "")}]]`)
      .join("\n");
    return [
      "---",
      `tags: ["${sanitizeFilename(name)}"]`,
      "---",
      "",
      `# ${name}`,
      "",
      "> 标签聚合页（Omni Collector 自动生成，修改会被覆盖）",
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
