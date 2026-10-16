import { createHash } from "node:crypto";
import type { AIProvider } from "./provider.js";

/** 热门评论（评论只进 AI 输入与指纹，不落盘笔记正文，PRD 9.4）。 */
export interface QueueItemComment {
  content: string;
  like_count: number;
  author?: string;
}

/** AI 队列条目 + 关联收藏内容（由调用方 join 提供）。 */
export interface QueueItemWithContent {
  id: string;
  collectionId: string;
  title: string;
  url: string;
  author?: string;
  description?: string;
  platform?: string;
  /** 按 like_count 降序取前 N 条；调用方负责截断（N 来自 business_rules）。 */
  comments?: QueueItemComment[];
}

export type SuggestionType =
  | "suggested_tag"
  | "suggested_content_tags"
  | "suggested_content_type"
  | "suggested_topic"
  | "suggested_summary"
  | "suggested_relation"
  | "suggested_group";

/** 形式标签枚举（只写 collections.content_type，永不进 tags 表）。 */
export const CONTENT_TYPES = ["视频", "图文", "网页", "模型文件"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** 提示词里「热门评论」段的默认条数上限（真实取值由调用方从 business_rules 注入）。 */
export const DEFAULT_COMMENT_CONTEXT_LIMIT = 5;
const MAX_COMMENT_CHARS = 120;

export interface ParsedSuggestion {
  type: SuggestionType;
  payload: string;
  confidence?: number;
}

export interface BatchReplyEntry {
  index: number;
  suggestions: ParsedSuggestion[];
}

export interface AiQueueDeps {
  provider: AIProvider;
  nextBatch(limit: number): QueueItemWithContent[];
  markProcessing(id: string): void;
  markDone(id: string): void;
  markFailed(id: string, error: string): void;
  findSuggestionByHash(inputHash: string): unknown;
  saveSuggestion(s: {
    collection_id: string;
    suggestion_type: string;
    payload?: string;
    model?: string;
    input_hash?: string;
    confidence?: number;
  }): unknown;
}

export interface AiQueueRunResult {
  processed: number;
  deduped: number;
  suggestionsCreated: number;
  failed: number;
  batchSize: number;
}

const SYSTEM_PROMPT =
  "你是收藏整理助手。根据用户收藏的内容，输出 JSON 数组，元素结构：" +
  '{"type":"suggested_content_tags|suggested_content_type|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}。' +
  "只输出 JSON，不要额外解释。\n" +
  "内容标签（suggested_content_tags）：payload 为字符串数组 JSON，1~7 个「这条内容是什么」的实质标签" +
  "（主题/领域/学科/用途，如 前端、烘焙入门、F1赛车、三维建模），不要出现视频、图文、网页这类形式词。\n" +
  "形式标签（suggested_content_type）：payload 为单个字符串，只能从 视频/图文/网页/模型文件 里选一个，表示内容载体形态。\n" +
  "suggested_topic 为单个主题字符串；suggested_summary 为 1-2 句摘要字符串；suggested_group 为收藏分组名。";

/** 输入指纹：标题+链接+简介+热门评论指纹，用于结果去重与 NULL 策略（同输入不再重复调用 AI）。 */
export function inputHash(
  item: Pick<QueueItemWithContent, "title" | "url" | "description" | "comments">,
  commentLimit: number = DEFAULT_COMMENT_CONTEXT_LIMIT,
): string {
  const comments = (item.comments ?? [])
    .slice()
    .sort((a, b) => b.like_count - a.like_count)
    .slice(0, Math.max(0, commentLimit))
    .map((c) => `${c.like_count}\n${c.content}`)
    .join("\n---\n");
  return createHash("sha256")
    .update(
      `${item.title ?? ""}\n${item.url}\n${item.description ?? ""}\n#comments\n${comments}`,
    )
    .digest("hex");
}

/** 热门评论段：点赞 + 作者 + 内容；无评论或超出上限被截断时整段省略/按上限截断。 */
export function buildCommentContext(comments: QueueItemComment[] | undefined, limit: number): string[] {
  if (!comments || comments.length === 0 || limit <= 0) return [];
  const top = comments
    .slice()
    .sort((a, b) => b.like_count - a.like_count)
    .slice(0, limit);
  const lines = ["热门评论（按点赞数降序，仅用于理解内容倾向）："];
  for (const c of top) {
    lines.push(`- ${c.like_count} 赞${c.author ? ` · ${c.author}` : ""}：${c.content.slice(0, MAX_COMMENT_CHARS)}`);
  }
  return lines;
}

export function buildPrompt(
  item: QueueItemWithContent,
  commentLimit: number = DEFAULT_COMMENT_CONTEXT_LIMIT,
): string {
  return [
    `平台：${item.platform ?? "unknown"}`,
    `标题：${item.title}`,
    `作者：${item.author ?? "未知"}`,
    `链接：${item.url}`,
    item.description ? `简介：${item.description.slice(0, 500)}` : "",
    ...buildCommentContext(item.comments, commentLimit),
  ]
    .filter(Boolean)
    .join("\n");
}

/** 解析 suggested_tag 的 payload：JSON 数组 / 逗号分隔 / 单个标签。 */
export function parseTagPayload(payload: string): string[] {
  const trimmed = (payload ?? "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
      if (typeof parsed === "string") {
        return [parsed.trim()].filter(Boolean);
      }
      if (parsed && Array.isArray(parsed.tags)) {
        return parsed.tags.map((v: unknown) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // 落入逗号分隔兜底
    }
  }
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
    return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // 落入逗号分隔兜底
    }
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Manual 模式提示词模板（PRD 19.3）：用户复制到任意 AI 工具，粘贴回复后回填。 */
export function buildManualPrompt(
  item: QueueItemWithContent,
  existingTags: string[] = [],
  commentLimit: number = DEFAULT_COMMENT_CONTEXT_LIMIT,
): string {
  return [
    "你是收藏整理助手。根据下面的收藏内容，输出 JSON 数组，元素结构：",
    '{"type":"suggested_content_tags|suggested_content_type|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}。',
    "suggested_content_tags 的 payload 为字符串数组 JSON，1~7 个内容标签（主题/领域/用途，不含视频、图文等形式词）；",
    "suggested_content_type 的 payload 为单个字符串，只能取 视频/图文/网页/模型文件 之一；",
    "suggested_topic 为单个主题字符串；suggested_summary 为 1-2 句摘要字符串；suggested_group 为收藏分组名。只输出 JSON，不要额外解释。",
    "",
    `已有Tag：${existingTags.length > 0 ? existingTags.join(", ") : "无"}`,
    "--- 收藏内容 ---",
    buildPrompt(item, commentLimit),
  ].join("\n");
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const arrMatch = /\[\s*\{[\s\S]*\}\s*\]/.exec(candidate);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 解析 LLM 输出为建议列表；无法解析时返回空（调用方将其视为一次空结果）。 */
export function parseSuggestions(text: string): ParsedSuggestion[] {
  const json = extractJson(text);
  const items = Array.isArray(json) ? json : [json];
  const out: ParsedSuggestion[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const type = r.type as string | undefined;
    if (
      !type ||
      ![
        "suggested_tag",
        "suggested_content_tags",
        "suggested_content_type",
        "suggested_topic",
        "suggested_summary",
        "suggested_relation",
        "suggested_group",
      ].includes(type)
    ) {
      continue;
    }
    const payload = typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload ?? "");
    const confidence = typeof r.confidence === "number" ? r.confidence : undefined;
    out.push({ type: type as SuggestionType, payload, confidence });
  }
  return out;
}

/** 解析 Manual 批量回复：按索引对应收藏，逐条拆出建议（PRD 19.3 批量版）。 */
export function parseBatchSuggestions(text: string): BatchReplyEntry[] {
  const json = extractJson(text);
  if (!Array.isArray(json)) return [];
  const out: BatchReplyEntry[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const index = Number(r.index);
    if (!Number.isInteger(index) || index < 0) continue;
    const rawSuggestions = Array.isArray(r.suggestions) ? r.suggestions : [];
    const suggestions = parseSuggestions(JSON.stringify(rawSuggestions));
    if (suggestions.length > 0) {
      out.push({ index, suggestions });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * AI 批处理队列（TDD Part 5.2 / SPEC S9，ADR-007）：
 * 单批 <=100 条；input_hash 去重（NULL 策略：同输入不重复调用）；失败隔离不中断批次。
 */
export class AiQueueProcessor {
  /**
   * @param commentContextLimit 热门评论进提示词/指纹的条数上限，调用方从
   * business_rules 的 ai_comment_context_limit 注入（函数保持纯函数不收 db）。
   */
  constructor(
    private readonly deps: AiQueueDeps,
    private readonly batchSize = 100,
    private readonly commentContextLimit: number = DEFAULT_COMMENT_CONTEXT_LIMIT,
  ) {}

  async run(): Promise<AiQueueRunResult> {
    const batch = this.deps.nextBatch(this.batchSize);
    const result: AiQueueRunResult = {
      processed: batch.length,
      deduped: 0,
      suggestionsCreated: 0,
      failed: 0,
      batchSize: this.batchSize,
    };
    for (const item of batch) {
      this.deps.markProcessing(item.id);
      const hash = inputHash(item, this.commentContextLimit);
      try {
        if (this.deps.findSuggestionByHash(hash)) {
          this.deps.markDone(item.id);
          result.deduped += 1;
          continue;
        }
        const response = await this.deps.provider.chat(
          [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildPrompt(item, this.commentContextLimit) },
          ],
          { temperature: 0.3 },
        );
        const suggestions = parseSuggestions(response.text);
        for (const s of suggestions) {
          const saved = this.deps.saveSuggestion({
            collection_id: item.collectionId,
            suggestion_type: s.type,
            payload: s.payload,
            model: this.deps.provider.name,
            input_hash: hash,
            confidence: s.confidence,
          });
          if (saved) result.suggestionsCreated += 1;
        }
        this.deps.markDone(item.id);
      } catch (err) {
        this.deps.markFailed(item.id, (err as Error).message);
        result.failed += 1;
      }
    }
    return result;
  }
}
