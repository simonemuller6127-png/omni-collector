import type { CollectionDTO } from "@omni/shared-core";

/**
 * Manual 模式提示词模板（PRD 19.3）——纯函数模块，不依赖 Obsidian API，可单测。
 * 受控词表借鉴 Cubox 智能标签体系：让 AI 建议贴合用户已有 Tag/Topic/分组命名。
 */

export interface ManualVocabulary {
  tags?: string[];
  topics?: string[];
  groups?: string[];
}

/**
 * 「热门评论」段默认条数上限。Manual 路径的权威取值来自引擎 business_rules 的
 * ai_comment_context_limit（调用方经 options.commentLimit 注入）；此处只是纯函数兜底默认。
 * 评论只进 AI prompt，不落盘笔记正文（PRD 9.4）。
 */
export const DEFAULT_MANUAL_COMMENT_LIMIT = 5;
const MAX_COMMENT_CHARS = 120;

export interface ManualTemplateOptions {
  /** 热门评论进 prompt 的条数上限（business_rules ai_comment_context_limit，默认 5）。 */
  commentLimit?: number;
  /** 受控词表（可选，缺省时沿用既有行为）。 */
  vocabulary?: ManualVocabulary;
}

/**
 * 热门评论段（与 packages/ai 的 buildCommentContext 同口径，独立实现以保持本模块零运行时依赖）：
 * 按 likeCount 降序取前 limit 条，每段限长防 token 膨胀；无评论整段省略。
 */
function commentLines(
  comments: NonNullable<CollectionDTO["comments"]> | undefined,
  limit: number,
): string[] {
  if (!comments || comments.length === 0 || limit <= 0) return [];
  const top = comments
    .slice()
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, limit)
    .filter((c) => (c.content ?? "").trim().length > 0);
  if (top.length === 0) return [];
  const lines = ["热门评论（按点赞数降序，仅用于理解内容倾向）："];
  for (const c of top) {
    lines.push(
      `- ${c.likeCount ?? 0} 赞${c.author ? ` · ${c.author}` : ""}：${c.content.slice(0, MAX_COMMENT_CHARS)}`,
    );
  }
  return lines;
}

function vocabLines(vocabulary?: ManualVocabulary): string[] {
  if (!vocabulary) return [];
  const lines: string[] = ["Tag/Topic/分组建议请优先从下面受控词表中选用；确无合适再新造。"];
  if ((vocabulary.tags ?? []).length > 0) lines.push(`受控词表 · Tag：${vocabulary.tags!.join(", ")}`);
  if ((vocabulary.topics ?? []).length > 0) lines.push(`受控词表 · Topic：${vocabulary.topics!.join(", ")}`);
  if ((vocabulary.groups ?? []).length > 0) lines.push(`受控词表 · 分组：${vocabulary.groups!.join(", ")}`);
  return lines.length > 1 ? ["", ...lines] : [];
}

/** 单条模板：模板 + 受控词表 + 收藏内容（含热门评论段）。 */
export function buildManualTemplate(
  item: CollectionDTO,
  vocabulary?: ManualVocabulary,
  options?: ManualTemplateOptions,
): string {
  const commentLimit = options?.commentLimit ?? DEFAULT_MANUAL_COMMENT_LIMIT;
  return [
    "你是收藏整理助手。根据下面的收藏内容，输出 JSON 数组，元素结构：",
    '{"type":"suggested_content_tags|suggested_content_type|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}。',
    "suggested_content_tags 的 payload 为字符串数组 JSON，1~7 个内容标签（主题/领域/用途，不含视频、图文等形式词）；",
    "suggested_content_type 的 payload 为单个字符串，只能取 视频/图文/网页/模型文件 之一（只写 content_type 列，不进 Tag Atlas）；",
    "suggested_topic 为单个主题字符串；",
    "suggested_summary 为 1-2 句摘要字符串；suggested_group 为收藏分组名。只输出 JSON，不要额外解释。",
    "",
    `已有Tag：${(item.tags ?? []).length > 0 ? (item.tags ?? []).join(", ") : "无"}`,
    ...vocabLines(vocabulary),
    "--- 收藏内容 ---",
    `平台：${item.platform}`,
    `标题：${item.title}`,
    `作者：${item.author ?? "未知"}`,
    `链接：${item.url}`,
    item.description ? `简介：${item.description.slice(0, 500)}` : "",
    ...commentLines(item.comments, commentLimit),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** PRD 19.3 批量版：把 N 条收藏打包成一份带索引的模板。 */
export function buildManualBatchTemplate(
  items: CollectionDTO[],
  vocabulary?: ManualVocabulary,
  options?: ManualTemplateOptions,
): string {
  const commentLimit = options?.commentLimit ?? DEFAULT_MANUAL_COMMENT_LIMIT;
  const list = items
    .map((item, i) => {
      const head =
        `${i}. 标题：${item.title}\n   平台：${item.platform}\n   链接：${item.url}\n` +
        (item.description ? `   简介：${item.description.slice(0, 300)}\n` : "");
      // 逐条附热门评论段（缩进对齐收藏块）；无评论时该块整段省略
      const cLines = commentLines(item.comments, commentLimit);
      if (cLines.length === 0) return head;
      return head + cLines.map((l) => `   ${l}`).join("\n") + "\n";
    })
    .join("\n");
  const vocab: string[] = [];
  if (vocabulary) {
    if ((vocabulary.tags ?? []).length > 0) vocab.push(`受控词表 · Tag：${vocabulary.tags!.join(", ")}`);
    if ((vocabulary.topics ?? []).length > 0) vocab.push(`受控词表 · Topic：${vocabulary.topics!.join(", ")}`);
    if ((vocabulary.groups ?? []).length > 0) vocab.push(`受控词表 · 分组：${vocabulary.groups!.join(", ")}`);
  }
  return [
    "你是收藏整理助手。下面有 " +
      items.length +
      " 条收藏，请逐条输出 JSON 数组，元素结构：",
    '[{"index":0,"suggestions":[{"type":"suggested_content_tags|suggested_content_type|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}]}]',
    "index 必须与收藏编号一一对应（0 开始）；suggested_content_tags 的 payload 为字符串数组 JSON，1~7 个内容标签；",
    "suggested_content_type 的 payload 为单个字符串，只能取 视频/图文/网页/模型文件 之一；",
    "suggested_topic 为单个主题字符串；suggested_summary 为 1-2 句摘要；",
    "suggested_group 为收藏分组名。只输出 JSON，不要额外解释。",
    ...(vocab.length > 0 ? ["", "Tag/Topic/分组建议请优先从受控词表中选用；确无合适再新造。", ...vocab] : []),
    "",
    "--- 收藏列表 ---",
    list,
  ].join("\n");
}
