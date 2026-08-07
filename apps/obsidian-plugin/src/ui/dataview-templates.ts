/** 预设 Dataview 查询模板（PRD 15.2 / 13.3：整理视图、优先级视图、全部收藏）。 */

export const DATAVIEW_TEMPLATES = {
  unorganized: [
    "```dataview",
    "TABLE platform, save_type, priority, collected_at",
    'FROM #omni/collector',
    'WHERE organize_status = "unorganized"',
    "SORT collected_at DESC",
    "```",
  ].join("\n"),
  priority: [
    "```dataview",
    "TABLE priority, organize_status, platform",
    'FROM #omni/collector',
    'WHERE priority = "important" OR priority = "project"',
    "SORT priority DESC",
    "```",
  ].join("\n"),
  all: [
    "```dataview",
    "TABLE platform, sync_status, organize_status, priority",
    'FROM #omni/collector',
    "SORT collected_at DESC",
    "```",
  ].join("\n"),
} as const;
