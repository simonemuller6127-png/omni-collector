# Omni Collector 错误码手册

错误码格式：`MODULE_NNN`（TDD Part 10）。Engine 通过 `TASK_ERROR` payload、`SyncReport.errorCode/errorDetail` 返回；插件内置同源解释（`apps/obsidian-plugin/src/errors.ts`），同步失败 Notice 与侧边栏平台状态悬浮提示会自动附带「含义 + 修复方法」。

## AUTH_* 认证 / 会话

| 码 | 标题 | 含义 | 修复 |
| --- | --- | --- | --- |
| AUTH_002 | 平台会话失效 | 登录态（Cookie/storageState）过期或无效；v0.9.1 前会静默抓到 0 条仍报 success，之后同步入口先校验会话并显式报错 | 设置 → Omni Collector → 对应平台「登录窗口」重新登录，成功后自动抓取 Cookie |
| AUTH_003 | Cookie 状态查询失败 | 平台名无效或本地加密存储读取失败 | 重新导入 Cookie 或重新登录 |

## LOGIN_* 登录流程

| 码 | 标题 | 含义 | 修复 |
| --- | --- | --- | --- |
| LOGIN_001 | 登录流程失败 | 平台不支持 / 等待超时（300s）/ 窗口被提前关闭 | 重开登录窗口，保持窗口打开完成登录 |

## SYNC_* 同步

| 码 | 标题 | 含义 | 修复 |
| --- | --- | --- | --- |
| SYNC_001 | 同步抓取/入库失败 | 平台风控（B 站 -412）、接口变更、网络波动、单条数据缺字段；B 站分页失败会中止本次同步而不是静默漏单 | 看 errorDetail 中的平台错误码，稍后重试 |
| SYNC_002 | 同步任务派发失败 | Engine 层异常（数据库占用、浏览器实例启动失败） | 重启 Engine 后重试 |
| SYNC_003 | 评论批量刷新失败 | 批量抓取评论失败 | 减少天数重试；确认对应平台登录态 |

## COMM / QUERY / RULE

| 码 | 标题 | 含义 | 修复 |
| --- | --- | --- | --- |
| COMM_001 | 通信错误 | 插件 ↔ Engine 请求失败或超时 | 启动 Engine / 重启 Obsidian |
| QUERY_001 | 查询失败 | 收藏不存在或数据库读取异常 | 刷新列表 |
| RULE_001 | 规则更新失败 | 缺 rule_key 或值非法 | 检查设置项 |
| RULE_002 | 规则读取失败 | 规则中心读取异常 | 重启 Engine |

## AI_*（AI_001 预留）

| 码 | 标题 | 修复 |
| --- | --- | --- |
| AI_002 | 未配置 AI Provider / 缺 collection_id | 设置里填 API Key |
| AI_003 | AI 任务执行失败 | 检查 Key/网络，看 Engine 日志 |
| AI_004 | 列出建议失败 | 重试 |
| AI_005 | 审核参数非法或建议不存在 | 刷新审核列表 |
| AI_006 | Manual AI 输入不完整 | 从收藏详情发起并粘贴完整回复 |
| AI_007 | 撤销失败（>24h 或记录缺失） | 手动修正 |
| AI_008 | Manual AI 批量输入不完整 | 重新生成批量模板 |

## 其他模块

| 码 | 标题 | 修复 |
| --- | --- | --- |
| ORG_001 | 整理状态参数非法 | 使用 unorganized/viewed/organized/archived |
| TAG_001~005 | Tag 增删改参数非法或不存在 | 检查名称 |
| TOPIC_001~003 / TPC_001 | Topic 参数非法或不存在 | 检查名称/ID |
| GRP_001~003 | 分组参数非法/不存在 | 检查名称 |
| PRI_001 / RAT_001 / STAR_001 / CONV_001 / BATCH_001 | 对应操作参数非法 | 按 UI 提示重试 |
| IDX_001 | 本地文件索引失败 | 确认目录存在可读 |
| FETCH_002 | 小红书正文 xsec_token 失效 | 重新同步该平台后再抓 |
| YTDLP_FAILED | yt-dlp 未安装/缺 cookies | 安装 yt-dlp，更新 YouTube Cookie |
| ENGINE_001 | Engine 已在运行（多开保护） | 删除数据目录 engine.lock |
| ENGINE_002 | 数据库迁移失败（已回滚备份） | 查看 Engine 日志 |

## 维护约定

1. Engine 新增错误码时，必须同步更新 `apps/obsidian-plugin/src/errors.ts`（含 title/meaning/fix）与本手册。
2. 适配器抛出的语义化错误码（如 `AUTH_002: ...`）由 SyncPipeline 透传到 `SyncReport.errorCode`，插件据此匹配文档。
3. 同步「成功但 0 条」不再是合法状态：会话失效、分页失败都必须显式报错（防止静默漏单回归，见 2026-09 B 站漏单事故）。
