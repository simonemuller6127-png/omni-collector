# 图谱双链 / Manual 批量 / 规则与同步设置补齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 Tag/Topic 以双链节点进入官方关系图谱；提供 Manual AI 批量打包流程；补齐 PRD/SPEC 的同步计划、规则中心、健康灯、功能级 AI 开关、深度同步/评论批量更新、异常统计。

**Architecture:** 协议层（shared-core 新消息）→ AI/解析层 → Engine（规则、健康、统计、深度同步、评论刷新、AI 开关）→ Plugin（设置、调度、UI）→ 部署验证。

**Tech Stack:** TypeScript / better-sqlite3 / Vitest / Obsidian API

---

## Task 1: Tag/Topic 双链进图谱

- Modify: `apps/obsidian-plugin/src/markdown/markdown-builder.ts`
- Modify: `apps/obsidian-plugin/src/main.ts`
- Test: `apps/obsidian-plugin/test/markdown.test.ts`

生成 `Omni Collector/Tags/{name}.md` 与 `Omni Collector/Topics/{name}.md` 聚合页；收藏笔记 `## 关联` 同时写入 Tag/Topic 聚合页 wikilink，图谱中出现双向节点。

## Task 2: Manual AI 批量

- Modify: `packages/shared-core/src/comm.ts`
- Modify: `packages/ai/src/queue-processor.ts`（`parseBatchSuggestions`）
- Modify: `apps/engine/src/comm/task-service.ts`（`TASK_AI_MANUAL_BATCH`）
- Modify: `apps/obsidian-plugin/src/comm/socket-client.ts`
- Create: `apps/obsidian-plugin/src/ui/manual-ai-batch.ts`
- Modify: `apps/obsidian-plugin/src/main.ts` / `src/ui/sidebar.ts` / `src/ui/ai-review.ts`
- Tests: `packages/ai/test/queue-processor.test.ts`、`apps/engine/test/task-service.test.ts`

模板按索引打包 N 条收藏；回复 `[{"index":1,"suggestions":[...]}]`；逐条生成 Suggestion。

## Task 3: 规则中心（Migration + RuleCenter）

- Create: `packages/database/migrations/007_sync_rules_and_rule_log.sql`
- Modify: `packages/database/src/repositories/rule-center.ts`
- Tests: `packages/database/test/rule-center.test.ts`、`migration.test.ts`

新增 `rule_change_log`、`business_rules.impact`；种子规则（平台频率、init 详情条数、随机窗口、日上限、AI 功能开关、深度同步、评论刷新天数）。

## Task 4: Engine 能力补齐

- Modify: `apps/engine/src/comm/task-service.ts`（RULE_LIST、健康、异常统计、TASK_SYNC depth、TASK_COMMENTS）
- Modify: `apps/engine/src/sync/sync-pipeline.ts`（maxItems）
- Modify: `apps/engine/src/sync/sync-runner.ts`（depth、refreshComments、selector）
- Modify: `apps/engine/src/ai/ai-queue-runner.ts`（功能级开关 + 日上限）
- Tests: `apps/engine/test/task-service.test.ts`、`sync-pipeline.test.ts`、`ai-queue-runner.test.ts`

## Task 5: Plugin 设置/调度/UI

- Modify: `apps/obsidian-plugin/src/settings.ts` / `settings-tab.ts`
- Create: `apps/obsidian-plugin/src/sync/sync-scheduler.ts`
- Modify: `apps/obsidian-plugin/src/comm/socket-client.ts` / `src/ui/sidebar.ts`
- Tests: `apps/obsidian-plugin/test/sync-scheduler.test.ts`

同步计划（平台频率/初始化详情条数/随机窗口/日上限）、功能级 AI 开关、规则中心表格与变更记录、健康灯、异常统计显示。

## Task 6: 构建/部署/验证/推送

- 全仓测试、构建、部署 engine 与 plugin、迁移验证、git push。
