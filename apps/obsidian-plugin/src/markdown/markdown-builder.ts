import type { CollectionDTO, UserZone } from "@omni/shared-core";

const SYSTEM_START = "<!-- OMNI_SYSTEM_START -->";
const SYSTEM_END = "<!-- OMNI_SYSTEM_END -->";

/**
 * Markdown 区域隔离协议（TDD Part 8，SPEC S7 冻结）：
 * 系统区由 Plugin 依据 Engine DTO 生成；用户区任何自动化逻辑禁止修改（ADR-011/ADR-006）。
 */
export class MarkdownBuilder {
  buildFromDTO(dto: CollectionDTO): string {
    const system = [
      `title: ${dto.title}`,
      `platform: ${dto.platform}`,
      `url: ${dto.url}`,
      `sync_status: ${dto.syncStatus}`,
    ].join("\n");
    return [
      "---",
      "# Omni Collector System Zone",
      SYSTEM_START,
      system,
      SYSTEM_END,
      "---",
      "",
      `# ${dto.title}`,
      "",
      "<!-- 以下为用户私有编辑区，任何自动化逻辑禁止修改 -->",
      "## 我的笔记",
      "",
      "## 精选评论",
      "",
      "## 评分与优先级",
      "",
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
      `title: ${dto.title}`,
      `platform: ${dto.platform}`,
      `url: ${dto.url}`,
      `sync_status: ${dto.syncStatus}`,
    ].join("\n");
    return md.replace(
      new RegExp(`${SYSTEM_START}[\\s\\S]*?${SYSTEM_END}`),
      `${SYSTEM_START}\n${system}\n${SYSTEM_END}`,
    );
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
