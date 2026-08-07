import path from "node:path";
import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type OmniSettings } from "./settings.js";
import { OmniSettingTab } from "./settings-tab.js";
import { EngineClient } from "./comm/socket-client.js";
import { OmniSidebarView, VIEW_TYPE_OMNI } from "./ui/sidebar.js";
import { OmniAiReviewView, VIEW_TYPE_OMNI_AI, type AiReviewSource } from "./ui/ai-review.js";

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
    this.registerView(VIEW_TYPE_OMNI_AI, (leaf) => {
      const source: AiReviewSource = {
        listPending: () => this.engine.listAiSuggestions(),
        review: (id, status) => this.engine.reviewAiSuggestion(id, status).then(() => undefined),
      };
      return new OmniAiReviewView(leaf, source);
    });
    this.addSettingTab(new OmniSettingTab(this.app, this));
    this.addCommand({
      id: "open-ai-review",
      name: "打开 AI 建议审核",
      callback: () => {
        void this.openAiReviewView();
      },
    });
    this.addCommand({
      id: "run-group-recognition",
      name: "运行 ContentGroup 关联识别",
      callback: async () => {
        try {
          const res = await this.engine.runAutoGroup();
          const candidates = (res.payload?.candidates ?? []) as Array<{ name: string; size: number; reason: string }>;
          new Notice(`分组识别完成：发现 ${candidates.length} 个候选（请到 AI 建议审核确认）`);
        } catch (err) {
          new Notice(`分组识别失败：${(err as Error).message}`);
        }
      },
    });
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

  private async openAiReviewView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_OMNI_AI)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_AI, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }
}
