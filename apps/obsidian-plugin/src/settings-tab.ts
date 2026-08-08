import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type OmniCollectorPlugin from "./main.js";

/** 设置页：用户可配置项（当前：MakerWorld 是否同步点赞内容）。 */
export class OmniSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: OmniCollectorPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Omni Collector" });

    containerEl.createEl("h3", { text: "AI" });
    new Setting(containerEl)
      .setName("启用 AI 整理建议")
      .setDesc("开启后同步完成的收藏会进入 AI 队列（批处理，单批 ≤100 条）。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.pluginSettings.aiEnabled).onChange(async (value) => {
          this.plugin.pluginSettings.aiEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateRule("ai_enabled", String(value));
        }),
      );
    new Setting(containerEl)
      .setName("AI Provider")
      .setDesc("deepseek 或 openai（OpenAI 兼容接口）。")
      .addDropdown((dd) =>
        dd
          .addOption("deepseek", "DeepSeek")
          .addOption("openai", "OpenAI")
          .setValue(this.plugin.pluginSettings.aiProvider)
          .onChange(async (value) => {
            this.plugin.pluginSettings.aiProvider = value;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("ai_provider", value);
          }),
      );
    new Setting(containerEl)
      .setName("AI API Key")
      .setDesc("只保存在本地数据目录的规则表中，不会上传。")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.pluginSettings.aiApiKey)
          .onChange(async (value) => {
            this.plugin.pluginSettings.aiApiKey = value;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("ai_api_key", value);
          }),
      );
    new Setting(containerEl)
      .setName("AI 模型")
      .setDesc("留空使用 Provider 默认模型（DeepSeek: deepseek-chat / OpenAI: gpt-4o-mini）。")
      .addText((text) =>
        text
          .setPlaceholder("deepseek-chat")
          .setValue(this.plugin.pluginSettings.aiModel)
          .onChange(async (value) => {
            this.plugin.pluginSettings.aiModel = value;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("ai_model", value);
          }),
      );

    containerEl.createEl("h3", { text: "同步" });
    new Setting(containerEl)
      .setName("同步模式")
      .setDesc("catalog = 轻量目录（快）；full = 含详情/评论（慢）。「同步全部」使用此模式。")
      .addDropdown((dd) =>
        dd
          .addOption("catalog", "轻量目录 (catalog)")
          .addOption("full", "完整详情 (full)")
          .setValue(this.plugin.pluginSettings.initialSyncMode)
          .onChange(async (value) => {
            this.plugin.pluginSettings.initialSyncMode = value as "catalog" | "full";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("同步 MakerWorld 点赞内容")
      .setDesc("开启后，MakerWorld 同步除了收藏夹，还会采集你点赞过的模型（默认关闭）。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.pluginSettings.makerworldSyncLikes)
          .onChange(async (value) => {
            this.plugin.pluginSettings.makerworldSyncLikes = value;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("makerworld_sync_likes", String(value));
          }),
      );

    containerEl.createEl("h3", { text: "Engine" });
    new Setting(containerEl)
      .setName("Node.js 路径")
      .setDesc("Engine 子进程使用的 Node 可执行文件；留空则使用 PATH 中的 node（Windows 可填完整路径）。")
      .addText((text) =>
        text
          .setValue(this.plugin.pluginSettings.nodeBin)
          .onChange(async (value) => {
            this.plugin.pluginSettings.nodeBin = value;
            await this.plugin.saveSettings();
            this.plugin.updateEngineNodeBin();
          }),
      );
  }
}
