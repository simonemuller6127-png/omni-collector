import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { FileRepository } from "@omni/database";

export interface IndexReport {
  scanned: number;
  indexed: number;
  errors: string[];
}

interface MarkdownMeta {
  title?: string;
  tags: string[];
}

/**
 * 轻量文件索引器（TDD Part 2.4.9 / SPEC S12）：
 * 只采集文件系统基础元数据；增强模式仅对 Markdown 提取 frontmatter 标题与标签，
 * 禁止全文 OCR、禁止生成任何 TXT 副本。
 */
export class FileIndexer {
  constructor(private readonly files: FileRepository) {}

  scan(folder: string, enhanced = false): IndexReport {
    const report: IndexReport = { scanned: 0, indexed: 0, errors: [] };
    if (!fs.existsSync(folder)) {
      report.errors.push(`folder not found: ${folder}`);
      return report;
    }
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
          const row = this.files.upsertLocalFile({
            file_path: full,
            file_name: entry.name,
            file_type: path.extname(entry.name).toLowerCase() || null,
            file_size: stat.size,
            created_at: stat.birthtime.toISOString(),
            modified_at: stat.mtime.toISOString(),
            file_hash: this.hashFile(full),
          });
          if (enhanced) {
            if (entry.name.toLowerCase().endsWith(".md")) {
              const meta = this.extractMarkdownMeta(fs.readFileSync(full, "utf8"));
              this.files.upsertIndex(row.id, {
                extracted_title: meta.title ?? null,
                analysis_status: "done",
              });
            } else {
              this.files.upsertIndex(row.id, { analysis_status: "skipped" });
            }
          }
          report.indexed += 1;
        } catch (err) {
          report.errors.push(`${full}: ${(err as Error).message}`);
        }
      }
    };
    walk(folder);
    return report;
  }

  private hashFile(filePath: string): string {
    const hash = createHash("sha256");
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest("hex");
  }

  private extractMarkdownMeta(content: string): MarkdownMeta {
    const meta: MarkdownMeta = { tags: [] };
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
    return meta;
  }
}
