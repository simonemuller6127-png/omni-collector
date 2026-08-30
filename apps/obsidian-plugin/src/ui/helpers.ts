import type { CollectionDTO } from "@omni/shared-core";

export interface CollectionFilter {
  status?: CollectionDTO["organizeStatus"];
  priority?: CollectionDTO["priority"];
  /** 关键字检索（借鉴 Karakeep/Cubox 全局搜索）：标题/作者/简介/链接/Tag/Topic/分组包含即命中。 */
  keyword?: string;
}

function haystackOf(c: CollectionDTO): string {
  return [c.title, c.author, c.description, c.url, c.groupName, ...(c.tags ?? []), ...(c.topics ?? [])]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function filterCollections(
  items: CollectionDTO[],
  filter: CollectionFilter,
): CollectionDTO[] {
  const keyword = filter.keyword?.trim().toLowerCase();
  return items
    .filter((c) => (filter.status ? c.organizeStatus === filter.status : true))
    .filter((c) => (filter.priority ? c.priority === filter.priority : true))
    .filter((c) => (keyword ? haystackOf(c).includes(keyword) : true))
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
}

/**
 * 今日回顾（借鉴 Readwise Daily Review 的"重现"理念，简化为确定性加权抽取）：
 * 未整理优先，同层内按收藏时间最旧优先，取最旧的至多 20 条做均匀随机，
 * 让沉睡的旧收藏重新浮出。
 */
export function pickDailyReview(
  items: CollectionDTO[],
  random: () => number = Math.random,
): CollectionDTO | null {
  const pool = items.filter(
    (c) => c.contentStatus === "active" && c.organizeStatus !== "archived",
  );
  if (pool.length === 0) return null;
  const unorganized = pool
    .filter((c) => c.organizeStatus === "unorganized")
    .sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
  const base = unorganized.length > 0 ? unorganized : pool;
  const candidates = base.slice(0, Math.min(20, base.length));
  return candidates[Math.floor(random() * candidates.length)] ?? null;
}

/** 整理状态流转：未整理 → 已查看 → 已整理 → 已归档（PRD 10.2）。 */
export function nextOrganizeState(
  state: CollectionDTO["organizeStatus"],
): CollectionDTO["organizeStatus"] {
  switch (state) {
    case "unorganized":
      return "viewed";
    case "viewed":
      return "organized";
    case "organized":
      return "archived";
    default:
      return "archived";
  }
}
