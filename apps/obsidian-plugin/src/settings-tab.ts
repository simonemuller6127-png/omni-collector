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

    containerEl.createEl("h3", { text: "AI 功能开关" });
    new Setting(containerEl)
      .setName("AI Tag 建议")
      .setDesc("关闭后 AI 不再生成 Tag 建议。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.pluginSettings.aiTagEnabled).onChange(async (value) => {
          this.plugin.pluginSettings.aiTagEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateRule("ai_tag_enabled", String(value));
        }),
      );
    new Setting(containerEl)
      .setName("AI Topic 建议")
      .setDesc("关闭后 AI 不再生成 Topic 建议。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.pluginSettings.aiTopicEnabled).onChange(async (value) => {
          this.plugin.pluginSettings.aiTopicEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateRule("ai_topic_enabled", String(value));
        }),
      );
    new Setting(containerEl)
      .setName("AI 摘要建议")
      .setDesc("关闭后 AI 不再生成摘要建议。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.pluginSettings.aiSummaryEnabled).onChange(async (value) => {
          this.plugin.pluginSettings.aiSummaryEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateRule("ai_summary_enabled", String(value));
        }),
      );
    new Setting(containerEl)
      .setName("每日 AI 调用上限")
      .setDesc("默认 50 次；超出后排队次日执行（写入 ai_daily_call_limit）。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.aiDailyCallLimit))
          .onChange(async (v) => {
            const n = Math.max(1, Math.floor(Number(v) || 50));
            this.plugin.pluginSettings.aiDailyCallLimit = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("ai_daily_call_limit", String(n));
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

    containerEl.createEl("h3", { text: "同步计划" });
    const platforms: Array<[string, string]> = [
      ["bilibili", "B站"],
      ["youtube", "YouTube"],
      ["xiaohongshu", "小红书"],
      ["makerworld", "MakerWorld"],
      ["xiaoheihe", "小黑盒"],
    ];
    for (const [key, label] of platforms) {
      new Setting(containerEl)
        .setName(`${label} 自动同步频率`)
        .setDesc("daily = 每日自动同步；weekly = 每周自动同步。")
        .addDropdown((dd) =>
          dd
            .addOption("daily", "每日")
            .addOption("weekly", "每周")
            .setValue(this.plugin.pluginSettings.syncFrequency[key] ?? "daily")
            .onChange(async (value) => {
              this.plugin.pluginSettings.syncFrequency = {
                ...this.plugin.pluginSettings.syncFrequency,
                [key]: value as "daily" | "weekly",
              };
              await this.plugin.saveSettings();
              await this.plugin.updateRule(`${key}_sync_frequency`, value);
            }),
        );
    }
    new Setting(containerEl)
      .setName("初始化完整详情条数")
      .setDesc("首次/手动 full 同步最多拉取详情与评论的条数（区间 20~80）。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.initFullDetailLimit))
          .onChange(async (v) => {
            const n = Math.max(20, Math.min(80, Math.floor(Number(v) || 50)));
            this.plugin.pluginSettings.initFullDetailLimit = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("init_full_detail_limit", String(n));
          }),
      );
    new Setting(containerEl)
      .setName("随机执行窗口（分钟）")
      .setDesc("自动同步在窗口内随机执行，避免固定时刻被风控。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.syncRandomWindowMinutes))
          .onChange(async (v) => {
            const n = Math.max(0, Math.floor(Number(v) || 120));
            this.plugin.pluginSettings.syncRandomWindowMinutes = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("sync_random_window_minutes", String(n));
          }),
      );
    new Setting(containerEl)
      .setName("单平台每日同步上限")
      .setDesc("当天达到上限后不再自动触发该平台。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.dailySyncCapPerPlatform))
          .onChange(async (v) => {
            const n = Math.max(1, Math.floor(Number(v) || 3));
            this.plugin.pluginSettings.dailySyncCapPerPlatform = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("daily_sync_cap_per_platform", String(n));
          }),
      );
    new Setting(containerEl)
      .setName("深度历史同步回溯深度（页）")
      .setDesc("手动深度同步时向后拉取的历史页数。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.deepSyncDepth))
          .onChange(async (v) => {
            const n = Math.max(1, Math.floor(Number(v) || 50));
            this.plugin.pluginSettings.deepSyncDepth = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("deep_sync_default_depth", String(n));
          }),
      );
    new Setting(containerEl)
      .setName("评论批量更新最近 N 天")
      .setDesc("批量刷新最近 N 天内同步收藏的评论。")
      .addText((text) =>
        text
          .setValue(String(this.plugin.pluginSettings.commentBatchUpdateDays))
          .onChange(async (v) => {
            const n = Math.max(1, Math.floor(Number(v) || 7));
            this.plugin.pluginSettings.commentBatchUpdateDays = n;
            await this.plugin.saveSettings();
            await this.plugin.updateRule("comment_batch_update_days", String(n));
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

    containerEl.createEl("h3", { text: "规则中心" });
    const ruleBox = containerEl.createEl("div", { cls: "omni-rule-center" });
    const loadRules = async (): Promise<void> => {
      ruleBox.empty();
      try {
        const { rules, changes } = await this.plugin.engine.listRules();
        for (const rule of rules) {
          const row = ruleBox.createEl("div", { cls: "omni-rule-row" });
          const main = row.createEl("div", { cls: "omni-rule-main" });
          main.createEl("div", { text: rule.rule_key, cls: "omni-rule-name" });
          main.createEl("div", {
            text: `${rule.description ?? ""}${rule.impact ? ` · ${rule.impact}` : ""}`,
            cls: "omni-meta-text",
          });
          const editor = row.createEl("div", { cls: "omni-rule-editor" });
          const input = editor.createEl("input", {
            type: "text",
            attr: { value: rule.rule_value, style: "width:90px;" },
          });
          editor
            .createEl("button", { text: "保存", cls: "omni-act" })
            .addEventListener("click", async () => {
              await this.plugin.updateRule(rule.rule_key, input.value);
              await loadRules();
            });
          editor
            .createEl("button", { text: "默认", cls: "omni-act omni-act-ghost" })
            .addEventListener("click", async () => {
              if (rule.default_value !== null) {
                await this.plugin.updateRule(rule.rule_key, rule.default_value);
                await loadRules();
              }
            });
        }
        if (changes.length > 0) {
          ruleBox.createEl("div", { text: "最近变更", cls: "omni-section-title" });
          for (const c of changes.slice(0, 8)) {
            ruleBox.createEl("div", {
              text: `${c.changed_at}  ${c.rule_key}: ${c.old_value ?? "∅"} → ${c.new_value}`,
              cls: "omni-meta-text",
            });
          }
        }
      } catch (err) {
        ruleBox.createEl("div", {
          text: `规则中心加载失败：${(err as Error).message}`,
          cls: "omni-empty",
        });
      }
    };
    void loadRules();
  }
}
