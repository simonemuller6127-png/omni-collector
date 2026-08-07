import { createHash } from "node:crypto";
import {
  AIRepository,
  CollectionRepository,
  ContentGroupRepository,
  type CollectionRow,
} from "@omni/database";
import { scoreSeriesPair, type SeriesCandidate } from "@omni/shared-core";

export interface GroupCandidate {
  name: string;
  collectionIds: string[];
  reason: "entity" | "series";
}

export function normalizeEntity(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** 去除「第 N 集/期」后缀，用于系列命名。 */
export function seriesBaseName(title: string): string {
  return title.replace(/(?:第\s*\d+\s*[期集話话])|(?:[ep]\d+)|(?:part\s*\d+)/gi, "").trim() || title;
}

function toSeriesCandidate(c: CollectionRow): SeriesCandidate {
  return {
    id: c.id,
    title: c.title ?? "",
    author: c.author ?? "",
    coverUrl: c.cover_url ?? undefined,
    description: c.description ?? undefined,
    publishedAt: c.platform_created_at ?? undefined,
  };
}

/**
 * 关联识别（Phase 6）：
 * 1) 同实体跨平台：归一化标题 + 作者一致；
 * 2) 系列：同作者 + 标题相似/集数（scoreSeriesPair >= 8），用并查集聚类。
 * 返回候选分组（>=2 条收藏）。
 */
export function findGroupCandidates(collections: CollectionRow[], minSize = 2): GroupCandidate[] {
  const candidates: GroupCandidate[] = [];
  const used = new Set<string>();

  // 1) 同实体跨平台
  const byKey = new Map<string, { name: string; ids: string[] }>();
  for (const c of collections) {
    if (!c.title) continue;
    const key = `${normalizeEntity(c.title)}|${(c.author ?? "").toLowerCase()}`;
    const entry = byKey.get(key) ?? { name: c.title, ids: [] };
    if (!byKey.has(key)) byKey.set(key, entry);
    entry.ids.push(c.id);
  }
  for (const [, e] of byKey) {
    const ids = [...new Set(e.ids)];
    if (ids.length >= minSize) {
      candidates.push({ name: e.name, collectionIds: ids, reason: "entity" });
      for (const id of ids) used.add(id);
    }
  }

  // 2) 系列聚类（并查集）
  const items = collections.filter((c) => !used.has(c.id) && c.title && c.author);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p !== x) parent.set(x, find(p));
    return parent.get(x) ?? x;
  };
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b));
  };
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const match = scoreSeriesPair(toSeriesCandidate(items[i]), toSeriesCandidate(items[j]));
      if (match && match.score >= 8) union(items[i].id, items[j].id);
    }
  }
  const clusters = new Map<string, { ids: string[]; name: string }>();
  for (const item of items) {
    const root = find(item.id);
    const cluster = clusters.get(root) ?? { ids: [], name: seriesBaseName(item.title ?? "") };
    if (!clusters.has(root)) clusters.set(root, cluster);
    cluster.ids.push(item.id);
  }
  for (const [, cluster] of clusters) {
    const ids = [...new Set(cluster.ids)];
    if (ids.length >= minSize) {
      candidates.push({ name: cluster.name, collectionIds: ids, reason: "series" });
    }
  }
  return candidates;
}

export interface ContentGroupDeps {
  groups: ContentGroupRepository;
  collections: CollectionRepository;
  ai: AIRepository;
}

/**
 * ContentGroup 服务（Phase 6）：
 * 识别候选 -> 生成 suggested_group 建议（input_hash 去重，跳过已分组收藏）
 * -> 用户审核接受后 materialize 创建分组并绑定收藏（ADR-006：用户权威优先）。
 */
export class ContentGroupService {
  constructor(private readonly deps: ContentGroupDeps) {}

  autoGroup(maxScan = 2000): GroupCandidate[] {
    const collections = this.deps.collections.listAll(maxScan);
    const candidates = findGroupCandidates(collections);
    this.suggestCandidates(candidates);
    return candidates;
  }

  suggestCandidates(candidates: GroupCandidate[]): { suggested: number; skipped: number } {
    let suggested = 0;
    let skipped = 0;
    for (const c of candidates) {
      const unbound = c.collectionIds.filter((id) => !this.deps.groups.groupOfCollection(id));
      if (unbound.length < 2) {
        skipped += 1;
        continue;
      }
      const hash = createHash("sha256")
        .update(JSON.stringify({ name: c.name, ids: [...unbound].sort() }))
        .digest("hex");
      if (this.deps.ai.findSuggestionByHash(hash)) {
        skipped += 1;
        continue;
      }
      this.deps.ai.saveSuggestion({
        collection_id: unbound[0],
        suggestion_type: "suggested_group",
        payload: JSON.stringify({ name: c.name, collection_ids: unbound }),
        model: "omni-content-group",
        input_hash: hash,
        confidence: 0.7,
      });
      suggested += 1;
    }
    return { suggested, skipped };
  }

  /** 用户接受建议后落地：创建分组并绑定收藏。 */
  materializeSuggestion(payloadJson: string): { groupId: string; bound: number } {
    const payload = JSON.parse(payloadJson) as { name?: string; collection_ids?: string[] };
    const name = (payload.name ?? "未命名分组").trim();
    const ids = payload.collection_ids ?? [];
    const group = this.deps.groups.createGroup(name);
    let bound = 0;
    for (const id of ids) {
      if (!this.deps.collections.findById(id)) continue;
      this.deps.groups.bindCollection(group.id, id);
      bound += 1;
    }
    return { groupId: group.id, bound };
  }
}
