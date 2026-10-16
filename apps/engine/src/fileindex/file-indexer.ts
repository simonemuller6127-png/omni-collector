import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { FileRepository } from "@omni/database";

export interface IndexReport {
  scanned: number;
  indexed: number;
  /** 本次扫描标记为 file_missing 的在册文件数（PRD 9.7 第一层软警告）。 */
  missing: number;
  /** 按哈希在新位置恢复关联的文件数（PRD 9.7 第二层，需 file_hash_tracking 开启）。 */
  relocated: number;
  errors: string[];
}

export interface ScanOptions {
  /** 增强分析（PRD 9.4，规则 file_enhanced_analysis）：Markdown 章节标题 + TOC。 */
  enhanced?: boolean;
  /** 哈希追踪（PRD 9.7，规则 file_hash_tracking）：计算 SHA-256 并支持移动恢复。 */
  hashing?: boolean;
}

interface MarkdownMeta {
  title?: string;
  tags: string[];
  chapterTitles: string[];
  toc: Array<{ level: number; title: string }>;
}

/**
 * 轻量文件索引器（TDD Part 2.4.9 / SPEC S12）：
 * 只采集文件系统基础元数据；增强模式仅对 Markdown 提取 frontmatter 标题、标签与标题结构，
 * 禁止全文 OCR、禁止生成任何 TXT 副本。
 */
export class FileIndexer {
  constructor(
    private readonly files: FileRepository,
    /** 增强模式：把 Markdown 系统区里的 url 关联到收藏（linked_collection_id）。 */
    private readonly resolveCollectionId?: (url: string) => string | undefined,
  ) {}

  scan(folder: string, opts: ScanOptions = {}): IndexReport {
    const { enhanced = false, hashing = false } = opts;
    const report: IndexReport = { scanned: 0, indexed: 0, missing: 0, relocated: 0, errors: [] };
    if (!fs.existsSync(folder)) {
      report.errors.push(`folder not found: ${folder}`);
      return report;
    }
    const visitedIds = new Set<string>();
    const hashToPath = new Map<string, { file_path: string; file_name: string; file_size: number; modified_at: string }>();

    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        report.errors.push(`${dir}: ${(err as Error).message}`);
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.isFile()) continue;
        report.scanned += 1;
        try {
          const stat = fs.statSync(full);
          const hash = hashing ? this.hashFile(full) : undefined;
          if (hash) {
            if (!hashToPath.has(hash)) {
              hashToPath.set(hash, {
                file_path: full,
                file_name: entry.name,
                file_size: stat.size,
                modified_at: stat.mtime.toISOString(),
              });
            }
          }
          const row = this.files.upsertLocalFile({
            file_path: full,
            file_name: entry.name,
            file_type: path.extname(entry.name).toLowerCase() || null,
            file_size: stat.size,
            created_at: stat.birthtime.toISOString(),
            modified_at: stat.mtime.toISOString(),
            file_hash: hash,
          });
          visitedIds.add(row.id);
          if (entry.name.toLowerCase().endsWith(".md")) {
            const content = fs.readFileSync(full, "utf8");
            const meta = this.extractMarkdownMeta(content);
            const systemUrl = this.extractSystemUrl(content);
            if (enhanced) {
              this.files.upsertIndex(row.id, {
                extracted_title: meta.title ?? null,
                chapter_titles: meta.chapterTitles.length ? JSON.stringify(meta.chapterTitles) : null,
                toc_json: meta.toc.length ? JSON.stringify(meta.toc) : null,
                analysis_status: "done",
              });
            } else {
              this.files.upsertIndex(row.id, {
                extracted_title: meta.title ?? null,
                analysis_status: "done",
              });
            }
            if (systemUrl && this.resolveCollectionId) {
              const collectionId = this.resolveCollectionId(systemUrl);
              if (collectionId) {
                this.files.upsertLocalFile({
                  file_path: full,
                  file_name: entry.name,
                  file_type: path.extname(entry.name).toLowerCase() || null,
                  file_size: stat.size,
                  created_at: stat.birthtime.toISOString(),
                  modified_at: stat.mtime.toISOString(),
                  file_hash: hash,
                  linked_collection_id: collectionId,
                });
              }
            }
          } else {
            this.files.upsertIndex(row.id, { analysis_status: "skipped" });
          }
          report.indexed += 1;
        } catch (err) {
          report.errors.push(`${full}: ${(err as Error).message}`);
        }
      }
    };
    walk(folder);

    // 第一层软警告：在册但磁盘上已消失 → file_missing
    for (const row of this.files.listActiveUnder(folder)) {
      if (visitedIds.has(row.id)) continue;
      if (!fs.existsSync(row.file_path)) {
        this.files.markMissing(row.id);
        report.missing += 1;
      }
    }

    // 第二层哈希追踪：丢失文件在本目录树内出现同哈希新路径 → 自动恢复
    if (hashing && hashToPath.size > 0) {
      for (const miss of this.files.listMissingWithHash()) {
        const found = hashToPath.get(miss.file_hash);
        if (!found) continue;
        const existingAtNewPath = this.files.queryByPath(found.file_path);
        if (existingAtNewPath && existingAtNewPath.id !== miss.id) {
          // 新路径已被同内容文件占行：把丢失行的收藏关联迁移过去，删除丢失行
          if (miss.linked_collection_id && !existingAtNewPath.linked_collection_id) {
            this.files.setLink(existingAtNewPath.id, miss.linked_collection_id);
          }
          this.files.deleteRow(miss.id);
        } else {
          this.files.relocateFile(miss.id, found);
        }
        report.relocated += 1;
      }
    }
    return report;
  }

  private hashFile(filePath: string): string {
    const hash = createHash("sha256");
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest("hex");
  }

  private extractMarkdownMeta(content: string): MarkdownMeta {
    const meta: MarkdownMeta = { tags: [], chapterTitles: [], toc: [] };
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
    if (frontmatter) {
      const title = /^title:\s*(.+)$/m.exec(frontmatter[1]);
      if (title) meta.title = title[1].trim();
      const tags = /^tags:\s*\[(.*)\]$/m.exec(frontmatter[1]);
      if (tags) meta.tags = tags[1].split(",").map((t) => t.trim()).filter(Boolean);
    }
    if (!meta.title) {
      const h1 = /^#\s+(.+)$/m.exec(content);
      if (h1) meta.title = h1[1].trim();
    }
    // 增强分析（PRD 9.3 轻量结构元数据）：仅标题行，不读正文语义
    for (const m of content.matchAll(/^(#{1,4})\s+(.+?)\s*$/gm)) {
      const level = m[1].length;
      const text = m[2].trim();
      meta.toc.push({ level, title: text });
      if (level >= 2 && level <= 3) meta.chapterTitles.push(text);
    }
    return meta;
  }

  /** 从 Markdown 系统区提取原始链接（url: xxx）。 */
  private extractSystemUrl(content: string): string | null {
    const m = /<!--\s*OMNI_SYSTEM_START\s*-->([\s\S]*?)<!--\s*OMNI_SYSTEM_END\s*-->/.exec(content);
    if (!m) return null;
    const urlMatch = /url:\s*(\S+)/.exec(m[1]);
    return urlMatch?.[1] ?? null;
  }
}
