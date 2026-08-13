/**
 * Tag 工具（PRD 16 Tag Atlas）：
 * 从标题/简介提取平台话题（#xxx）、清洗展示标题、检测疑似重复标签。
 */

const HASHTAG_RE = /[#＃]([^\s#＃，。！？!?、；;：:（）()【】《》「」『』.,，]+)/g;
const MAX_TAG_LEN = 40;

/** 提取文本中的话题标签（去重、限长、忽略纯数字/URL 片段）。 */
export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(HASHTAG_RE)) {
    const tag = m[1].trim();
    if (!tag || tag.length > MAX_TAG_LEN || /^\d+$/.test(tag) || tag.startsWith("/")) continue;
    out.add(tag);
  }
  return [...out];
}

/** 展示用标题：移除话题 token，避免 Obsidian 把标题里的 # 当成内联标签。 */
export function cleanTitleForDisplay(title: string): string {
  return (title ?? "").replace(HASHTAG_RE, "").replace(/\s+/g, " ").trim();
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\u3000_\-—–.,，。:：;；'"“”‘’()（）]/g, "");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

export interface DuplicateTagPair {
  a: string;
  b: string;
  score: number;
  reason: "contain" | "edit";
}

/**
 * 疑似重复标签（供 Tag Atlas 管理面板人工合并）：
 * 前缀/包含 + 长度差 ≤3，或编辑距离相似度 ≥0.8。
 */
export function findNearDuplicateTags(tags: string[], limit = 50): DuplicateTagPair[] {
  const normalized = tags.map((t) => ({ raw: t, key: norm(t) }));
  const out: DuplicateTagPair[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const a = normalized[i];
      const b = normalized[j];
      if (!a.key || !b.key || a.key === b.key) continue;
      const shorter = a.key.length <= b.key.length ? a : b;
      const longer = shorter === a ? b : a;
      let score = 0;
      let reason: DuplicateTagPair["reason"] = "edit";
      if (shorter.key.length >= 2 && (longer.key.startsWith(shorter.key) || longer.key.includes(shorter.key))) {
        const diff = longer.key.length - shorter.key.length;
        if (diff <= 3) {
          score = shorter.key.length / longer.key.length;
          reason = "contain";
        }
      }
      if (score < 0.8) {
        const maxLen = Math.max(a.key.length, b.key.length);
        const sim = maxLen === 0 ? 0 : 1 - levenshtein(a.key, b.key) / maxLen;
        if (sim >= 0.8) {
          score = sim;
          reason = "edit";
        }
      }
      if (score > 0) {
        out.push({ a: a.raw, b: b.raw, score, reason });
      }
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, limit);
}
