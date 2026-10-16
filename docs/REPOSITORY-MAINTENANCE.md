# 仓库占用与缓存清理指南

> 回答两个问题：**"内存现在占用了多少？又有多少是必要文件？"** 与 **"缓存的储存占用了多少？哪个阶段可以删除？会有什么影响？"**
> 适用于 `D:\Github\My_Project\omni-collection`（**Obsidian 插件 + 本地 Engine 工程**）。

## 1. 当前占用盘点（截至 0.9.0 后）

> 在 Git Bash 运行 `du -sh` 得到。**`node_modules` / `dist` / `data` / `_codex_tmp` 均被 `.gitignore` 排除，不会进入 GitHub。**

| 路径 | 大小 | 性质 | 是否可清理 |
|---|---|---|---|
| `node_modules/` | 168 MB | pnpm 软链展开，依赖缓存 | ✅ 可删（`pnpm install` 重生） |
| `apps/engine/dist/` | 964 KB | 引擎 ESM/CJS 编译产物 | ✅ 可删（`pnpm build` 重生） |
| `apps/obsidian-plugin/dist/` | 534 KB | 插件 esbuild 打包产物 | ✅ 可删（`pnpm build` 重生） |
| `packages/*/dist/` | 0.3 MB | 7 个包的构建产物 | ✅ 可删（`pnpm build` 重生） |
| `.turbo/` | 6.6 MB | Turbo 增量缓存 | ✅ 可删（`turbo` 自动重建） |
| `data/OmniCollector.db` | 336 KB | 用户数据库（**每个用户独立**，不应在仓库） | ✅ 可删（破坏用户数据，删前确认） |
| `data/backup/` | 896 KB | 迁移备份 | ✅ 可删（按版本生命周期） |
| `data/browser-profiles/` | **185 MB** | Playwright 持久化浏览器 Profile（含会话缓存） | ✅ 可删（**将触发 Cookie/会话失效**，下次同步需重新登录） |
| `data/browser-states/` | 140 KB | Playwright 存储状态（cookies + localStorage） | ⚠️ 可删但**会丢失已登录会话** |
| `data/cookies/*.enc` | 36 KB | 加密 Cookie | ⚠️ 可删但**会丢失平台登录** |
| `data/key.bin` | 1 KB | Cookie 加密主密钥 | ⚠️ 删除将让现有 `*.enc` 不可解密 |
| `data/ytdl_cookies.txt` | 4 KB | yt-dlp 使用的 cookie 文件 | ✅ 可删（YouTube 同步将失败直到重导） |
| `_codex_tmp/` | 52 MB | 本会话临时调试/抓取残留 | ✅ 可删（无视源码） |
| `apps/obsidian-plugin/node_modules/` 等 | 已纳入 `node_modules` 168 MB | – | – |
| `.git/` | 5.9 MB | Git 历史（必留） | ❌ 不可删 |
| **必要源码（git tracked）** | **1.1 MB（183 文件）** | 真正推送上 GitHub 的内容 | ❌ 不可删 |

**关键数据**：
- 真正上传到 GitHub 的源码 ≈ **1.1 MB**（183 个文件，源 TS + SQL + Markdown + 配置）
- 本地工作区 508 MB，其中 **370 MB 是不进仓库的运行时/构建/调试数据**（`data/` 187 MB + `node_modules` 168 MB + `_codex_tmp` 52 MB + `.turbo` 6.6 MB + `dist` 1.8 MB 等）

## 2. 缓存/构建产物按阶段清理建议

| 阶段 | 操作 | 命令 | 影响 |
|---|---|---|---|
| **日常调试** | 保留 `node_modules` 与 `.turbo`，仅改源码 | – | 增量构建几秒，无影响 |
| **大版本切换前** | 清理 `node_modules` + `.turbo` 后重装 | `rm -rf node_modules .turbo && pnpm install` | 首次构建慢（30~60s），解决依赖错位问题 |
| **构建产物可疑时** | 清理 `dist/` 后重建 | `rm -rf apps/*/dist packages/*/dist && pnpm build` | 仅本机调试用，重新构建即可 |
| **Playwright 浏览器异常时** | 删除对应平台 `data/browser-profiles/{platform}` | – | **该平台会重置为未登录**，需重新走登录窗口或导入 Cookie |
| **Cookie 加密主密钥丢失** | 删除全部 `data/cookies/*.enc` 与 `data/key.bin` | – | **所有平台退出登录**，需要全部重新走一次登录窗口（推荐） |
| **释放磁盘空间（不丢登录态）** | 清理 `_codex_tmp/` 与根目录生成 `Gemini_*.jpg` 之类临时大文件 | – | 无功能影响 |
| **彻底重置（破坏性）** | 删除 `data/` 全部 | – | 丢失所有已同步收藏的本地数据库（Vault 中的 Markdown 仍在，但 SQLite 需重同步才能让 Engine 看到收藏） |

> ⚠️ **风险声明**：`data/` 下的文件决定 Plugin/Engine 的"有状态体验"。删除前确认是否需要保留 `data/backup/` 中的最近一次迁移备份（默认保留 1 代）。`data/browser-profiles/` 单平台最大（185 MB 通常是 MakerWorld 持久会话），删除后该平台会回退到默认 cookie 模式。

## 3. 已确认被 .gitignore 覆盖的"非必要"路径

`.gitignore` 已正确隔离：
- `node_modules/`、`dist/`、`build/`、`out/`、`.turbo/`、`coverage/`
- `data/`、`logs/`、`cache/`、`backup/`（`backup` 也会被 .gitignore 屏蔽——用户应自留备份策略）
- `*.enc`（加密 Cookie）、`.worktrees/`
- `_codex_tmp/`（AI 临时调试区，**绝不提交**）
- 编辑器/OS 临时文件

仓库历史里从未跟踪过 `data/` 或 `_codex_tmp/`，**0 风险**。

## 4. 自检脚本

```bash
# 工作区占用概览
du -sh . 2>/dev/null

# 顶层非 .git/.turbo 占用
du -sh --exclude=.git --exclude=.turbo --exclude=node_modules */ 2>/dev/null | sort -hr

# 真正上传的源码（应恒定 ≈ 1.1 MB）
git ls-files | xargs -I {} wc -c {} | awk '{s+=$1} END {printf "%.1f MB\n", s/1024/1024}'

# 误入仓库检查（应为空）
git ls-files data _codex_tmp
```

## 5. 何时该清、不会影响什么

| 想做的事 | 删它 | 影响范围 |
|---|---|---|
| 升级 Node/pnpm 版本 | `node_modules` + `.turbo` | 无；下次 `pnpm install` 全量重装 |
| 解决"调试改了代码但运行没变" | `dist/`（特别是 `apps/obsidian-plugin/dist/main.js`） | 无；`pnpm build` 重新打包 |
| 解决"浏览器同步一直失败" | 对应平台的 `browser-profiles/{platform}` | **该平台需重新登录**；其它平台不受影响 |
| 解决"所有平台同步都失败 + 怀疑 key.bin 损坏" | `data/cookies/*.enc` + `data/key.bin` | 全部平台需重登录，但 1 次操作即可（用登录窗口） |
| 想要一个完全干净的开发环境 | `node_modules` + `.turbo` + `dist` + `_codex_tmp` | 无；首次构建稍慢 |
