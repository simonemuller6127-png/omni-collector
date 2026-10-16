/**
 * AI 审核视图的纯数据层（不依赖 Obsidian API，可单测——manual-template.ts 同约定）：
 * 类型标签映射与 payload 渲染判断。
 */

export interface AiSuggestionLike {
  suggestion_type: string;
  payload?: string;
}

export const TYPE_LABELS: Record<string, string> = {
  suggested_tag: "标签建议",
  suggested_content_tags: "内容标签建议",
  suggested_content_type: "形式标签建议",
  suggested_topic: "Topic 建议",
  suggested_summary: "摘要建议",
  suggested_group: "分组建议",
  suggested_relation: "关联建议",
};

export type PayloadRender =
  | { kind: "chips"; tags: string[] }
  | { kind: "content-type"; value: string }
  | { kind: "group"; name: string; count: number }
  | { kind: "text"; text: string };

/** 形式标签合法取值（与 packages/ai 的 CONTENT_TYPES 保持一致，未知值也照原样展示）。 */
export const CONTENT_TYPE_VALUES = ["视频", "图文", "网页", "模型文件"] as const;

/**
 * 解析标签 payload：JSON 数组 / 逗号分隔 / 单个。
 * 与 packages/ai 的 parseTagPayload 同口径，但独立实现以保持本模块零运行时依赖、可单测。
 */
export function parseTagList(payload: string): string[] {
  const trimmed = (payload ?? "").trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    if (typeof parsed === "string") return [parsed.trim()].filter(Boolean);
    if (parsed && Array.isArray((parsed as { tags?: unknown[] }).tags)) {
      return (parsed as { tags: unknown[] }).tags.map((v) => String(v).trim()).filter(Boolean);
    }
  } catch {
    // 逗号分隔兜底
  }
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * 把一条建议渲染成什么形态：
 * - suggested_content_tags：#chip 列表（与 suggested_tag 视觉一致，仍写 tags 表）
 * - suggested_content_type：「形式：视频」徽标（只写 content_type 列，不进 Tag Atlas）
 */
export function describePayload(suggestion: AiSuggestionLike): PayloadRender {
  const payload = suggestion.payload ?? "";
  if (suggestion.suggestion_type === "suggested_tag" || suggestion.suggestion_type === "suggested_content_tags") {
    return { kind: "chips", tags: parseTagList(payload) };
  }
  if (suggestion.suggestion_type === "suggested_content_type") {
    return { kind: "content-type", value: payload.trim() };
  }
  if (suggestion.suggestion_type === "suggested_group") {
    try {
      const data = JSON.parse(payload) as { name?: string; collection_ids?: unknown[] };
      return { kind: "group", name: data.name ?? "未命名", count: data.collection_ids?.length ?? 0 };
    } catch {
      // 落到普通文本
    }
  }
  return { kind: "text", text: payload };
}
