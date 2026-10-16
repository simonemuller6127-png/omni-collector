-- 008_semantic_related_rule.sql
-- 本地语义关联开关（PRD 2.0 Related Collections 轻量实现，默认关闭）
PRAGMA user_version = 8;

BEGIN;

INSERT INTO business_rules(rule_key, rule_value, default_value, description, impact) VALUES
  ('semantic_related_enabled', 'false', 'false', '本地语义关联（TF-IDF 相似收藏推荐）',
   '开启后详情页「相关收藏」在分组/实体匹配之外追加本地相似推荐；纯本地计算，不调用 AI、不上传内容');

COMMIT;
