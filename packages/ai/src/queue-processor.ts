import { createHash } from "node:crypto";
import type { AIProvider } from "./provider.js";

/** AI 队列条目 + 关联收藏内容（由调用方 join 提供）。 */
export interface QueueItemWithContent {
  id: string;
  collectionId: string;
  title: string;
  url: string;
  author?: string;
  description?: string;
  platform?: string;
}

export type SuggestionType =
  | "suggested_tag"
  | "suggested_topic"
  | "suggested_summary"
  | "suggested_relation"
  | "suggested_group";

export interface ParsedSuggestion {
  type: SuggestionType;
  payload: string;
  confidence?: number;
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
  '{"type":"suggested_tag|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}。' +
  "suggested_tag 的 payload 为字符串数组 JSON；suggested_topic 为单个主题字符串；" +
  "suggested_summary 为 1-2 句摘要字符串；suggested_group 为收藏分组名。只输出 JSON，不要额外解释。";

/** 输入指纹：标题+链接+简介，用于结果去重与 NULL 策略（同输入不再重复调用 AI）。 */
export function inputHash(item: Pick<QueueItemWithContent, "title" | "url" | "description">): string {
  return createHash("sha256")
    .update(`${item.title ?? ""}\n${item.url}\n${item.description ?? ""}`)
    .digest("hex");
}

export function buildPrompt(item: QueueItemWithContent): string {
  return [
    `平台：${item.platform ?? "unknown"}`,
    `标题：${item.title}`,
    `作者：${item.author ?? "未知"}`,
    `链接：${item.url}`,
    item.description ? `简介：${item.description.slice(0, 500)}` : "",
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
export function buildManualPrompt(item: QueueItemWithContent, existingTags: string[] = []): string {
  return [
    "你是收藏整理助手。根据下面的收藏内容，输出 JSON 数组，元素结构：",
    '{"type":"suggested_tag|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}。',
    "suggested_tag 的 payload 为字符串数组 JSON；suggested_topic 为单个主题字符串；",
    "suggested_summary 为 1-2 句摘要字符串；suggested_group 为收藏分组名。只输出 JSON，不要额外解释。",
    "",
    `已有Tag：${existingTags.length > 0 ? existingTags.join(", ") : "无"}`,
    "--- 收藏内容 ---",
    buildPrompt(item),
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
    if (!type || !["suggested_tag", "suggested_topic", "suggested_summary", "suggested_relation", "suggested_group"].includes(type)) {
      continue;
    }
    const payload = typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload ?? "");
    const confidence = typeof r.confidence === "number" ? r.confidence : undefined;
    out.push({ type: type as SuggestionType, payload, confidence });
  }
  return out;
}

/**
 * AI 批处理队列（TDD Part 5.2 / SPEC S9，ADR-007）：
 * 单批 <=100 条；input_hash 去重（NULL 策略：同输入不重复调用）；失败隔离不中断批次。
 */
export class AiQueueProcessor {
  constructor(
    private readonly deps: AiQueueDeps,
    private readonly batchSize = 100,
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
      const hash = inputHash(item);
      try {
        if (this.deps.findSuggestionByHash(hash)) {
          this.deps.markDone(item.id);
          result.deduped += 1;
          continue;
        }
        const response = await this.deps.provider.chat(
          [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildPrompt(item) },
          ],
          { temperature: 0.3 },
        );
        const suggestions = parseSuggestions(response.text);
        for (const s of suggestions) {
          this.deps.saveSuggestion({
            collection_id: item.collectionId,
            suggestion_type: s.type,
            payload: s.payload,
            model: this.deps.provider.name,
            input_hash: hash,
            confidence: s.confidence,
          });
          result.suggestionsCreated += 1;
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
