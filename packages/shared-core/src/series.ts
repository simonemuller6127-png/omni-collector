/** 系列视频识别（TDD Part 24，PRD 24 权重）。 */

export interface SeriesCandidate {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  tags?: string[];
  description?: string;
  publishedAt?: string;
}

export interface SeriesMatch {
  itemId: string;
  matchedWith: string;
  score: number;
  reasons: string[];
}

const SERIES_KEYWORDS = ["第", "期", "续集", "part", "episode", "ep.", "ep", "系列", "合集"];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function titleSimilarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  const common = [...na].filter((ch) => nb.includes(ch)).length;
  return common / Math.max(na.length, nb.length);
}

function extractSeriesNumber(title: string): string | null {
  const m = /(?:第\s*)?(\d{1,3})\s*(?:[期集话]|期|集)/.exec(title);
  return m?.[1] ?? null;
}

/**
 * 打分（PRD 24 权重）：
 * 标题相似 ★★★★★、作者一致 ★★★★★（必要条件）、封面 ★★★★、标签 ★★★、
 * 描述关联词 ★★、发布时间连续 ★。
 */
export function scoreSeriesPair(a: SeriesCandidate, b: SeriesCandidate): SeriesMatch | null {
  if (a.id === b.id) return null;
  const reasons: string[] = [];
  let score = 0;
  if (a.author && b.author && a.author === b.author) {
    score += 5;
    reasons.push("作者一致");
  } else {
    return null; // 作者一致性为必要条件
  }
  const sim = titleSimilarity(a.title, b.title);
  if (sim >= 0.6) {
    score += Math.round(sim * 5);
    reasons.push(`标题相似 ${Math.round(sim * 100)}%`);
  }
  const an = extractSeriesNumber(a.title);
  const bn = extractSeriesNumber(b.title);
  if (an && bn && an !== bn) {
    score += 3;
    reasons.push("系列编号");
  }
  if (a.coverUrl && a.coverUrl === b.coverUrl) {
    score += 4;
    reasons.push("封面一致");
  }
  const aTags = new Set((a.tags ?? []).map(norm));
  const bTags = new Set((b.tags ?? []).map(norm));
  const overlap = [...aTags].filter((t) => bTags.has(t)).length;
  if (overlap > 0) {
    score += Math.min(overlap, 3);
    reasons.push(`标签重叠 ${overlap}`);
  }
  const desc = `${a.description ?? ""} ${b.description ?? ""}`.toLowerCase();
  if (SERIES_KEYWORDS.some((k) => desc.includes(k.toLowerCase()))) {
    score += 2;
    reasons.push("描述含系列词");
  }
  if (score < 8) return null;
  return { itemId: a.id, matchedWith: b.id, score, reasons };
}

/** 对候选列表做两两匹配，返回每组最高分匹配。 */
export function findSeriesMatches(items: SeriesCandidate[]): SeriesMatch[] {
  const matches: SeriesMatch[] = [];
  for (const a of items) {
    let best: SeriesMatch | null = null;
    for (const b of items) {
      const m = scoreSeriesPair(a, b);
      if (m && (!best || m.score > best.score)) best = m;
    }
    if (best) matches.push(best);
  }
  return matches;
}
