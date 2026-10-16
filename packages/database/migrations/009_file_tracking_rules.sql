-- 009_file_tracking_rules.sql
-- 文件哈希追踪（PRD 9.7 第二层，用户主动开启）与增强分析规则（PRD 9.4）显式入库
PRAGMA user_version = 9;

BEGIN;

INSERT INTO business_rules(rule_key, rule_value, default_value, description, impact) VALUES
  ('file_hash_tracking', 'false', 'false', '文件哈希追踪（移动恢复）',
   '开启后扫描时计算 SHA-256，并对丢失文件按哈希在新位置自动恢复关联；默认关闭（零开销）'),
  ('file_enhanced_analysis', 'false', 'false', '文件增强结构分析（Markdown TOC/章节）',
   '开启后扫描 Markdown 提取章节标题与 TOC 结构存入 file_index；禁止全文 OCR、不生成副本')
ON CONFLICT(rule_key) DO NOTHING;

COMMIT;
