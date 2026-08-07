-- 002_add_priority.sql
-- 增量：收藏优先级（PRD v4.1，TDD Part 2.6 示例）
PRAGMA user_version = 2;

BEGIN;

ALTER TABLE collections ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE user_notes ADD COLUMN priority TEXT;

CREATE INDEX idx_collections_priority ON collections(priority);

COMMIT;
