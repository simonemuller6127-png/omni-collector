# Omni Collector (Obsidian Plugin)

全平台收藏同步与本地知识管理：把 B 站 / YouTube / 小红书 / MakerWorld / 小黑盒 的收藏与点赞自动同步进 Obsidian，并提供 AI 整理建议（分组 / Topic / Tag）与本地知识管理。

> 插件依赖独立运行的 **Engine**（Node.js + Playwright），首次使用请先部署 Engine（见下文「接入 Obsidian」）。

## 功能

- 五平台收藏 / 点赞同步（小红书走签名直连，MakerWorld 需一次性通过 Cloudflare 验证）
- Markdown 收藏卡片 + Dataview 查询模板
- AI 批处理建议（Tag / Topic / 分组）与人工审核
- ContentGroup 跨平台关联识别（同实体 / 系列）
- 收藏整理状态与优先级管理

## 接入 Obsidian

1. 构建插件：`pnpm --filter @omni/obsidian-plugin build`
2. 部署 Engine：`node apps/engine/scripts/deploy.mjs --data-dir <你的数据目录>`
3. 复制插件：把 `main.js`、`manifest.json`、`styles.css` 放入 `<vault>/.obsidian/plugins/omni-collector/`
4. Obsidian 设置 → 第三方插件 → 开启 Omni Collector（如未显示，先开启「开发者模式」）
5. 设置里填写数据目录，点击功能区图标启动 Engine 并触发首次同步

## 开发

```bash
pnpm install
pnpm --filter @omni/obsidian-plugin build
pnpm test
```

## License

MIT
