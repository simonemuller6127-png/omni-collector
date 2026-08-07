-- 004_add_makerworld_likes_rule.sql
-- 新增：MakerWorld 是否同步点赞内容（用户可选项，默认关闭）
PRAGMA user_version = 4;

BEGIN;

INSERT INTO business_rules(rule_key, rule_value, default_value, description)
VALUES ('makerworld_sync_likes', 'false', 'false', 'MakerWorld 同步点赞内容开关（默认关闭）');

COMMIT;
