-- 001_initial.sql
-- Omni Collector SQLite Schema v1 初始建表 + 种子规则（TDD Part 2）
-- 版本记录由 MigrationManager（T-102）写入 schema_versions，脚本内不再插入。
PRAGMA user_version = 1;

BEGIN;

CREATE TABLE schema_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  checksum TEXT
);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_item_id TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  author TEXT,
  cover_url TEXT,
  cover_cached TEXT,
  description TEXT,
  transcript TEXT,
  content_type TEXT NOT NULL DEFAULT 'video',
  save_type TEXT NOT NULL DEFAULT 'favorited',
  content_status TEXT NOT NULL DEFAULT 'active',
  sync_status TEXT NOT NULL DEFAULT 'catalog',
  catalog_synced INTEGER NOT NULL DEFAULT 0,
  detail_synced INTEGER NOT NULL DEFAULT 0,
  inbox_status TEXT NOT NULL DEFAULT 'pending',
  organize_status TEXT NOT NULL DEFAULT 'unorganized',
  ai_status TEXT,
  ai_summary TEXT,
  ai_tags TEXT,
  ai_score REAL,
  embedding BLOB,
  first_viewed_at TEXT,
  collected_at TEXT NOT NULL,
  last_synced_at TEXT,
  deleted_at TEXT,
  markdown_path TEXT,
  linked_note_path TEXT,
  platform_created_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, platform_item_id)
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  comment_id TEXT NOT NULL,
  author TEXT,
  content TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  posted_at TEXT,
  is_creator_reply INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(collection_id, comment_id)
);

CREATE TABLE platform_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL UNIQUE,
  account_name TEXT,
  cookie_ref TEXT,
  sync_cursor TEXT,
  last_sync_at TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  error_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tag_aliases (
  id TEXT PRIMARY KEY,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  alias TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'zh'
);

CREATE TABLE content_tags (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (collection_id, tag_id)
);

CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  tag_ids TEXT,
  collection_ids TEXT,
  content_group_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT,
  creator TEXT,
  collection_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ai_suggestions (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL,
  payload TEXT,
  model TEXT,
  input_hash TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ai_queue (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  retry_count INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  processed_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_feedback (
  id TEXT PRIMARY KEY,
  collection_id TEXT,
  event_type TEXT NOT NULL,
  event_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE adapter_health (
  id TEXT PRIMARY KEY,
  adapter TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  metric TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sync_log (
  id TEXT PRIMARY KEY,
  adapter TEXT NOT NULL,
  task_type TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  status TEXT NOT NULL,
  items_added INTEGER NOT NULL DEFAULT 0,
  items_updated INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE local_files (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  created_at TEXT,
  modified_at TEXT,
  file_hash TEXT,
  content_status TEXT NOT NULL DEFAULT 'active',
  linked_collection_id TEXT,
  record_created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE file_index (
  file_id TEXT PRIMARY KEY REFERENCES local_files(id) ON DELETE CASCADE,
  extracted_title TEXT,
  toc_json TEXT,
  chapter_titles TEXT,
  sheet_names TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'none',
  analyzed_at TEXT
);

CREATE TABLE user_notes (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL UNIQUE REFERENCES collections(id) ON DELETE CASCADE,
  note_md TEXT,
  user_tags TEXT,
  user_rating INTEGER,
  organize_status TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE business_rules (
  id TEXT PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  rule_value TEXT NOT NULL,
  default_value TEXT,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_collections_platform ON collections(platform, save_type, content_status);
CREATE INDEX idx_collections_organize ON collections(organize_status);
CREATE INDEX idx_collections_inbox ON collections(inbox_status);
CREATE INDEX idx_collections_collected ON collections(collected_at);
CREATE INDEX idx_comments_collection ON comments(collection_id);
CREATE INDEX idx_comments_starred ON comments(is_starred);
CREATE INDEX idx_content_tags_tag ON content_tags(tag_id);
CREATE INDEX idx_ai_suggestions_status ON ai_suggestions(collection_id, status);
CREATE INDEX idx_ai_suggestions_pending ON ai_suggestions(status, created_at);
CREATE INDEX idx_ai_queue ON ai_queue(status, priority);
CREATE INDEX idx_user_feedback ON user_feedback(event_type);
CREATE INDEX idx_adapter_health ON adapter_health(adapter, created_at);
CREATE INDEX idx_sync_log ON sync_log(adapter, created_at);
CREATE INDEX idx_local_files_hash ON local_files(file_hash);
CREATE INDEX idx_local_files_type ON local_files(file_type);

INSERT INTO business_rules(rule_key, rule_value, default_value, description) VALUES
  ('init_sync_full_limit', '50', '50', '首次初始化完整同步收藏数量上限（区间20~80）'),
  ('deletion_retention_days', '180', '180', '平台已删除内容本地保留天数'),
  ('deletion_reminder_1_days', '30', '30', '第一次删除过期提醒天数'),
  ('deletion_reminder_2_days', '150', '150', '第二次删除过期提醒天数'),
  ('title_change_notice_days', '14', '14', '收藏标题变更提示展示时长'),
  ('comment_refresh_threshold_days', '7', '7', '评论按需刷新最小间隔天数'),
  ('watch_later_expiry_days', '30', '30', '稍后再看收藏超期提醒天数'),
  ('sync_fail_max_retry', '3', '3', '同步失败最大自动重试次数'),
  ('ai_enabled', 'false', 'false', 'AI 功能全局开关默认关闭'),
  ('xiaohongshu_image_download', 'false', 'false', '小红书评论图片下载默认关闭'),
  ('subtitle_extraction', 'false', 'false', '视频字幕提取默认关闭'),
  ('ai_score_enabled', 'false', 'false', 'AI 自动评分默认关闭'),
  ('ai_daily_call_limit', '50', '50', '每日云端 AI 接口调用最大次数'),
  ('comment_fetch_default_count', '3', '3', '单条收藏默认同步评论条数'),
  ('file_enhanced_analysis', 'false', 'false', '文件增强结构分析默认关闭'),
  ('organize_completion_criteria', 'any_one', 'any_one', '整理完成判定：标签/评分/笔记/优先级任意一项'),
  ('unorganized_reminder_days', '14', '14', '待整理收藏超期提醒天数'),
  ('multimedia_default_download', 'none', 'none', '视频/图片多媒体默认不下载'),
  ('engine_task_timeout_seconds', '300', '300', 'Engine 单次任务最大执行超时秒数'),
  ('ai_batch_size', '100', '100', '单批 AI 处理上限（ADR-007）');

COMMIT;
