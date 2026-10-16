# Omni Collector 自主迭代工作流程

> 记录本人（ZCode 代理）从 0.5.4 迭代到 0.9.0 的完整工作思路与流程，便于他人/后续会话复用。
> 核心原则：**长期任务一做到底、自主推进、自动构建测试并推送 GitHub**。

## 1. 总体思路

1. **以 PRD 为锚**：每个版本都对照 PRD v4.2 验收项（`docs/PRD-gap-analysis.md`）挑选待补项，确保每轮都有可见价值。
2. **以市面工具为镜**：调研同类定位产品（Karakeep、Readwise、Cubox、Eagle、Obsidian 社区插件）只借鉴交互范式与外观模式，**不引入服务端依赖**——本项目坚持"Obsidian 插件 + 本地 Engine + 本地加密数据"形态。
3. **以测试为安全网**：纯函数/数据结构先写测试再实现或并行；UI 改动最少保留纯函数模块（如 `helpers.ts` / `manual-template.ts`）单测覆盖。
4. **以发版为节奏**：每个版本构建 7/7、测试 12/12 全绿后，commit → tag → 推送，CI 自动产出 Release。版本号语义化：`0.x.y`。

## 2. 单轮工作流程（5 步）

```
[1] 选型 → [2] 设计 → [3] 实现+测试 → [4] 文档+发版 → [5] GitHub 推送
```

### [1] 选型：差距/借鉴/紧急
- 查 `docs/PRD-gap-analysis.md` 待办区域
- 视情况：调研市面工具 → 选 1~4 个可落地借鉴点（不引外部依赖）
- 限定单轮工作量为"一做到底"的合理范围（一般 ≤ 5 个子任务）

### [2] 设计：协议先行
- 协议消息类型先加 `packages/shared-core/src/comm.ts`（消息名 + 必填字段）
- DTO 扩展先在 `packages/shared-core/src/dto.ts` 留出字段
- 仓储/迁移若涉及，在 `packages/database/migrations/0XX_*.sql` 写迁移
- 这三步是其它层的"接口"，先稳定可避免返工

### [3] 实现+测试（自下而上）
- **数据库层**：`packages/database/src/repositories/*.ts`
- **领域层（引擎）**：`apps/engine/src/{sync,group,ai,...}/*.ts` + `apps/engine/src/comm/task-service.ts` 处理器注册
- **客户端层（共享）**：`packages/shared-core`（已通过步骤 [2] 落地）
- **插件层**：`apps/obsidian-plugin/src/comm/socket-client.ts` 加方法；UI 视图、侧边栏、详情、设置接线
- **测试**：
  - 引擎：`apps/engine/test/*.test.ts`（task-service 集中收口）
  - 插件：`apps/obsidian-plugin/test/*.test.ts`（纯函数模块，规避 obsidian 包解析问题）
  - 遇到"测试环境解析不到 obsidian"时，把纯函数抽到 `src/ui/xxx-template.ts`、`src/ui/helpers.ts` 等无 obsidian 依赖的模块

### [4] 文档+发版
- `README.md` 功能列表补一条
- `docs/PRD-gap-analysis.md` 状态更新 + 分版本补齐记录表加一行
- 同步根目录 `main.js` / `styles.css`（发布包副本）从 `apps/obsidian-plugin/dist/`
- `manifest.json` / `versions.json` 升版本号
- commit message 风格：`feat/release/fix: ... (0.x.y[-a/b/c])`
- tag 用纯数字（CI 触发 Release：`on: push: tags: [0-9]*`）

### [5] GitHub 推送
- 优先直连 `git -c http.proxy= -c https.proxy= push`（代理易握手失败）
- 失败时循环重试 + `ls-remote --tags` 验证是否上推
- 拉莫一两个提交都没上时检查 `git status` 是否有未跟踪的重要文件被误排除

## 3. 关键工程规范

| 主题 | 规范 | 原因 |
|---|---|---|
| 区域隔离 | Markdown 区域：系统区标记注释（`OMNI_SYSTEM_START/END`）+ frontmatter；用户区永不覆盖 | ADR-006/011，Topic 重心必备 |
| 协议必填字段 | 新消息类型必须把 payload 必填字段加进 `REQUIRED_PAYLOAD_FIELDS` | 防握手失败难排查 |
| 规则中心 | 业务数值/开关一律从 `business_rules` 读，不硬编码 | 单一修改入口（PRD 21.1） |
| 本地优先 | 不引任何云依赖；可选 API（DeepSeek/OpenAI）通过设置显式配置 | 用户隐私 + 上架合规 |
| Cookie 安全 | `data/cookies/*.enc` AES-256-GCM 加密，仅本地，绝不上传 | 0.6.0 PRD 26.1 |
| Git 代理 | 推送优先直连，失败回退代理重试 | 本机代理握手不稳 |

## 4. 历次迭代记录（摘要）

| 版本 | 提交 | 内容 | 状态 |
|---|---|---|---|
| 0.5.4 | `02ac30c` | 手动评分 / 精选评论 / Markdown 用户区物化 | ✅ |
| 0.6.0 | `fd825e9 / eefa520 / 42af8ad / cccbfbe / c261454` | 登录窗口 / Topic hub 隔离 / 本地语义 / 反馈事件 / 超期 | ✅ |
| 0.7.0 | `8365799 / 802b804 / f6dd199` | 系列手动 / Topic 合并 / 哈希追踪 / 增强分析 | ✅ |
| 0.8.0 | `1cc2268` | 关键字检索 / 今日回顾 / 受控词表 Manual AI / 复制链接 | ✅ |
| 0.9.0 | `7d96b19` | 智能视图预设 / 卡片 16:9 / 平台品牌色 / 系列进度条 | ✅ |

## 5. 持续可改进的工程项

- 内部模块继续拆出 `src/ui/*-template.ts` 等无 obsidian 依赖的纯函数层（提升测试覆盖率）
- 增量构造大文件测试 fixture（避免在多用例里重复创建临时目录）
- `release.yml` 可考虑加 `coverage` 报告与 license 头检查
- `package.json` BOM 陷阱已修复，但 PR/Issue 模板可加 lint 提示
