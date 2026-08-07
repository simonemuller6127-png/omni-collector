-- 005_add_group_perf_indexes.sql
-- Phase 6：大规模性能优化（万条 Dataview <500ms）所需索引
PRAGMA user_version = 5;

BEGIN;

CREATE INDEX idx_collections_collected_at ON collections(collected_at);
CREATE INDEX idx_collections_organize_status ON collections(organize_status);

COMMIT;
