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
  aiStatus?: "unprocessed" | "processing" | "done" | "skipped" | "failed";
  collectedAt: string;
  lastSyncedAt?: string;
  groupId?: string;
  groupName?: string;
  tags?: string[];
  topics?: string[];
  comments?: Array<{ author: string; content: string }>;
}

export interface UserZone {
  note?: string;
  starredComments?: string;
  rating?: string;
  priority?: string;
}
