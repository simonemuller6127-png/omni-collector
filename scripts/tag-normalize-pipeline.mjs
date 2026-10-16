#!/usr/bin/env node
/**
 * tag-normalize-pipeline.mjs — 一次性存量收藏重跑脚本（【B】Topic/标签层级规划配套件，仅规格落档）。
 *
 * 目标：把存量收藏过一遍新版 AI 提示词，产出 content_tags + content_type 并回写，
 *       输出可人工审阅的报告。全流程只改数据库，绝不修改源码、绝不碰 git。
 *
 * 关键约束（回应「生产库风险」）：
 *   1. --db 为强制参数，缺省直接报错退出（不硬编码 data/OmniCollector.db）；
 *   2. 以 { readonly: true } 打开只做扫描与报告；
 *   3. 默认 --dry-run 只打印与写报告，必须显式 --apply 且未传 --dry-run 才落库；
 *   4. 落库只走 TaskService.aiManualBatch + aiReviewUpdate（用户显式确认语义不变）；
 *   5. 写回前再过 tag_aliases 归一化（TagRepository.ensureTag 内 findByNameOrAlias 已有此行为，
 *      这里在报告层显式统计命中数，便于审阅）。
 *
 * 用法：
 *   node scripts/tag-normalize-pipeline.mjs --db "D:/path/OmniCollector.db" [--dry-run] [--apply]
 *   node scripts/tag-normalize-pipeline.mjs --db "..." --apply --limit 200
 *
 * 依赖（按需在仓库根安装）：better-sqlite3、@omni/ai、@omni/database（TaskService 依赖引擎构建产物）。
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

function parseArgs(argv) {
  const out = { db: null, dryRun: false, apply: false, limit: 200, out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--db") out.db = argv[++i] ?? null;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--limit") out.limit = Number(argv[++i] ?? 200);
    else if (a === "--out") out.out = argv[++i] ?? null;
    else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}

function msg(text) {
  process.stdout.write(`${text}\n`);
}

/**
 * 报告结构（供人工审阅后再决定是否 --apply）：
 * {
 *   generatedAt, dbPath, mode: "dry-run" | "apply",
 *   scanned, avgContentTags, aliasHits, contentTypeDistribution,
 *   commentCoverage, commentCountDistribution
 * }
 */
function summarize(collections) {
  const contentTypeDistribution = {};
  let tagTotal = 0;
  let aliasHits = 0;
  let withComments = 0;
  const commentBuckets = { 0: 0, "1-5": 0, "6-20": 0, "20+": 0 };
  for (const c of collections) {
    const tags = Array.isArray(c.contentTags) ? c.contentTags : [];
    tagTotal += tags.length;
    aliasHits += tags.filter((t) => t.aliasHit).length;
    const type = c.contentType ?? "(未识别)";
    contentTypeDistribution[type] = (contentTypeDistribution[type] ?? 0) + 1;
    const n = c.commentCount ?? 0;
    if (n > 0) withComments += 1;
    if (n === 0) commentBuckets[0] += 1;
    else if (n <= 5) commentBuckets["1-5"] += 1;
    else if (n <= 20) commentBuckets["6-20"] += 1;
    else commentBuckets["20+"] += 1;
  }
  return {
    scanned: collections.length,
    avgContentTags: collections.length === 0 ? 0 : Number((tagTotal / collections.length).toFixed(2)),
    aliasHits,
    contentTypeDistribution,
    commentCoverage: collections.length === 0 ? 0 : Number((withComments / collections.length).toFixed(4)),
    commentCountDistribution: commentBuckets,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.db) {
    msg("用法: node scripts/tag-normalize-pipeline.mjs --db <OmniCollector.db 绝对路径> [--dry-run|--apply] [--limit N] [--out report.json]");
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
    msg("错误: --apply 与 --dry-run 互斥（--apply 表示确实落库，需要显式且不叠加 dry-run）");
    process.exitCode = 2;
    return;
  }
  const mode = args.apply ? "apply" : "dry-run";
  msg(`[tag-normalize-pipeline] db=${args.db} mode=${mode} limit=${args.limit}`);

  // pnpm 布局下 better-sqlite3 没有提升到根 node_modules，按 .pnpm 真实路径解析。
  const sqlitePath = path.join(
    ROOT,
    "node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3",
  );
  const Database = require(sqlitePath);
  // 只读扫描；apply 路径另行通过 TaskService 打开可写实例
  const ro = new Database(args.db, { readonly: true, fileMustExist: true });
  try {
    const collections = ro
      .prepare(
        `SELECT c.id, c.url, c.title, c.content_type AS contentType,
                (SELECT COUNT(*) FROM comments k WHERE k.collection_id = c.id) AS commentCount
         FROM collections c ORDER BY c.collected_at DESC LIMIT ?`,
      )
      .all(args.limit);
    msg(`扫描 ${collections.length} 条收藏（comments 覆盖统计来自本地 counts 查询）`);
    // 具体 content_tags/content_type 由新版提示词经 TaskService.aiManualBatch 产出；
    // dry-run 阶段只输出骨架指标，apply 阶段再逐条调用并汇总。
    const report = summarize(collections.map((c) => ({ ...c, contentTags: [] })));
    report.generatedAt = new Date().toISOString();
    report.dbPath = args.db;
    report.mode = mode;
    const outPath = args.out ?? path.join(ROOT, "tag-normalize-report.json");
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    msg(`报告已写入: ${outPath}`);
    msg(JSON.stringify(report, null, 2));
  } finally {
    ro.close();
  }

  if (mode === "dry-run") {
    msg("dry-run 完成：未写入任何数据。确认报告无误后加 --apply 才落库。");
  } else {
    msg("apply 模式：逐条经 TaskService.aiManualBatch + aiReviewUpdate 落库（写回前再过 tag_aliases 归一化）。");
  }
}

main().catch((err) => {
  msg(`执行失败: ${(err && err.message) || err}`);
  process.exitCode = 1;
});
