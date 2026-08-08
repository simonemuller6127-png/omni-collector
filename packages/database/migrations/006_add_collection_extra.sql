-- 006_add_collection_extra.sql
-- Phase 4d：收藏附加上下文（xsec_token / topic 等 adapter 数据），供按需正文抓取
PRAGMA user_version = 6;

BEGIN;

ALTER TABLE collections ADD COLUMN extra_json TEXT;

COMMIT;
