# Omni Collector

Omni Collector is a desktop-only Obsidian plugin that syncs your favorites and likes from Bilibili, YouTube, Xiaohongshu (Little Red Book), MakerWorld and Xiaoheihe into your vault. It supports AI tagging suggestions (Tag / Topic / Group / Summary), a Tag Atlas with aliases, Topic hub notes linked into the Obsidian graph, local file indexing, and an optional local sync engine (Node.js).

**Highlights**

- Full catalog sync (titles, URLs, covers) for all five platforms.
- Tag Atlas: platform hashtags are extracted automatically, near-duplicate tags can be merged, aliases resolve to one canonical tag.
- Tag and Topic hub notes create bidirectional links in the Obsidian graph view.
- AI suggestions are always reviewed by you before they are written.
- Manual AI mode works without an API key: copy a packed template (single or batch), paste the AI reply, review and confirm.
- Rate favorites 1–5 stars and star comments; both are materialized into the Markdown user zone (PRD 29.2 / 7.3) and sortable in the list.
- Sync schedules, rule center, per-platform health lights and anomaly stats are built in.

全平台收藏同步与本地知识管理工具（Obsidian Plugin + 独立本地同步引擎）。

把 **B站 / YouTube / 小红书 / MakerWorld / 小黑盒** 的收藏、点赞、稍后再看自动同步进 Obsidian，并提供 AI 整理建议（Tag / Topic / 分组 / 摘要）、跨平台内容关联、本地文件索引与 Tag Atlas 标签体系。

## 功能

### 平台同步

- B站：全部收藏夹 + 稍后再看（WBI 签名直连，评论采集）
- YouTube：Liked 全量列表（yt-dlp + cookies，字幕提取默认关闭）
- 小红书：收藏 + 点赞（x-s 签名直连，分页全量）
- MakerWorld：收藏 + 点赞（可选开关，Cloudflare 持久化会话）
- 小黑盒：帖子收藏全量（浏览器驱动，失效内容保留并标记）

初始同步按 PRD v4.2 拉取所有收藏的标题 / URL / 封面（轻量元数据）；完整详情按需执行。

### 本地知识管理

- 收藏列表：纯文字 / 卡片缩略图双视图，平台 / 类型 / 状态 / 优先级过滤
- 内容预览：B站 / YouTube 官方嵌入播放器、正文按需抓取（不落盘）、评论展示
- 整理工作流：未整理 → 已查看 → 已整理 → 已归档；优先级（普通/重要/项目/知识）
- 手动评分 1~5 星（PRD 29.2）与精选评论（PRD 7.3）：操作物化进 Markdown 用户区，SQLite 同步副本，列表支持按评分排序
- 稍后再看独立处理：转收藏 / 归档完成
- 手动 Tag / Topic + 批量操作（批量 Tag / Topic / 优先级 / 整理 / 转收藏 / 归档）
- Tag Atlas：平台标签自动提取、别名系统、疑似重复一键合并、Tag/Topic 聚合页接入官方关系图谱（双链）
- Related Collections：同 ContentGroup 或同实体跨平台关联
- 本地文件：多目录扫描（.md / .pdf），按系统区 URL 自动关联收藏；自动 / 手动扫描
- Markdown 协议：系统区（Engine 自动写入）与用户区（永不覆盖）隔离，Dataview 模板

### AI（可选，默认关闭）

- 批处理队列（单批 ≤100 条，input_hash 去重，失败隔离）
- Suggestion 审核机制：AI 只生成建议，用户确认后才写入
- 功能级开关：Tag / Topic / 摘要可分别启用，每日调用上限（默认 50）
- **Manual 模式（PRD 19.3）**：复制提示词模板到任意 AI 工具，粘贴回复自动解析为建议；支持批量打包 N 条收藏一次处理
- Provider：DeepSeek / OpenAI（OpenAI 兼容接口）

### 同步计划与规则中心

- 各平台自动同步频率（每日 / 每周）、随机执行窗口、单日同步上限（总开关默认关闭）
- 规则中心：全部业务规则统一查看 / 修改 / 恢复默认，带变更记录
- 平台健康指示灯（绿 / 黄 / 红 + 原因）与异常内容统计（下架 / 同步失败 / 文件丢失）

## 架构

```
Obsidian Plugin (apps/obsidian-plugin)
   └── 本地 Socket / WebSocket 通信 (packages/shared-core 协议)
         └── 独立 Engine (apps/engine, Node.js)
               ├── Adapters (packages/adapters): 五平台采集
               ├── AI Queue (packages/ai): 批处理 / 建议
               ├── SQLite (packages/database): 收藏 / 评论 / 建议 / 分组 / 文件索引
               └── ContentGroup / FileIndex / Scheduler
```

Cookie 只保存在本地数据目录（AES-256-GCM 加密，`data/cookies/*.enc`），不上传。

## 安装

### 平台登录 / Cookie 设置（必读）

> [!IMPORTANT]
> **The plugin cannot log you in.** You must log in to each platform in your own browser first, then import the cookies into the plugin.

1. Install the **Cookie-Editor** browser extension (search it in the Chrome or Edge extension store).
2. Log in to the platform in your browser (e.g. https://www.bilibili.com or https://www.xiaohongshu.com).
3. On the logged-in page, open Cookie-Editor → **Export** → **Copy as JSON**.
4. Open Obsidian → Omni Collector settings → **Platform Cookie** → pick the platform → paste the JSON → click **Import**.
5. Run the sync from the Omni Collector sidebar.

> Both Cookie-Editor JSON arrays and `k=v; k2=v2` header strings are accepted. Cookies are encrypted and stored only in your local data directory (`data/cookies/*.enc`); they are never uploaded.

> [!IMPORTANT] 中文版
> 插件无法代替你登录。请先在浏览器里登录平台，再用 **Cookie-Editor** 扩展导出 Cookie 后导入插件：
> ① 安装浏览器扩展 Cookie-Editor（Chrome / Edge 商店搜索）→ ② 浏览器登录平台（如 bilibili.com / xiaohongshu.com）→ ③ 在登录页点 Cookie-Editor 图标 → Export → Copy as JSON → ④ Obsidian → Omni Collector 设置 → 「平台 Cookie」→ 选择平台 → 粘贴 JSON → 点「导入」→ ⑤ 回侧边栏同步。
> 支持 JSON 数组和 `SESSDATA=xxx; bili_jct=yyy` 字符串格式；Cookie 只加密保存在本地 `data/cookies/*.enc`，绝不上传。

### 通过 BRAT（推荐，正式上架前）

1. 安装 [BRAT](https://obsidian.md/plugins?id=obsidian42-brat)
2. 添加仓库：`simonemuller6127-png/omni-collector`

### 手动安装

1. 从 GitHub Releases 下载 `main.js` / `manifest.json` / `styles.css` 三个文件
2. 放入 `<你的库>/.obsidian/plugins/omni-collector/`（目录不存在则新建）
3. Obsidian 设置 → 第三方插件 → 启用 Omni Collector
4. 在插件设置中填写数据目录 / Node.js 路径 / Engine 路径

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

部署 Engine：

```bash
node apps/engine/scripts/deploy.mjs --data-dir <你的数据目录>
```

## License

MIT
