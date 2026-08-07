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

    new Setting(containerEl)
      .setName("同步 MakerWorld 点赞内容")
      .setDesc("开启后，MakerWorld 同步除了收藏夹，还会采集你点赞过的模型（默认关闭）。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.pluginSettings.makerworldSyncLikes)
          .onChange(async (value) => {
            this.plugin.pluginSettings.makerworldSyncLikes = value;
            await this.plugin.saveSettings();
            try {
              await this.plugin.engine.updateRule("makerworld_sync_likes", String(value));
              new Notice(`MakerWorld 点赞同步已${value ? "开启" : "关闭"}`);
            } catch (err) {
              new Notice(`规则更新失败：${(err as Error).message}`);
            }
          }),
      );

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
