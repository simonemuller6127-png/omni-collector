/**
 * 本地语义关联（PRD 2.0「Related Collections」轻量实现，ADR：本地优先）：
 * TF-IDF + 余弦相似度，中文按字符 bigram 切分，英文按词切分，Tag 词加权。
 * 纯本地计算，不调用任何 API、不上传任何内容；由规则 semantic_related_enabled 控制开关。
 */

export interface SemanticDoc {
  id: string;
  title: string;
  author?: string | null;
  description?: string | null;
  tags?: string[];
}

export interface SemanticHit {
  id: string;
  score: number;
}

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/** 混合分词：ASCII 词 + CJK 连续段的字符 bigram（+单字兜底）。 */
export function tokenizeSemantic(text: string): string[] {
  const lower = String(text ?? "").toLowerCase();
  const tokens: string[] = [];
  for (const word of lower.match(/[a-z0-9]+/g) ?? []) {
    if (word.length >= 2) tokens.push(word);
  }
  // CJK：按连续段切 bigram
  let run = "";
  const flush = (): void => {
    if (run.length === 1) tokens.push(run);
    for (let i = 0; i + 1 < run.length; i += 1) tokens.push(run.slice(i, i + 2));
    run = "";
  };
  for (const ch of lower) {
    if (CJK_RE.test(ch)) run += ch;
    else flush();
  }
  flush();
  return tokens;
}

function termVector(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

export interface SemanticIndex {
  idf: Map<string, number>;
  vectors: Map<string, Map<string, number>>;
}

/**
 * 构建全量 TF-IDF 索引：
 * 标题/简介权重 1，Tag 词重复 3 次（平台/手动标签是强主题信号）。
 */
export function buildSemanticIndex(docs: SemanticDoc[]): SemanticIndex {
  const docsTokens = docs.map((d) => [
    ...tokenizeSemantic(`${d.title ?? ""} ${d.description ?? ""}`),
    ...tokenizeSemantic((d.tags ?? []).join(" ")),
    ...tokenizeSemantic((d.tags ?? []).join(" ")),
    ...tokenizeSemantic((d.tags ?? []).join(" ")),
  ]);
  const df = new Map<string, number>();
  for (const tokens of docsTokens) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = Math.max(1, docs.length);
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  const vectors = new Map<string, Map<string, number>>();
  for (let i = 0; i < docs.length; i += 1) {
    const vec = new Map<string, number>();
    let norm = 0;
    for (const [term, tf] of termVector(docsTokens[i])) {
      const w = tf * (idf.get(term) ?? 1);
      if (w > 0) {
        vec.set(term, w);
        norm += w * w;
      }
    }
    norm = Math.sqrt(norm) || 1;
    for (const [term, w] of vec) vec.set(term, w / norm);
    vectors.set(docs[i].id, vec);
  }
  return { idf, vectors };
}

/** 与目标文档最相似的前 N 条（不含自身），score∈(0,1]。 */
export function semanticRelated(index: SemanticIndex, targetId: string, topN = 5): SemanticHit[] {
  const base = index.vectors.get(targetId);
  if (!base) return [];
  const hits: SemanticHit[] = [];
  for (const [id, vec] of index.vectors) {
    if (id === targetId) continue;
    let dot = 0;
    const [small, large] = base.size <= vec.size ? [base, vec] : [vec, base];
    for (const [term, w] of small) {
      const other = large.get(term);
      if (other) dot += w * other;
    }
    if (dot > 0.02) hits.push({ id, score: Math.round(dot * 1000) / 1000 });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, topN);
}
