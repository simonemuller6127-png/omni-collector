#!/usr/bin/env node
/**
 * topic-hierarchy-pipeline.mjs — Topic 多级「路径命名」一次性迁移管道（B 部分，仅规格落档）。
 *
 * 目标：把现有扁平 Topic 名批量改写为路径命名（"游戏" + "F1赛车" → "游戏:F1赛车"），
 * 并重生成 vault 内的层级 hub（Topics/游戏/F1赛车.md + frontmatter parent）。
 *
 * 安全约束（与 scripts/tag-normalize-pipeline.mjs 同规格）：
 *   1. --db 为强制参数，缺省直接报错退出（不硬编码 data/OmniCollector.db）；
 *   2. 以 { readonly: true } 打开做扫描与报告，永不在此阶段写库；
 *   3. 默认 --dry-run 只打印与写报告；必须显式 --apply 且未传 --dry-run 才执行落库/落盘；
 *   4. 本任务【只跑 dry-run 与 schema 探查】，禁止执行 --apply，禁止 topics 表 migration；
 *   5. 报告含：候选层级改写映射、当前 topics 表结构（确认无 parent_id）、
 *      待生成的层级 hub 路径清单、每个层级 Topic 的成员数。
 *
 * 用法：
 *   node scripts/topic-hierarchy-pipeline.mjs --db "D:/path/OmniCollector.db" [--dry-run] [--apply]
 *   node scripts/topic-hierarchy-pipeline.mjs --db "..." --map '{"F1赛车":["游戏","F1赛车"]}'
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { db: null, dryRun: false, apply: false, map: null, out: null, limit: 5000 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--db") out.db = argv[++i] ?? null;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--map") out.map = argv[++i] ?? null;
    else if (a === "--limit") out.limit = Number(argv[++i] ?? 5000);
    else if (a === "--out") out.out = argv[++i] ?? null;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function msg(text) {
  process.stdout.write(`${text}\n`);
}

/** 与插件侧 topic-path.ts 同口径的路径命名解析（脚本独立实现，避免跨包依赖）。 */
const SEP = ":";
function parseSegments(name) {
  return String(name ?? "").split(SEP).map((s) => s.trim()).filter(Boolean);
}
function hubRelPath(name) {
  const segs = parseSegments(name);
  if (segs.length === 0) return "未命名主题";
  return segs.map((s) => s.replace(/[\\/:*?"<>|]/g, "_")).filter(Boolean).join("/");
}
function parentPath(name) {
  const segs = parseSegments(name);
  return segs.length > 1 ? segs.slice(0, -1).join(SEP) : undefined;
}
function leafName(name) {
  const segs = parseSegments(name);
  return segs.length > 0 ? segs[segs.length - 1] : String(name ?? "").trim();
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.db) {
    msg("用法: node scripts/topic-hierarchy-pipeline.mjs --db <OmniCollector.db> [--dry-run|--apply] [--map <json>] [--out report.json]");
    if (!args.db) {
      msg("错误: 缺少强制参数 --db（出于生产库安全，本脚本不提供默认路径）");
      process.exitCode = 2;
    }
    return;
  }
  if (!fs.existsSync(args.db)) {
    msg(`错误: 数据库文件不存在: ${args.db}`);
    process.exitCode = 2;
    return;
  }
  if (args.apply && args.dryRun) {
    msg("错误: --apply 与 --dry-run 互斥");
    process.exitCode = 2;
    return;
  }
  const mode = args.apply ? "apply" : "dry-run";
  msg(`[topic-hierarchy-pipeline] db=${args.db} mode=${mode}`);

  // better-sqlite3 解析路径与 scripts/bulk-tag.mjs 一致（pnpm 的 .pnpm/node_modules）
  const { default: Database } = await import(
    pathToFileURL(path.join(here, "../node_modules/.pnpm/node_modules/better-sqlite3/lib/index.js")).href
  );
  const ro = new Database(args.db, { readonly: true, fileMustExist: true });
  try {
    // ① 结构探查：确认 topics 表无 parent_id 列（B 明确不做 parent_id migration）
    const cols = ro.prepare("PRAGMA table_info(topics)").all();
    const colNames = cols.map((c) => c.name);
    const hasParentId = colNames.includes("parent_id");
    msg(`topics 表列: ${colNames.join(", ")}`);
    msg(`parent_id 列存在: ${hasParentId}（B 设计要求为 false —— 层级一律走路径命名）`);

    // ② 当前 Topic 清单 + 成员数
    const rows = ro
      .prepare(
        `SELECT id, name, status FROM topics ORDER BY name ASC LIMIT ?`,
      )
      .all(args.limit);
    const topics = rows.map((r) => {
      const cidRaw = r.collection_ids;
      let members = 0;
      try {
        const arr = typeof cidRaw === "string" ? JSON.parse(cidRaw) : cidRaw;
        members = Array.isArray(arr) ? arr.length : 0;
      } catch {
        members = 0;
      }
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        members,
        segments: parseSegments(r.name),
        depth: parseSegments(r.name).length || 1,
        isHierarchical: parseSegments(r.name).length > 1,
        hubRelPath: hubRelPath(r.name),
        parent: parentPath(r.name),
      };
    });

    // ③ 层级改写候选（--map 提供 叶子名 → 全路径 的映射）
    let mapping = {};
    if (args.map) {
      try {
        mapping = JSON.parse(args.map);
      } catch {
        msg("错误: --map 不是合法 JSON（应为 {\"叶子名\": [\"父级\", \"叶子\"]}）");
        process.exitCode = 2;
        return;
      }
    }
    const candidates = topics
      .filter((t) => !t.isHierarchical && Object.prototype.hasOwnProperty.call(mapping, t.name))
      .map((t) => ({
        from: t.name,
        to: mapping[t.name].join(SEP),
        members: t.members,
        hubRelPath: hubRelPath(mapping[t.name].join(SEP)),
      }));

    const report = {
      generatedAt: new Date().toISOString(),
      dbPath: args.db,
      mode,
      schema: { topicsColumns: colNames, hasParentId, expectedNoParentId: !hasParentId },
      totals: {
        topics: topics.length,
        hierarchical: topics.filter((t) => t.isHierarchical).length,
        maxDepth: topics.reduce((m, t) => Math.max(m, t.depth), 0),
      },
      rewriteCandidates: candidates,
      hubPaths: topics.map((t) => ({
        topic: t.name,
        path: `Topics/${t.hubRelPath}.md`,
        depth: t.depth,
        members: t.members,
      })),
    };
    const outPath = args.out ?? path.join(path.dirname(args.db), "topic-hierarchy-report.json");
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    msg(`报告已写入: ${outPath}`);
    msg(JSON.stringify(report, null, 2));
  } finally {
    ro.close();
  }

  if (mode === "dry-run") {
    msg("dry-run 完成：未写入任何数据、未执行任何 migration。确认报告后加 --apply 才落库。");
  } else {
    msg("apply 模式：将按候选映射改写 topics.name 并重生成层级 hub（需另行复核报告后再执行）。");
  }
}

main().catch((err) => {
  msg(`执行失败: ${(err && err.message) || err}`);
  process.exitCode = 1;
});
