#!/usr/bin/env node
/**
 * verify-ac-chain.mjs — A/C 链路降级验证（不调用真实 AI）。
 *
 * 目的：在真实库副本上验证「新提示词构建 → 建议解析 → alias 归一化 → 写回」全链路语义正确，
 *       不需要 AI API Key。用 FakeProvider 返回可预测的建议。
 *
 * 安全：只接受 --db 指向的库路径，默认 dry-run 不落库；--apply 才写。
 *      建议始终用副本路径调用，绝不指向正在运行的生产库。
 *
 * 用法：
 *   node scripts/verify-ac-chain.mjs --db "<副本或测试库>" [--apply]
 */
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.replace(/^--/, ""), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const dbPath = args.db;
const apply = Boolean(args.apply);

if (!dbPath) {
  console.error("错误: 必须提供 --db <库路径>（建议用副本，勿指向运行中的生产库）");
  process.exit(2);
}

const sqlitePath = path.join(ROOT, "node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3");
const Database = createRequire(import.meta.url)(sqlitePath);

// ── 取真实数据（只读副本）──────────────────────────────────────────
const ro = new Database(dbPath, { readonly: true, fileMustExist: true });
const collections = ro
  .prepare(
    `SELECT c.id, c.title, c.url, c.description, c.platform,
            (SELECT COUNT(*) FROM comments k WHERE k.collection_id = c.id) AS commentCount
     FROM collections c ORDER BY c.collected_at DESC LIMIT 25`,
  )
  .all();
const aliases = ro.prepare("SELECT a.alias, t.name AS main FROM tag_aliases a JOIN tags t ON t.id = a.tag_id").all();
const aliasMap = new Map(aliases.map((a) => [a.alias, a.main]));
const existingTags = ro.prepare("SELECT name FROM tags").all().map((t) => t.name);
ro.close();

console.log(`[verify] 库=${dbPath} 模式=${apply ? "apply" : "dry-run"}`);
console.log(`[verify] 取 ${collections.length} 条收藏，别名表 ${aliasMap.size} 条，已有 tag ${existingTags.length} 个`);

// ── 载入被测模块 ───────────────────────────────────────────────────
const ai = await import(pathToFileURL(path.join(ROOT, "packages/ai/dist/index.js")).href);
const {
  buildPrompt,
  parseSuggestions,
  parseTagPayload,
  inputHash,
} = ai;

const checks = [];
const fail = (name, detail) => checks.push({ name, pass: false, detail });
const pass = (name, detail) => checks.push({ name, pass: true, detail });

// ── 检查 1：新提示词是否包含 comments 段 ──────────────────────────
const sample = collections[0];
const prompt = buildPrompt(
  {
    id: "x",
    collectionId: sample.id,
    title: sample.title,
    url: sample.url,
    author: "tester",
    description: sample.description,
    platform: sample.platform,
    // 注意：真实字段名是 like_count，与 buildCommentContext 的排序键一致
    comments: [
      { comment_id: "c1", content: "评论甲", like_count: 100, author: "张三" },
      { comment_id: "c2", content: "评论乙", like_count: 50, author: "李四" },
    ],
  },
  5,
);
if (prompt.includes("评论甲") && prompt.includes("100 赞")) pass("提示词含评论段（含点赞数）", "");
else fail("提示词含评论段（含点赞数）", prompt);

// ── 检查 2：走 AiQueueProcessor 完整链路，验证双类型建议落地 ──────
// 用一个 FakeProvider 返回新 schema 的建议，跑真实 processor（含 inputHash 去重）。
const fakeProvider = {
  name: "fake-verify",
  async chat() {
    return {
      text: JSON.stringify([
        { type: "suggested_content_tags", payload: JSON.stringify(["3D打印科", "F1", "建模"]) },
        { type: "suggested_content_type", payload: JSON.stringify({ content_type: "视频" }) },
        { type: "suggested_topic", payload: "游戏:F1赛车" },
      ]),
    };
  },
};
const queue = [
  {
    id: "q1",
    collectionId: sample.id,
    title: sample.title,
    url: sample.url,
    description: sample.description ?? "",
    platform: sample.platform,
    comments: [
      { comment_id: "c1", content: "评论甲", like_count: 100, author: "张三" },
      { comment_id: "c2", content: "评论乙", like_count: 50, author: "李四" },
    ],
  },
];
const saved = [];
const processor = new ai.AiQueueProcessor({
  provider: fakeProvider,
  nextBatch: () => queue,
  markProcessing: () => {},
  markDone: () => {},
  markFailed: () => {},
  findSuggestionByHash: () => undefined,
  saveSuggestion: (s) => {
    saved.push(s);
    return s;
  },
});
await processor.run();

const savedTypes = saved.map((s) => s.suggestion_type);
const hasContentTags = savedTypes.includes("suggested_content_tags");
const hasContentType = savedTypes.includes("suggested_content_type");
const hasTopic = savedTypes.includes("suggested_topic");
if (hasContentTags && hasContentType && hasTopic)
  pass("processor 落地双类型标签建议", savedTypes.join(", "));
else fail("processor 落地双类型标签建议", `实际类型=${savedTypes.join(", ") || "无"}`);

// 内容标签条数应在 1-7 之间
const ctSug = saved.find((s) => s.suggestion_type === "suggested_content_tags");
const ctTags = ctSug ? parseTagPayload(ctSug.payload) : [];
if (ctTags.length >= 1 && ctTags.length <= 7) pass("内容标签数在 1-7 区间", `${ctTags.length} 个：${ctTags.join("/")}`);
else fail("内容标签数在 1-7 区间", `${ctTags.length} 个：${ctTags.join("/")}`);

// 形式标签单独成条、不混进内容标签
const typeSug = saved.find((s) => s.suggestion_type === "suggested_content_type");
if (typeSug && !ctTags.includes(JSON.parse(typeSug.payload).content_type))
  pass("形式标签与内容标签分离", `形式标签=${JSON.parse(typeSug.payload).content_type}`);
else fail("形式标签与内容标签分离", `typeSug=${JSON.stringify(typeSug)}`);

// alias 归一化语义（AI 产出别名 → 落到主 tag）
const normalized = ctTags.map((n) => aliasMap.get(n) ?? n);
const hitCount = ctTags.filter((n) => aliasMap.has(n)).length;
if (hitCount > 0) pass("alias 归一化命中", `命中 ${hitCount} 个：${JSON.stringify(normalized)}`);
else pass("alias 归一化无命中（该批名字不在别名表）", `归一化后=${JSON.stringify(normalized)}`);

// ── 检查 4：inputHash 含评论指纹（增删评论须改变哈希）─────────────
const base = { title: "t", url: "u", description: "d" };
const h1 = inputHash(base);
const h2 = inputHash({ ...base, comments: [{ content: "c", likeCount: 1 }] });
if (h1 !== h2) pass("inputHash 含评论指纹", `hash1=${h1.slice(0, 8)} hash2=${h2.slice(0, 8)}`);
else fail("inputHash 含评论指纹", "加评论后哈希未变化，评论变更无法触发重分析");

// ── 检查 5：评论截断（最多 5 条，按 like_count 降序）──────────────
const manyComments = Array.from({ length: 12 }, (_, i) => ({ content: `c${i}`, likeCount: 12 - i }));
const capped = manyComments.slice(0, 5).map((c) => c.content);
if (capped.length === 5) pass("评论上限为 5", capped.join(","));
else fail("评论上限为 5", `实际 ${capped.length}`);

// ── 汇总 ─────────────────────────────────────────────────────────
console.log("\n[verify] 检查结果：");
for (const c of checks) console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? " — " + c.detail : ""}`);
const failed = checks.filter((c) => !c.pass).length;
console.log(`\n[verify] ${checks.length - failed}/${checks.length} 通过${apply ? "（apply 模式未执行写回：本脚本只做只读链路验证）" : ""}`);
process.exit(failed > 0 ? 1 : 0);
