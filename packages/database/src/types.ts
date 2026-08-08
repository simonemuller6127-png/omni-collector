/** 数据库行类型（与 TDD Part 2.4 字段一致，非 DTO）。 */
export interface CollectionRow {
  id: string;
  platform: string;
  platform_item_id: string;
  url: string;
  title?: string | null;
  author?: string | null;
  cover_url?: string | null;
  cover_cached?: string | null;
  description?: string | null;
  transcript?: string | null;
  content_type: string;
  save_type: "favorited" | "watch_later" | "liked";
  content_status: "active" | "deleted" | "unavailable" | "file_missing";
  sync_status: "catalog" | "full" | "failed";
  catalog_synced: number;
  detail_synced: number;
  inbox_status: "pending" | "processing" | "done";
  organize_status: "unorganized" | "viewed" | "organized" | "archived";
  priority: "normal" | "important" | "project" | "knowledge";
  ai_status?: string | null;
  ai_summary?: string | null;
  ai_tags?: string | null;
  ai_score?: number | null;
  embedding?: Buffer | null;
  extra_json?: string | null;
  first_viewed_at?: string | null;
  collected_at: string;
  last_synced_at?: string | null;
  deleted_at?: string | null;
  markdown_path?: string | null;
  linked_note_path?: string | null;
  platform_created_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  collection_id: string;
  comment_id: string;
  author?: string | null;
  content: string;
  like_count: number;
  posted_at?: string | null;
  is_creator_reply: number;
  is_starred: number;
  raw?: string | null;
  created_at: string;
}

export interface UserNoteRow {
  id: string;
  collection_id: string;
  note_md?: string | null;
  user_tags?: string | null;
  user_rating?: number | null;
  priority?: string | null;
  organize_status?: string | null;
  updated_at: string;
}

export interface AiQueueRow {
  id: string;
  collection_id: string;
  priority: number;
  status: "queued" | "processing" | "done" | "failed" | "skipped";
  retry_count: number;
  scheduled_at?: string | null;
  processed_at?: string | null;
  error?: string | null;
  created_at: string;
}

export interface AiSuggestionRow {
  id: string;
  collection_id: string;
  suggestion_type: string;
  payload?: string | null;
  model?: string | null;
  input_hash?: string | null;
  confidence?: number | null;
  status: "pending" | "accepted" | "rejected" | "expired";
  reviewed_at?: string | null;
  created_at: string;
}

export interface LocalFileRow {
  id: string;
  file_path: string;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  created_at?: string | null;
  modified_at?: string | null;
  file_hash?: string | null;
  content_status: "active" | "file_missing";
  linked_collection_id?: string | null;
  record_created_at: string;
  updated_at: string;
}

export interface FileIndexRow {
  file_id: string;
  extracted_title?: string | null;
  toc_json?: string | null;
  chapter_titles?: string | null;
  sheet_names?: string | null;
  analysis_status: "none" | "done" | "failed" | "skipped";
  analyzed_at?: string | null;
}

export interface PlatformAccountRow {
  id: string;
  platform: string;
  account_name?: string | null;
  cookie_ref?: string | null;
  sync_cursor?: string | null;
  last_sync_at?: string | null;
  status: "inactive" | "active" | "error";
  error_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLogRow {
  id: string;
  adapter: string;
  task_type: string;
  started_at?: string | null;
  finished_at?: string | null;
  status: string;
  items_added: number;
  items_updated: number;
  error_code?: string | null;
  error_detail?: string | null;
  created_at: string;
}
