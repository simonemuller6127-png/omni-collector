-- 003_add_content_groups.sql
-- 增量：ContentGroup + Collection 关联映射（ADR-010）
PRAGMA user_version = 3;

BEGIN;

CREATE TABLE content_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'knowledge',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE collection_group_mapping (
  collection_id TEXT PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES content_groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_mapping_group ON collection_group_mapping(group_id);

COMMIT;
