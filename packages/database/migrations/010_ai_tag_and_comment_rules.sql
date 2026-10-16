-- 010_ai_tag_and_comment_rules.sql
-- AI 标签策略拆分（PRD 19 / 16 Tag Atlas）：
-- content_tags 只承载内容标签（进 tags/content_tags/Tag Atlas），
-- content_type 只写 collections.content_type 列，永不进 tags 表。
-- 同时把「热门评论进提示词」的条数上限与疑似重复检测的阈值/截断数显式入库，
-- 满足「所有业务数值一律从 business_rules 读取，禁止硬编码」（SPEC S10）。
PRAGMA user_version = 10;

BEGIN;

INSERT INTO business_rules(rule_key, rule_value, default_value, description, impact) VALUES
  ('ai_tag_max_count', '7', '7', 'AI 内容标签建议上限（条）',
   'content_tags 每次建议 1~N 个内容标签；超出上限会被截断后交给用户审核，避免一次性刷爆 Tag Atlas'),
  ('ai_comment_context_limit', '5', '5', 'AI 提示词热门评论条数上限',
   '按 like_count 降序取前 N 条评论拼入提示词与 input_hash；评论只进 AI 输入，不落盘笔记正文（PRD 9.4）'),
  ('ai_content_tag_enabled', 'true', 'true', 'AI 内容标签建议开关（suggested_content_tags）',
   '关闭后 AI 仍会分析但不落地 content_tags 类型建议；形式标签（suggested_content_type）不受此开关影响'),
  ('ai_content_type_enabled', 'true', 'true', 'AI 形式标签建议开关（suggested_content_type）',
   '关闭后不再产出形式标签建议；形式标签只写 collections.content_type，不写入 tags 表'),
  ('ai_duplicate_tag_min_count', '20', '20', '疑似重复 Tag 检测的最小 Tag 数阈值',
   'Tag 数未达阈值时跳过 O(n^2) 的近重复检测，避免小库每次同步白跑；输入指纹变更同样会触发老建议全量重分析'),
  ('ai_duplicate_tag_report_limit', '20', '20', '同步报告疑似重复 Tag 上报上限（组）',
   'findNearDuplicateTags 结果按此上限截断后写入 SyncReport.duplicateTags，供侧边栏提示一键跳 Tag 管理')
ON CONFLICT(rule_key) DO NOTHING;

COMMIT;
