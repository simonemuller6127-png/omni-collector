import path from "node:path";
import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type OmniSettings } from "./settings.js";
import { OmniSettingTab } from "./settings-tab.js";
import { EngineClient } from "./comm/socket-client.js";
import { OmniSidebarView, VIEW_TYPE_OMNI } from "./ui/sidebar.js";
import { OmniAiReviewView, VIEW_TYPE_OMNI_AI, type AiReviewSource } from "./ui/ai-review.js";
import { OmniCollectionListView, VIEW_TYPE_OMNI_LIST, type ListDataSource } from "./ui/collection-list.js";
import { MarkdownBuilder } from "./markdown/markdown-builder.js";

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
      nodeBin: this.pluginSettings.nodeBin || undefined,
    });

    this.registerView(VIEW_TYPE_OMNI, (leaf) => new OmniSidebarView(leaf, this.engine));
    this.registerView(VIEW_TYPE_OMNI_LIST, (leaf) => {
      const source: ListDataSource = {
        list: () => this.engine.listCollections(),
        onOrganize: () => Promise.resolve(),
      };
      return new OmniCollectionListView(leaf, source);
    });
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
    this.addCommand({
      id: "sync-all",
      name: "立即同步（全部平台）",
      callback: () => {
        void this.syncAllAndRender();
      },
    });
    this.addCommand({
      id: "generate-markdown",
      name: "生成收藏 Markdown",
      callback: () => {
        void this.generateCollectionMarkdown();
      },
    });
    this.addCommand({
      id: "open-collection-list",
      name: "打开收藏列表",
      callback: () => {
        void this.openCollectionList();
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

  updateEngineNodeBin(): void {
    if (!this.engine) return;
    this.engine.dispose();
    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
      nodeBin: this.pluginSettings.nodeBin || undefined,
    });
  }

  /** 同步全部平台，完成后生成 Markdown 并提示。 */
  async syncAllAndRender(): Promise<void> {
    const platforms = ["bilibili", "youtube", "xiaohongshu", "makerworld", "xiaoheihe"];
    new Notice("Omni Collector: 开始同步全部平台…");
    let ok = 0;
    for (const platform of platforms) {
      try {
        const res = await this.engine.syncPlatform(platform, "catalog");
        const report = (res.payload?.report ?? {}) as { status?: string; itemsAdded?: number };
        if (report.status === "success") ok += 1;
      } catch {
        // 单平台失败不中断
      }
    }
    await this.generateCollectionMarkdown();
    new Notice(`Omni Collector: 同步完成 ${ok}/${platforms.length} 平台`);
  }

  /** 查询收藏并写入 vault：Omni Collector/{平台}/{标题}.md（仅更新系统区）。 */
  async generateCollectionMarkdown(): Promise<void> {
    const collections = await this.engine.listCollections();
    const folder = "Omni Collector";
    const vault = this.app.vault;
    if (!(await vault.adapter.exists(folder))) {
      await vault.createFolder(folder);
    }
    const builder = new MarkdownBuilder();
    let count = 0;
    for (const dto of collections) {
      const platformDir = `${folder}/${dto.platform}`;
      if (!(await vault.adapter.exists(platformDir))) {
        await vault.createFolder(platformDir);
      }
      const safeTitle = (dto.title || dto.platformItemId).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
      const filePath = `${platformDir}/${safeTitle}.md`;
      try {
        if (await vault.adapter.exists(filePath)) {
          const existing = await vault.adapter.read(filePath);
          if (builder.validateMarkers(existing)) {
            await vault.adapter.write(filePath, builder.replaceSystemZone(existing, dto));
            count += 1;
            continue;
          }
        }
        await vault.create(filePath, builder.buildFromDTO(dto));
        count += 1;
      } catch {
        // 跳过单个文件写入失败
      }
    }
    new Notice(`Omni Collector: 已生成/更新 ${count} 个 Markdown`);
  }

  private async openCollectionList(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_OMNI_LIST)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_LIST, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
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
