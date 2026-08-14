-- 007_sync_rules_and_rule_log.sql
-- Sync schedule rules, per-feature AI switches, rule change log (PRD 15.4 / SPEC S10)
PRAGMA user_version = 7;

BEGIN;

ALTER TABLE business_rules ADD COLUMN impact TEXT;

CREATE TABLE rule_change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rule_change_log ON rule_change_log(rule_key, changed_at);

INSERT INTO business_rules(rule_key, rule_value, default_value, description, impact) VALUES
  ('bilibili_sync_frequency', 'daily', 'daily', 'B站自动同步频率', 'daily=每日自动同步一次；weekly=每周自动同步一次'),
  ('youtube_sync_frequency', 'daily', 'daily', 'YouTube自动同步频率', 'daily=每日自动同步一次；weekly=每周自动同步一次'),
  ('xiaohongshu_sync_frequency', 'daily', 'daily', '小红书自动同步频率', 'daily=每日自动同步一次；weekly=每周自动同步一次'),
  ('makerworld_sync_frequency', 'daily', 'daily', 'MakerWorld自动同步频率', 'daily=每日自动同步一次；weekly=每周自动同步一次'),
  ('xiaoheihe_sync_frequency', 'daily', 'daily', '小黑盒自动同步频率', 'daily=每日自动同步一次；weekly=每周自动同步一次'),
  ('init_full_detail_limit', '50', '50', '初始化完整详情同步条数上限', '可配置区间 20~80；超出部分保持 catalog 轻量状态'),
  ('sync_random_window_minutes', '120', '120', '自动同步随机执行窗口（分钟）', '计划任务在窗口内随机执行，避免固定时刻被风控'),
  ('daily_sync_cap_per_platform', '3', '3', '单平台每日自动同步次数上限', '当天达到上限后不再自动触发该平台'),
  ('deep_sync_default_depth', '50', '50', '深度历史同步默认回溯深度（页）', '手动深度同步时向后拉取的历史页数'),
  ('comment_batch_update_days', '7', '7', '评论批量更新最近 N 天', '批量刷新最近 N 天内同步收藏的评论'),
  ('ai_tag_enabled', 'true', 'true', 'AI Tag 建议功能开关', '关闭后 AI 不再生成 Tag 建议；已落地 Tag 不受影响'),
  ('ai_topic_enabled', 'true', 'true', 'AI Topic 建议功能开关', '关闭后 AI 不再生成 Topic 建议'),
  ('ai_summary_enabled', 'true', 'true', 'AI 摘要建议功能开关', '关闭后 AI 不再生成摘要建议');

UPDATE business_rules SET impact = '全局开关；关闭后同步/标签/整理完整可用（降级无阻断）' WHERE rule_key = 'ai_enabled';
UPDATE business_rules SET impact = '云端 AI 每日调用上限；超出后排队次日执行' WHERE rule_key = 'ai_daily_call_limit';
UPDATE business_rules SET impact = '单批 AI 处理上限（ADR-007）' WHERE rule_key = 'ai_batch_size';
UPDATE business_rules SET impact = '同步失败自动重试次数；超过进入人工待处理' WHERE rule_key = 'sync_fail_max_retry';
UPDATE business_rules SET impact = '首次初始化完整同步收藏数量上限（区间 20~80）' WHERE rule_key = 'init_sync_full_limit';
UPDATE business_rules SET impact = '平台删除内容本地保留天数；超期标记失效' WHERE rule_key = 'deletion_retention_days';
UPDATE business_rules SET impact = 'AI 自动评分功能开关' WHERE rule_key = 'ai_score_enabled';
UPDATE business_rules SET impact = '单条收藏默认同步评论条数' WHERE rule_key = 'comment_fetch_default_count';
UPDATE business_rules SET impact = 'MakerWorld 是否同步点赞内容（用户可选项）' WHERE rule_key = 'makerworld_sync_likes';
UPDATE business_rules SET impact = '文件增强结构分析开关' WHERE rule_key = 'file_enhanced_analysis';
UPDATE business_rules SET impact = '小红书评论图片下载开关' WHERE rule_key = 'xiaohongshu_image_download';
UPDATE business_rules SET impact = '视频字幕提取开关' WHERE rule_key = 'subtitle_extraction';
UPDATE business_rules SET impact = '整理完成判定：any_one=标签/评分/笔记/优先级任一' WHERE rule_key = 'organize_completion_criteria';
UPDATE business_rules SET impact = '待整理收藏超期提醒天数' WHERE rule_key = 'unorganized_reminder_days';
UPDATE business_rules SET impact = 'Engine 单次任务最大执行超时秒数' WHERE rule_key = 'engine_task_timeout_seconds';
UPDATE business_rules SET impact = '稍后再看收藏超期提醒天数' WHERE rule_key = 'watch_later_expiry_days';
UPDATE business_rules SET impact = '评论按需刷新最小间隔天数' WHERE rule_key = 'comment_refresh_threshold_days';
UPDATE business_rules SET impact = '收藏标题变更提示展示时长' WHERE rule_key = 'title_change_notice_days';
UPDATE business_rules SET impact = '第一次删除过期提醒天数' WHERE rule_key = 'deletion_reminder_1_days';
UPDATE business_rules SET impact = '第二次删除过期提醒天数' WHERE rule_key = 'deletion_reminder_2_days';
UPDATE business_rules SET impact = '视频/图片多媒体默认下载策略' WHERE rule_key = 'multimedia_default_download';

COMMIT;
