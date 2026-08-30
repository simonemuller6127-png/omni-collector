import type { CollectionDTO } from "@omni/shared-core";

/** 平台品牌元数据（外观借鉴 Eagle/Karakeep 的色彩识别收纳）：徽标与卡片强调条共用。 */
export interface PlatformMeta {
  label: string;
  color: string;
}

export const PLATFORM_META: Record<string, PlatformMeta> = {
  bilibili: { label: "B站", color: "#fb7299" },
  youtube: { label: "YouTube", color: "#ff5449" },
  xiaohongshu: { label: "小红书", color: "#ff2442" },
  makerworld: { label: "MakerWorld", color: "#2fa84f" },
  xiaoheihe: { label: "小黑盒", color: "#ff9f43" },
};

export function platformMeta(platform: string): PlatformMeta {
  return PLATFORM_META[platform] ?? { label: platform, color: "var(--text-muted)" };
}

/** 智能视图预设（收纳借鉴 Eagle Smart Folders）：一键切换常用视图。 */
export interface ViewPreset {
  key: string;
  label: string;
  filters: {
    status?: CollectionDTO["organizeStatus"];
    priority?: CollectionDTO["priority"];
    ratedOnly?: boolean;
    recentDays?: number;
  };
}

export const VIEW_PRESETS: ViewPreset[] = [
  { key: "all", label: "全部", filters: {} },
  { key: "unorganized", label: "未整理", filters: { status: "unorganized" } },
  { key: "recent", label: "本周新增", filters: { recentDays: 7 } },
  { key: "priority", label: "高优先级", filters: { priority: "important" } },
  { key: "rated", label: "已评分", filters: { ratedOnly: true } },
  { key: "watchLater", label: "稍后再看", filters: {} }, // 由列表按 saveType 过滤
];

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
