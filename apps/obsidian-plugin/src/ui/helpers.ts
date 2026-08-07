import type { CollectionDTO } from "@omni/shared-core";

export interface CollectionFilter {
  status?: CollectionDTO["organizeStatus"];
  priority?: CollectionDTO["priority"];
}

export function filterCollections(
  items: CollectionDTO[],
  filter: CollectionFilter,
): CollectionDTO[] {
  return items
    .filter((c) => (filter.status ? c.organizeStatus === filter.status : true))
    .filter((c) => (filter.priority ? c.priority === filter.priority : true))
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
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
