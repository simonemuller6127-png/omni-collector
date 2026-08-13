# Omni Collector

全平台收藏同步与本地知识管理工具（Obsidian Plugin + 独立本地同步引擎）。

把 **B站 / YouTube / 小红书 / MakerWorld / 小黑盒** 的收藏、点赞、稍后再看自动同步进 Obsidian，并提供 AI 整理建议（Tag / Topic / 分组 / 摘要）、跨平台内容关联、本地文件索引与万条级性能。

## 核心能力

### 平台同步
- **B站**：全部收藏夹 + 稍后再看（wbi 签名直连，评论采集）
- **YouTube**：Liked 全量列表（yt-dlp + cookies，字幕提取默认关闭）
- **小红书**：收藏 + 点赞（x-s 签名直连，分页全量）
- **MakerWorld**：收藏 + 点赞（可选开关，Cloudflare 持久化会话）
- **小黑盒**：帖子收藏全量（浏览器驱动，失效内容保留并标记）

初始同步按 PRD v4.2：**全量拉取所有收藏的标题 / URL / 封面**（轻量元数据）；完整详情按需执行。

### 本地知识管理
- 收藏列表：纯文字 / 卡片缩略图（小红书式错落布局）双视图，平台 / 类型 / 状态 / 优先级筛选
- 内容预览：B站 / YouTube 官方嵌入播放器、正文按需抓取（不落盘）、评论展示
- 整理工作流：未整理 → 已查看 → 已整理 → 已归档；优先级（普通/重要/项目/知识）
- 稍后再看独立处理：转收藏 / 归档完成
- 手动 Tag / Topic + 批量操作（批量 Tag / Topic / 优先级 / 整理 / 转收藏 / 归档）
- Related Collections：同 ContentGroup 或同实体跨平台关联
- 本地文件：多目录扫描（.md / .pdf），按系统区 URL 自动关联收藏；自动 / 手动扫描
- Markdown 协议：系统区（Engine 自动写入）+ 用户区（永不覆盖），Dataview 模板
- 封面本地缓存、正文 10 分钟缓存、1 万条收藏查询 <500ms

### AI（可选，默认关闭）
- 批处理队列（单批 ≤100 条，input_hash 去重，失败隔离）
- Suggestion 审核机制：AI 只生成建议，用户确认后才写入
- **Manual 模式（PRD 19.3）**：复制提示词模板到任意 AI 工具，粘贴回复自动解析为建议
- Provider：DeepSeek / OpenAI（OpenAI 兼容接口），设置中配置

## 架构

```
Obsidian Plugin (apps/obsidian-plugin)
  └─ 本地 Socket/WebSocket 通信 (packages/shared-core 协议)
        └─ 独立 Engine (apps/engine, Node.js)
              ├─ Adapters (packages/adapters): 五平台采集
              ├─ AI Queue (packages/ai): 批处理 / 建议
              ├─ SQLite (packages/database): 收藏 / 评论 / 建议 / 分组 / 文件索引
              └─ ContentGroup / FileIndex / Scheduler
```

Cookie 只保存在本地数据目录（AES-256-GCM 加密，`data/cookies/*.enc`），不上传。

## 快速开始

```bash
pnpm install
pnpm build
```

### 部署到 Obsidian

1. 构建插件：`pnpm --filter @omni/obsidian-plugin build`
2. 部署 Engine：`node apps/engine/scripts/deploy.mjs --data-dir <你的数据目录>`
3. 复制 `main.js` / `manifest.json` / `styles.css` 到 `<库>/.obsidian/plugins/omni-collector/`
4. Obsidian 设置 → 第三方插件 → 启用；在插件设置中填入数据目录 / Node.js 路径 / Engine 路径
5. 命令面板「立即同步（全部平台）」

### 平台登录

- 各平台需先在**你的真实浏览器**登录，导出 Cookie（JSON 数组格式）后写入 `data/cookies/{platform}.enc`（用 CookieCipher）
- MakerWorld 需一次性通过 Cloudflare 验证（引擎持久化 profile）
- B站 / 小红书触发风控时请停止自动化测试，冷却后重新登录

## 测试

```bash
pnpm test              # 默认跳过 live 测试（不访问外部平台）
OMNI_RUN_LIVE=1 pnpm test   # 显式运行 live 测试（需有效 Cookie）
```

## Release

打 tag（`v0.x.x`）自动触发 GitHub Actions 构建并发布 `main.js` / `manifest.json` / `styles.css` 资产。

## License

MIT
