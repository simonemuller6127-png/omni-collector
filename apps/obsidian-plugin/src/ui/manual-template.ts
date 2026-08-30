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

function vocabLines(vocabulary?: ManualVocabulary): string[] {
  if (!vocabulary) return [];
  const lines: string[] = ["Tag/Topic/分组建议请优先从下面受控词表中选用；确无合适再新造。"];
  if ((vocabulary.tags ?? []).length > 0) lines.push(`受控词表 · Tag：${vocabulary.tags!.join(", ")}`);
  if ((vocabulary.topics ?? []).length > 0) lines.push(`受控词表 · Topic：${vocabulary.topics!.join(", ")}`);
  if ((vocabulary.groups ?? []).length > 0) lines.push(`受控词表 · 分组：${vocabulary.groups!.join(", ")}`);
  return lines.length > 1 ? ["", ...lines] : [];
}

/** 单条模板：模板 + 受控词表 + 收藏内容。 */
export function buildManualTemplate(item: CollectionDTO, vocabulary?: ManualVocabulary): string {
  return [
    "你是收藏整理助手。根据下面的收藏内容，输出 JSON 数组，元素结构：",
    '{"type":"suggested_tag|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}。',
    "suggested_tag 的 payload 为字符串数组 JSON；suggested_topic 为单个主题字符串；",
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
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** PRD 19.3 批量版：把 N 条收藏打包成一份带索引的模板。 */
export function buildManualBatchTemplate(items: CollectionDTO[], vocabulary?: ManualVocabulary): string {
  const list = items
    .map(
      (item, i) =>
        `${i}. 标题：${item.title}\n   平台：${item.platform}\n   链接：${item.url}\n` +
        (item.description ? `   简介：${item.description.slice(0, 300)}\n` : ""),
    )
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
    '[{"index":0,"suggestions":[{"type":"suggested_tag|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}]}]',
    "index 必须与收藏编号一一对应（0 开始）；suggested_tag 的 payload 为字符串数组 JSON；",
    "suggested_topic 为单个主题字符串；suggested_summary 为 1-2 句摘要；",
    "suggested_group 为收藏分组名。只输出 JSON，不要额外解释。",
    ...(vocab.length > 0 ? ["", "Tag/Topic/分组建议请优先从受控词表中选用；确无合适再新造。", ...vocab] : []),
    "",
    "--- 收藏列表 ---",
    list,
  ].join("\n");
}
