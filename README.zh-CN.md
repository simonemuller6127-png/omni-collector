# Omni Collector

[English](README.md) · **简体中文**

**把散落在各个平台的收藏，变成 Obsidian 里找得到的资料库。**

将 **B站、YouTube、小红书、MakerWorld、小黑盒** 的收藏条目同步进笔记库，统一检索、按标签和主题整理，再与自己的笔记关联。

[![最新版本](https://img.shields.io/github/v/release/simonemuller6127-png/omni-collector)](https://github.com/simonemuller6127-png/omni-collector/releases/latest)
[![MIT 开源协议](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Obsidian 桌面端](https://img.shields.io/badge/Obsidian-desktop-7C3AED)](https://obsidian.md)

[开始安装](#安装) · [功能介绍](#功能) · [隐私与使用边界](#隐私与使用边界) · [反馈问题](https://github.com/simonemuller6127-png/omni-collector/issues)

> [!IMPORTANT]
> 项目仍处于早期迭代阶段，**仅支持 Obsidian 桌面端，必须配置本地 Node.js 同步引擎**。只安装插件的三个文件并不代表完成安装。AI 为可选功能，默认关闭。
>
> 本文介绍已发布的 **0.9.0**。默认分支中的程序代码可能较旧；安装时请使用发行版附件和对应源码标签，不要直接下载仓库根目录的 `main.js`。

## 它解决什么问题？

B站收藏了教程，小红书存了灵感，小黑盒收了攻略——它们可能属于同一个项目，却要到不同平台反复翻找。

1. **收集：** 同步收藏的标题、来源链接和封面。
2. **找回：** 跨平台检索，按状态、优先级、标签和主题筛选。
3. **关联：** 将相关收藏放进同一主题，与自己的 Obsidian 笔记建立链接。
4. **回顾：** 通过回顾和超期提醒，重新打开那些“以后再看”的内容。

它是收藏资料的索引与整理工具，**不是把所有原文和视频完整下载到本地的永久备份工具**。

## 支持的平台

| 平台 | 同步范围 |
| --- | --- |
| B站 | 收藏夹、稍后再看 |
| YouTube | 点赞视频；需要单独安装 yt-dlp 并配置 Cookie 文件 |
| 小红书 | 收藏、点赞 |
| MakerWorld | 收藏、可选的点赞同步 |
| 小黑盒 | 帖子收藏；失效条目保留并标记 |

初始同步以标题、链接和封面等轻量元数据为主；平台支持的详情按需获取。实际可用性受平台改动、权限及登录状态影响，各平台可获取的详情字段并不完全相同。

## 功能

### 检索与整理

- 文字列表与封面卡片双视图，关键词检索、多条件过滤、批量复制链接。
- 智能视图：未整理、本周新增、高优先级、已评分、稍后再看等。
- 整理状态、优先级、1～5 星评分、精选评论和批量操作。
- 跟随 Obsidian 主题的明暗外观，平台颜色和状态标记。
- B站 / YouTube 嵌入播放器，以及平台支持的按需内容预览。

### 建立知识关联

- **标签图谱（Tag Atlas）：** 提取平台标签，维护别名，合并重复标签。
- **主题（Topic）：** 生成带双链和 Dataview 索引的聚合笔记，支持主题合并与重命名。
- **系列（Series）：** 自动识别与手动维护，跟踪系列内容的整理进度。
- 通过内容分组、相同实体及可选的本地 TF-IDF 相似度关联收藏。
- 扫描本地 Markdown / PDF 文件，通过来源链接关联收藏；可选文件哈希跟踪用于恢复移动后的关联。
- Markdown 的自动生成区与用户编辑区分离，更新时保留自己的笔记。

### 可选的 AI 辅助

- 为标签、主题、分组和摘要提供建议，**经你审核后再应用**。
- 手动模式：复制单条或批量提示词到自己选择的 AI 工具，再粘贴回复进行审核；此模式不需要在插件中配置 API Key。
- 手动提示词参考已有标签和主题，尽量保持命名一致。
- API 模式支持 DeepSeek 和 OpenAI 兼容服务，提供功能开关与每日调用上限。

### 让收藏持续有用

- 今日回顾、超期提醒，以及独立的稍后再看处理流程。
- 各平台同步计划、每日上限与规则中心；自动同步计划默认关闭。
- 平台健康指示，以及失效内容、同步失败和文件丢失统计。

## 安装

### 1. 安装前提

- **Obsidian 桌面端 1.5.0+**，不支持手机插件运行。
- 下方源码部署需要 Git、**Node.js 24 LTS（24.12+）** 和 **pnpm 9**。锁定依赖所需的 Node 版本高于仓库较旧的 `>=20` 声明。
- 浏览器相关功能需要 Playwright Chromium；使用 YouTube 还需单独安装 yt-dlp。
- 对应平台的账号，以及访问待同步收藏的权限。

当前部署脚本会链接本机依赖，因此请保留源码目录及其 `node_modules`。部署后的引擎目录**不是可以随意搬到另一台电脑的独立安装包**。以下路径示例采用 Windows；本次文档更新未验证其他系统上的运行情况。

### 2. 安装插件

**通过 BRAT：** 安装 [BRAT](https://obsidian.md/plugins?id=obsidian42-brat)，添加仓库 `simonemuller6127-png/omni-collector`；若提示选择版本，请选 `0.9.0`。确认安装后的插件版本与引擎源码版本匹配。

**手动安装：** 从 [0.9.0 发行版](https://github.com/simonemuller6127-png/omni-collector/releases/tag/0.9.0) 下载 `main.js`、`manifest.json`、`styles.css`，放入 `<笔记库>/.obsidian/plugins/omni-collector/`，再到 Obsidian 第三方插件设置中启用。

打开一次插件设置以初始化配置，然后在下方修改配置文件前关闭 Obsidian。发行版附件只包含插件，不包含引擎及其依赖。

### 3. 构建并部署对应版本的引擎

在终端中执行。请使用新目录，不要在含有未保存改动的源码目录中切换版本。

```bash
git clone --branch 0.9.0 --depth 1 https://github.com/simonemuller6127-png/omni-collector.git omni-collector-0.9.0
cd omni-collector-0.9.0
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @omni/engine exec playwright install chromium
node apps/engine/scripts/deploy.mjs --data-dir "<数据目录绝对路径>"
```

将 `<数据目录绝对路径>` 替换为自己的本地目录，例如 `D:/OmniCollectorData`。必须先构建再部署。Chromium 应安装在运行 Obsidian 的同一系统账号下；Linux 可能还需安装 Playwright 的系统依赖。

### 4. 配置引擎路径

0.9.0 的数据目录与引擎脚本路径存于配置文件，**设置界面中尚无这两个字段的输入控件**。关闭 Obsidian 后，备份 `<笔记库>/.obsidian/plugins/omni-collector/data.json`，再修改其中以下字段，保留其他配置不变：

```json
{
  "dataDir": "D:/OmniCollectorData",
  "engineScript": "D:/OmniCollectorData/engine/engine.cjs",
  "nodeBin": "C:/Program Files/nodejs/node.exe"
}
```

这只是字段示例，**不能拿它直接覆盖整个文件**。使用自己的实际绝对路径，并确保 JSON 格式正确。部署脚本输出的是 `engine.cjs`，而插件初始默认指向 `index.js`，两者需要手动对齐。Node.js 可执行文件路径请明确填写，不要留空。

重新打开 Obsidian，从 Omni Collector 侧边栏启动引擎。配置完成后，插件可以自行启动本地引擎。

### 5. 登录平台并完成首次同步

在插件设置的 Cookie 区域选择平台，点击**登录窗口**，在平台页面中自行登录，引擎会在本地保存得到的会话。也可导入 Cookie-Editor 导出的 JSON 或 `k=v; k2=v2` 格式的 Cookie 字符串。不要把 Cookie 发给作者，也不要贴进 Issue。

建议先启用一个平台，确认引擎连接成功、同步完成、收藏的来源链接可以打开，再开启定时同步。

**YouTube 还需要额外配置：** 单独安装 yt-dlp，并确保引擎能够调用。0.9.0 会读取 `<dataDir>/ytdl_cookies.txt`，要求使用 yt-dlp 支持的 Netscape Cookie 文件格式；普通 Cookie 导入不会自动生成这个文件。它是敏感的明文凭据文件，需妥善保管。安装及 Cookie 文件要求参见 [yt-dlp 文档](https://github.com/yt-dlp/yt-dlp#readme)。

## 隐私与使用边界

- 资料库和引擎数据保存在本地；访问来源平台时仍会使用登录会话。“本地”不等于“离线”。
- Cookie 存储模块管理的凭据使用 AES-256-GCM 加密，位于 `<dataDir>/cookies/*.enc`。浏览器配置目录和单独的 yt-dlp Cookie 文件同样敏感，不应认为所有会话文件都具有相同的加密保护。
- 可选的 API AI 会把待处理内容发送给你配置的服务商；手动模式会将你粘贴的内容分享给所选 AI 工具。发送前请自行检查。
- 同步不保证永久保存完整原文或视频。原内容删除、登录过期及平台改动都可能影响结果。
- 仅使用自己的账号或明确获授权的内容，遵守各平台条款和内容权利要求。本项目与所支持的平台无隶属关系。
- 大规模同步或整理前请备份笔记库。不要把引擎数据库、Cookie、浏览器配置和插件凭据放进公开仓库或共享同步目录。

## 与 Obsidian 配合使用

生成的笔记使用原生标签和双链。Dataview 可用于动态索引，Breadcrumbs 可辅助构建自己的主题层级。为保持数据库与笔记一致，标签改名和合并建议优先使用插件内的标签图谱功能。

生成的笔记可通过你选择的笔记库同步工具同步；各设备的引擎数据与凭据应独立保存。其他 Obsidian 插件有各自的隐私行为和配置要求。

## 架构与开发

```text
Obsidian 桌面插件
  └── 本地 IPC / WebSocket 通信
        └── Node.js 引擎
              ├── 各平台适配器
              ├── 可选的 AI 建议队列
              ├── SQLite 资料库与本地文件索引
              └── Markdown 生成与同步调度
```

插件位于 `apps/obsidian-plugin`，引擎位于 `apps/engine`，共享包位于 `packages/`。参与开发请使用 `dev` 分支；部署已发布版本则使用上文对应的版本标签。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## 反馈与支持

欢迎[提交 Issue](https://github.com/simonemuller6127-png/omni-collector/issues)，说明插件版本、操作系统、涉及平台、预期行为和已脱敏的复现步骤。日志与截图请移除 Cookie、Token、登录二维码和个人信息。

如果它帮你重新找回了收藏，欢迎点一个 Star，或分享自己的真实整理流程，让有同样需求的人找到项目。问题反馈、文档改进和翻译也同样有帮助。

## Star 增长趋势

[![Star 增长趋势图](https://api.star-history.com/svg?repos=simonemuller6127-png/omni-collector&type=Date)](https://star-history.com/#simonemuller6127-png/omni-collector&Date)

图表由 Star History 提供，可能存在缓存延迟。图片未加载时，可[打开交互图表](https://star-history.com/#simonemuller6127-png/omni-collector&Date)。

## 开源协议

[MIT](LICENSE)
