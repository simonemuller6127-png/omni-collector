import path from "node:path";
import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type OmniSettings } from "./settings.js";
import { OmniSettingTab } from "./settings-tab.js";
import { EngineClient } from "./comm/socket-client.js";
import { OmniSidebarView, VIEW_TYPE_OMNI } from "./ui/sidebar.js";

export default class OmniCollectorPlugin extends Plugin {
  pluginSettings!: OmniSettings;
  engine!: EngineClient;

  async onload(): Promise<void> {
    this.pluginSettings = await loadSettings(this);
    if (!this.pluginSettings.dataDir) {
      const basePath = (
        this.app.vault.adapter as unknown as { getBasePath(): string }
      ).getBasePath();
      this.pluginSettings.dataDir = path.join(basePath, ".omni-collector");
    }
    if (!this.pluginSettings.engineScript) {
      this.pluginSettings.engineScript = path.join(
        this.pluginSettings.dataDir,
        "engine",
        "index.js",
      );
    }
    if (!this.pluginSettings.wsToken) {
      this.pluginSettings.wsToken = randomUUID();
    }
    await saveSettings(this, this.pluginSettings);

    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
    });

    this.registerView(VIEW_TYPE_OMNI, (leaf) => new OmniSidebarView(leaf, this.engine));
    this.addSettingTab(new OmniSettingTab(this.app, this));
    this.addRibbonIcon("sparkles", "Omni Collector", () => {
      void this.activateView();
      this.engine
        .startEngine("query")
        .catch((err) => new Notice(`Omni Collector: ${(err as Error).message}`));
    });
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    for (const l of workspace.getLeavesOfType(VIEW_TYPE_OMNI)) {
      leaf = l;
      break;
    }
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  onunload(): void {
    this.engine?.dispose();
  }

  async saveSettings(): Promise<void> {
    await saveSettings(this, this.pluginSettings);
  }
}
