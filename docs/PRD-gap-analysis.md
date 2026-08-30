# Omni Collector × PRD v4.2 差距比对报告（0.7.0 版）

> 比对基准：`Omni_Collector_PRD_v4.2_最终版.docx` 第二十八章《功能需求全量清单 v4.1》、第二十九章《产品验收标准》，以及 SPEC v3.3 分阶段路线（V1.0 → V1.5 → V2.0 → V3.0）。
> 状态口径：✅ 已实现并测试覆盖 · 🟡 部分实现/有替代路径 · ❌ 未实现（多属 V3.0 范围）。
> 最近更新：0.9.0（收纳与外观轮：智能视图预设 / 卡片视图重设计 / 平台品牌色识别 / 系列进度条，遵循 Obsidian CSS 变量规范）。

## 一、V1.0 Foundation（P0）

| 需求项 | 状态 | 说明 |
| --- | --- | --- |
| Plugin+Engine 分离架构+通信协议 | ✅ | Local Socket + WebSocket 分层（ADR-001），Local Pipe 请求 / WS 事件推送 |
| B站收藏同步 | ✅ | WBI 签名直连 + 稍后再看 + 评论采集 |
| SQLite 完整 Schema v4.1 | ✅ | 001~008 迁移，25 张表与 PRD 清单一致 |
| Markdown 区域隔离写入 | ✅ | 系统区/用户区标记协议（ADR-011），含聚合页与用户区物化 |
| 收藏整理生命周期 UI | ✅ | 四阶段 + 批量 + Detail 推进 |
| Sync Scheduler + 风控 | ✅ | 频率/随机窗口/单日上限（规则中心），失败隔离 |
| 双队列（Sync/AI 解耦） | ✅ | AI Queue 独立，AI 关闭不影响同步 |
| Dataview 查询模板库 | ✅ | 模板内嵌聚合页动态索引 |
| 统一规则管理系统 | ✅ | 规则中心 UI + rule_change_log 变更记录 + 恢复默认 |

## 二、V1.5 Expansion

| 需求项 | 状态 | 说明 |
| --- | --- | --- |
| YouTube / 小红书 / MakerWorld / 小黑盒 | ✅ | yt-dlp+cookies / x-s 签名直连 / Cloudflare 持久会话 / 浏览器驱动 |
| 评论系统（默认3条·精选·按需更新） | ✅ | 默认 3 条 + 批量刷新 + 精选评论（0.5.4） |
| 收藏/稍后再看分离 | ✅ | save_type 字段 + 独立处理流 + 超期统计 |
| 初始化策略（全量目录+20-80详情） | ✅ | `init_full_detail_limit` 规则化 |
| 180天删除保留+灰度+两次提醒 | ✅ | content-retention 模块 + 规则中心 |
| Tag Alias 别名系统 | ✅ | tag_aliases + Tag Atlas UI |
| 外部 Markdown 路径支持 | ✅ | linked_note_path |
| 本地文件轻量索引层 | ✅ | 多目录扫描（.md/.pdf）按 URL 关联 |
| 文件增强分析（可选） | 🟡 | Markdown 章节/TOC 已实现（0.7.0，规则开启）；PDF 解析按 PRD「禁止全文提取」原则保持 skipped |
| 文件类型插件渲染（方式C） | 🟡 | 已支持打开关联笔记；渲染依赖 Docxer 等第三方插件 |
| 文件丢失软警告+哈希追踪 | ✅ | 软警告默认（扫描时标记 file_missing）；哈希追踪规则化开启，SHA-256 自动恢复移动文件关联（0.7.0） |
| 网页渲染（Surfing+浏览器跳转） | 🟡 | 浏览器跳转 ✅；Surfing 组合为用户可选 |
| Inbox Queue + 侧边栏角标 | ✅ | inbox_status 流转 + 侧边栏汇总/超期提醒（角标以文字统计呈现） |
| Series 系列识别 | ✅ | scoreSeriesPair（PRD 24 权重）自动识别候选 + 手动加入/移出/整组并入 + 系列进度（已整理 n/m）（0.7.0） |
| 账号配置（多平台+Cookie 加密） | ✅ | 0.6.0 登录窗口引导（PRD 26.1②③）+ Cookie-Editor 导入；AES-256-GCM 本地加密 |
| 大规模体验优化 | ✅ | SQLite 索引 + 10k 性能测试 |
| 多媒体内容处理边界规则 | ✅ | `multimedia_default_download` 等规则化 |

## 三、V2.0 Intelligence

| 需求项 | 状态 | 说明 |
| --- | --- | --- |
| AI Suggestion 机制+审核界面 | ✅ | 审核/撤销（24h）/建议隔离 |
| 用户反馈数据层+事件采集 | ✅ | 0.6.0 起记录 organize/priority/rating/精选/稍后转换事件（含批量） |
| AI Queue 批处理+缓存 | ✅ | 单批 ≤100，input_hash 去重，失败隔离，每日上限 |
| Smart Connections 语义搜索 | ✅（组合） | 组合复用指南见 README；插件内置本地 TF-IDF 语义关联（可选开关）作为无 API 替代 |
| Topic 候选生成+用户确认 | ✅ | suggested_topic + AI 审核流 + hub 双链 |
| Manual 模式 AI 模板+回填解析 | ✅ | 单条 + 批量打包（PRD 19.3） |
| ContentGroup 跨平台关联识别 | ✅ | 实体归一 + 系列候选 + 用户确认 |
| 用户评分（默认 AI 评分关闭） | ✅ | 0.5.4 手动评分 1~5 星，参与排序 |
| Related Collections | ✅ | 同分组 → 同实体 → 本地语义相似 三级链路（0.6.0） |
| 多设备同步（Remotely Save 引导） | ✅（文档） | README 指南：笔记目录可同步、Engine 数据目录按设备独立 |
| Tag Wrangler 管理 | ✅（文档） | 原生 tag 直接可用；建议经插件操作保持一致 |
| Datasette 调试界面 | ❌ | 长期保留项 |

## 四、验收标准对照（PRD 29.1）

多平台同步 ✅ · 收藏/稍后再看分离 ✅ · 增量同步 ✅ · URL/标题/封面/简介/评论 ✅ · Tag ✅ · Topic ✅ · Series ✅ · Markdown ✅ · 手动精选评论 ✅ · 手动评分 ✅ · 手动分类 ✅ · AI 关闭可运行 ✅ · 外部 Markdown 路径 ✅ · 文件移动恢复 ✅（软警告 + 哈希追踪 0.7.0） · 低空间占用 ✅ · AI API 模式 ✅ · AI 插件复用 ✅ · Manual 模式 ✅ · 安全（不存密码/可暂停/本地加密/登录窗口不接触凭据） ✅

## 五、剩余差距（按优先级建议）

1. **文件增强分析 · PDF 部分**（P1，可选）：Markdown 已覆盖；PDF 章节解析需引入解析依赖，按「禁止全文提取」原则暂缓，保持 skipped。
2. **文件类型渲染（方式C）**（P1）：文档化推荐渲染插件清单（Docxer 等）与组合方式。
3. **个性化 AI 建议**（V2.0 末）：基于 user_feedback 历史调整建议权重（事件数据 0.6.0 起已积累）。
4. **存储升级项**（P2）：SQLCipher 可选库加密、macOS Keychain / Windows Credential Manager 凭据托管。
5. **V3.0 生态项**：更多平台（知乎/GitHub Star/Reddit/…）、知识图谱可视化、AI Agent 主动整理 —— 按 PRD 节奏不在当前版本。
6. **Datasette 调试界面**（P2，长期保留）。

## 六、分版本补齐记录

| 提交 | 内容 |
| --- | --- |
| fd825e9 | TASK_LOGIN 可视化登录引导（PRD 26.1②③）：有头持久化窗口 + Cookie 标记轮询 + 页面探测兜底 + 自动加密保存 |
| eefa520 | Topic/Tag 聚合页系统区/用户区隔离 + Dataview 动态索引 + aliases + 重命名文件跟随（Topic 重心基建） |
| 42af8ad | 本地语义关联 TF-IDF（规则开关）接入 Related Collections 三级链路 |
| cccbfbe | 超期提醒统计（规则驱动）+ user_feedback 用户行为事件采集（PRD 18.1/21.1） |
| 8365799 | 系列手动管理（加入/移出/整组并入 + 系列进度，PRD 24）+ Topic 合并（PRD 17）+ 文件哈希追踪与丢失恢复（PRD 9.7）+ Markdown 增强 TOC 分析（PRD 9.4）+ 修复重扫清空关联的仓储缺陷 |
| 0.8.0 | 市面工具借鉴轮（保持插件/本地优先形态）：关键字检索与批量复制链接（借鉴 [Karakeep](https://karakeep.app/) / Eagle 类工具）；今日回顾随机重现（借鉴 [Readwise Daily Review](https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights)）；Manual AI 模板注入受控词表（借鉴 [Cubox](https://help.cubox.pro/) 智能标签体系）——均为本地实现，不引入服务端依赖 |
| 0.9.0 | 收纳与外观轮：智能视图预设条（借鉴 [Eagle Smart Folders](https://en.eagle.cool/)）；卡片视图重设计——16:9 封面、平台强调条、悬浮抬升、覆盖式状态角标；平台品牌色识别（B站/YouTube/小红书/MakerWorld/小黑盒）；详情页系列进度条；全部遵循 [Obsidian CSS 变量](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables)自动适配明暗主题 |
