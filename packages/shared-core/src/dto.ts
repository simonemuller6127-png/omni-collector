/** Plugin 展示用 DTO（TDD Part 9.1）。 */

export interface CollectionDTO {
  id: string;
  platform: string;
  platformItemId: string;
  url: string;
  title: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  contentType: string;
  saveType: "favorited" | "watch_later" | "liked";
  contentStatus: "active" | "deleted" | "unavailable" | "file_missing";
  syncStatus: "catalog" | "full" | "failed";
  organizeStatus: "unorganized" | "viewed" | "organized" | "archived";
  priority: "normal" | "important" | "project" | "knowledge";
  /** 用户区评分副本（ADR-006：权威在 Markdown 用户区，PRD 29.2 手动评分）。1~5；0/空表示未评分。 */
  rating?: number | null;
  aiStatus?: "unprocessed" | "processing" | "done" | "skipped" | "failed";
  collectedAt: string;
  lastSyncedAt?: string;
  groupId?: string;
  groupName?: string;
  /** 系列进度（PRD 24）：所在分组成员数与已整理数（organized/archived 计入）。 */
  groupSize?: number;
  groupOrganized?: number;
  tags?: string[];
  topics?: string[];
  comments?: Array<{
    /** comments 表主键（用于精选评论回写，PRD 7.3）。 */
    id?: string;
    author: string;
    content: string;
    likeCount?: number;
    starred?: boolean;
  }>;
  linkedFiles?: string[];
  related?: Array<{ id: string; platform: string; title: string; saveType: CollectionDTO["saveType"]; contentType: string; reason?: string }>;
}

export interface UserZone {
  note?: string;
  starredComments?: string;
  rating?: string;
  priority?: string;
}

/** Tag Atlas 条目（PRD 16）：规范化名称 + 别名 + 使用量。 */
export interface TagDTO {
  id: string;
  name: string;
  count: number;
  aliases: string[];
}

/** Topic 条目（PRD 17）：主题聚合 + 状态 + 成员数。 */
export interface TopicDTO {
  id: string;
  name: string;
  status: "pending" | "accepted" | "rejected";
  count: number;
  collection_ids?: string[];
}

/** AI 建议条目（SPEC S9.2）：待审核/已审面板展示。 */
export interface AiSuggestionDTO {
  id: string;
  collection_id: string;
  collection_title?: string;
  suggestion_type: string;
  payload?: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  created_at: string;
  reviewed_at?: string | null;
}
