import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type OmniCollectorPlugin from "./main.js";
import { FolderSuggest } from "./ui/folder-suggest.js";

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
      .setName("自动启动 Engine")
      .setDesc("请求收藏/同步时自动拉起 Engine；关闭后需手动点侧边栏「启动引擎」。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.pluginSettings.autoStartEngine).onChange(async (value) => {
          this.plugin.pluginSettings.autoStartEngine = value;
          await this.plugin.saveSettings();
          this.plugin.updateEngineAutoStart();
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

    containerEl.createEl("h3", { text: "本地文件" });
    new Setting(containerEl)
      .setName("已加入的目录")
      .setDesc("扫描这些目录中的 .md / .pdf，按系统区 URL 自动关联到收藏。")
      .addButton((btn) =>
        btn.setButtonText("立即扫描全部目录").setCta().onClick(() => {
          void this.plugin.scanAllLocalFolders();
        }),
      );
    const folderList = containerEl.createEl("div", { cls: "omni-folder-list" });
    const renderFolders = (): void => {
      folderList.empty();
      if (this.plugin.pluginSettings.localFolders.length === 0) {
        folderList.createEl("div", { text: "（尚未加入目录）", cls: "omni-meta-text" });
        return;
      }
      for (const folder of this.plugin.pluginSettings.localFolders) {
        const row = folderList.createEl("div", { cls: "omni-folder-row" });
        row.createEl("span", { text: folder, cls: "omni-folder-path" });
        row.createEl("button", { text: "移除", cls: "omni-btn omni-btn-sm" }).addEventListener("click", async () => {
          this.plugin.pluginSettings.localFolders = this.plugin.pluginSettings.localFolders.filter((f) => f !== folder);
          await this.plugin.saveSettings();
          renderFolders();
        });
      }
    };
    renderFolders();

    let newFolder = "";
    new Setting(containerEl)
      .setName("添加目录")
      .setDesc("可直接粘贴路径（自动去掉引号），或输入时从列表选择库内文件夹。")
      .addText((text) => {
        text.setPlaceholder("D:\\Obsidian\\Zukunftkai\\Omni Collector");
        text.onChange((v) => {
          newFolder = v.replace(/^["']|["']$/g, "");
        });
        new FolderSuggest(this.app, text.inputEl);
        return text;
      })
      .addButton((btn) =>
        btn.setButtonText("添加").onClick(async () => {
          const folder = newFolder.replace(/^["']|["']$/g, "");
          if (!folder) {
            new Notice("请输入目录路径");
            return;
          }
          if (!this.plugin.pluginSettings.localFolders.includes(folder)) {
            this.plugin.pluginSettings.localFolders = [...this.plugin.pluginSettings.localFolders, folder];
            await this.plugin.saveSettings();
            renderFolders();
          }
        }),
      );

    new Setting(containerEl)
      .setName("自动扫描")
      .setDesc("定时自动扫描已加入的目录（扫描是轻量索引，不会下载内容）。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.pluginSettings.localAutoScan).onChange(async (value) => {
          this.plugin.pluginSettings.localAutoScan = value;
          await this.plugin.saveSettings();
          this.plugin.reloadAutoScan();
        }),
      )
      .addDropdown((dd) =>
        dd
          .addOption("15", "每 15 分钟")
          .addOption("30", "每 30 分钟")
          .addOption("60", "每小时")
          .addOption("360", "每 6 小时")
          .setValue(String(this.plugin.pluginSettings.localAutoScanMinutes))
          .onChange(async (v) => {
            this.plugin.pluginSettings.localAutoScanMinutes = Number(v);
            await this.plugin.saveSettings();
            this.plugin.reloadAutoScan();
          }),
      );
  }
}
