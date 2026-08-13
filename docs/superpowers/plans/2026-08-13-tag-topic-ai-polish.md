# Tag Atlas / Topic / AI 建议 完善迭代 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 PRD 16/17/19 要求的 Tag Atlas（别名/去重/官方标签模块联动）、Topic（专属入口 + 关系图谱联动）、AI Manual（模板入口 + 全流程跑通）。

**Architecture:** 数据侧（TagRepository/TopicRepository/AIRepository）→ 引擎侧（SyncPipeline 提取平台话题、TaskService 新消息处理、suggestion 修复/撤销/过期/反馈）→ 协议侧（shared-core 消息类型 + socket-client）→ 插件侧（Markdown 生成、Tag/Topic 管理视图、AI 审核增强、侧边栏入口）。

**Tech Stack:** TypeScript / better-sqlite3 / Vitest / Obsidian API / esbuild

---

## 背景事实（已核实）

- 用户 Obsidian 里的“乱 tag”（生活美/生活美学、美术生/美术生日常）来自小红书标题自带的 `#话题`，被写进 Markdown 后成为 Obsidian 内联标签。
- 当前 DB 中 `tags`/`content_tags`/`topics` 全空，`ai_suggestions` 只有 accepted 的 suggested_group。
- `materializeAccepted` 对 suggested_tag 直接把整个 JSON 数组字符串当单个 tag 落地（bug）。
- Markdown 只在新文件写入 `tags:`，`replaceSystemZone` 不更新 frontmatter；title 未做 YAML 转义；无 topic 关联。
- AI 审核面板极简：无收藏标题、无撤销、无过期、无反馈记录；Manual AI 模板入口只在详情页，且模板不含已有 Tag。

## 任务拆解

### Task 1: shared-core 协议与 DTO

- Modify: `packages/shared-core/src/comm.ts`
- Modify: `packages/shared-core/src/dto.ts`
- Test: `packages/shared-core/test/comm.test.ts`

新增消息类型：`TAG_LIST`、`TAG_ALIAS_ADD`、`TAG_MERGE`、`TAG_RENAME`、`TOPIC_LIST`、`TOPIC_RENAME`、`AI_REVIEW_UNDO`，并登记 REQUIRED_PAYLOAD_FIELDS。

新增 DTO：`TagDTO {id,name,count,aliases}`、`TopicDTO {id,name,status,count,collection_ids?}`、`AiSuggestionDTO {id,collection_id,collection_title,suggestion_type,payload,status,created_at,reviewed_at?}`。

### Task 2: TagRepository（别名/合并/统计）

- Modify: `packages/database/src/repositories/tag.repository.ts`
- Test: `packages/database/test/tag-topic.repository.test.ts`

实现：`findByAlias`、`addAlias`、`listAliases`、`listTags`（含 count）、`renameTag`（重名自动合并）、`mergeTags`（content_tags 冲突保 user > ai > platform，别名并入，删源 tag）、`listCollectionsByTag` 支持别名；`CollectionTagRow.source` 扩展 `platform`。

### Task 3: TopicRepository（统计/重命名）

- Modify: `packages/database/src/repositories/topic.repository.ts`
- Test: `packages/database/test/tag-topic.repository.test.ts`

实现：公开 `findById`、`listTopicsWithCounts`、`renameTopic`。

### Task 4: AIRepository（反馈/过期）

- Modify: `packages/database/src/repositories/ai.repository.ts`
- Test: `packages/database/test/ai.repository.test.ts`

实现：`recordFeedback(collectionId, eventType, eventData)`、`expireOldPending(days)`。

### Task 5: packages/ai（tag 数组解析 + 模板含已有 Tag）

- Modify: `packages/ai/src/queue-processor.ts`
- Test: `packages/ai/test/queue-processor.test.ts`

实现：`parseTagPayload(payload): string[]`（JSON 数组 / 逗号分隔 / 单个）；`buildManualPrompt(item, existingTags?)` 增加“已有Tag”行。

### Task 6: 引擎 tag-utils（话题提取/标题清洗/重复检测）

- Create: `apps/engine/src/tags/tag-utils.ts`
- Test: `apps/engine/test/tag-utils.test.ts`

实现：`extractHashtags(text)`（`#xxx` 去重、trim、限长）、`cleanTitleForDisplay(title)`（移除行尾话题块）、`findNearDuplicateTags(tags, threshold=0.85)`（归一化 + Levenshtein 相似度）。

### Task 7: SyncPipeline 平台话题入库

- Modify: `apps/engine/src/sync/sync-pipeline.ts`
- Modify: `apps/engine/src/sync/sync-runner.ts`
- Test: `apps/engine/test/sync-pipeline.test.ts`

`SyncPipelineDeps` 增加 `tags?: TagRepository`；upsert 后从 title/description 提取话题，`bindTag(collection_id, tag_id, 'platform')`；SyncRunner 注入。

### Task 8: TaskService 新处理器 + 修复 + 撤销/过期/反馈

- Modify: `apps/engine/src/comm/task-service.ts`
- Test: `apps/engine/test/task-service.test.ts`

新增：`TAG_LIST`、`TAG_ALIAS_ADD`、`TAG_MERGE`、`TAG_RENAME`、`TOPIC_LIST`、`TOPIC_RENAME`、`AI_REVIEW_UNDO`。

修复/增强：
- suggested_tag 接受时按数组拆分、规范化、逐条落地（source=ai）；
- suggested_summary 接受时写 `collections.ai_summary` 与 `ai_status='done'`；
- 接受/拒绝写 user_feedback（含 event_data 中的落地 ID，供撤销）；
- `AI_REVIEW_UNDO`：24h 内撤销（按 feedback event_data 移除 tag 绑定/topic 成员/group 绑定/ai_summary）；
- `aiReviewList` 先过期 30 天以上 pending，并返回收藏标题；
- summary 增加 topics 计数。

### Task 9: MarkdownBuilder（YAML 安全 / tags / topics / 话题转义 / 增量刷新）

- Modify: `apps/obsidian-plugin/src/markdown/markdown-builder.ts`
- Test: `apps/obsidian-plugin/test/markdown.test.ts`

实现：YAML 字符串安全引用；frontmatter 写 `tags:`（规范化）+ `topics:`；H1 标题 `#` 转义；`replaceSystemZone` 同时重建 frontmatter；新增 `buildTopicHub(topic, links)`（含 wikilink 列表）。

### Task 10: socket-client 新方法

- Modify: `apps/obsidian-plugin/src/comm/socket-client.ts`

新增：`listTags`、`addTagAlias`、`mergeTags`、`renameTag`、`listTopics`、`renameTopic`、`undoAiSuggestion`；`listAiSuggestions` 返回收藏标题；`getSummary` 增加 topics。

### Task 11: 插件 UI（Tag/Topic 管理视图 + AI 审核增强 + 入口）

- Create: `apps/obsidian-plugin/src/ui/tag-topic.ts`
- Modify: `apps/obsidian-plugin/src/ui/ai-review.ts`
- Modify: `apps/obsidian-plugin/src/ui/collection-detail.ts`
- Modify: `apps/obsidian-plugin/src/ui/sidebar.ts`
- Modify: `apps/obsidian-plugin/src/main.ts`
- Modify: `apps/obsidian-plugin/src/ui/manual-ai.ts`（从 detail 抽取公共 Manual AI 弹窗）
- Modify: `apps/obsidian-plugin/styles.css`

Tag/Topic 视图：双 Tab；Tag 列表（名称/数量/别名/重命名/加别名/合并/去重建议）、Topic 列表（名称/数量/状态/重命名/点击看成员）。
AI 审核：显示收藏标题、按类型渲染 payload、确认/拒绝、会话内撤销。
入口：侧边栏新增 “Tag/Topic 管理” 与 “Manual AI”；命令注册；详情页 chips 可点开管理视图。

### Task 12: 生成 Topic Hub 笔记（关系图谱联动）

- Modify: `apps/obsidian-plugin/src/main.ts`

`generateCollectionMarkdown` 后生成 `Omni Collector/Topics/{name}.md`，包含 `[[Omni Collector/{platform}/{title}]]` wikilink；收藏笔记 frontmatter `topics:` + 系统区 `## 关联` wikilink。

### Task 13: 存量数据回填 + 构建部署 + 验证 + 提交

- 回填脚本：对现有 collections 从 title/description 提取话题，bind 为 platform tag；
- 构建 packages/ai、database、shared-core、engine、plugin；全量测试；
- 部署 engine 到 `D:\Obsidian\.omni-collector\engine`，拷贝插件到 vault；
- 验证 live DB（tags/content_tags 计数、别名、撤销、过期）；
- git commit + push；README 摘要更新。
