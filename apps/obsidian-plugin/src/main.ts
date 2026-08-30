import path from "node:path";
import { Modal, Notice, Plugin, requestUrl, Setting, WorkspaceLeaf } from "obsidian";
import { randomUUID } from "node:crypto";
import type { CollectionDTO } from "@omni/shared-core";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type OmniSettings } from "./settings.js";
import { OmniSettingTab } from "./settings-tab.js";
import { EngineClient } from "./comm/socket-client.js";
import { OmniSidebarView, VIEW_TYPE_OMNI, type OmniController } from "./ui/sidebar.js";
import { OmniAiReviewView, VIEW_TYPE_OMNI_AI, type AiReviewSource } from "./ui/ai-review.js";
import { OmniTagTopicView, VIEW_TYPE_OMNI_TAGS, type TagTopicSource } from "./ui/tag-topic.js";
import { OmniCollectionListView, VIEW_TYPE_OMNI_LIST, type ListDataSource } from "./ui/collection-list.js";
import { OmniCollectionDetailView, VIEW_TYPE_OMNI_DETAIL, type DetailDataSource } from "./ui/collection-detail.js";
import { MarkdownBuilder, sanitizeFilename, renderRating } from "./markdown/markdown-builder.js";
import { openManualAIModal } from "./ui/manual-ai.js";
import { openManualAIBatchModal } from "./ui/manual-ai-batch.js";
import { dailyCapReached, isSyncDue } from "./sync/sync-scheduler.js";

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
    this.reloadAutoScan();
    this.reloadSyncScheduler();

    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
      nodeBin: this.pluginSettings.nodeBin || undefined,
      autoStart: this.pluginSettings.autoStartEngine,
    });

    this.registerView(VIEW_TYPE_OMNI, (leaf) => new OmniSidebarView(leaf, this.engine, this.controller));
    this.registerView(VIEW_TYPE_OMNI_LIST, (leaf) => {
      const source: ListDataSource = {
        list: () => this.engine.listCollections(),
        listLocalFiles: () => this.engine.listLocalFiles(),
        onOpenDetail: (id) => void this.openCollectionDetail(id),
        onBatch: (ids, action, value) => this.engine.batch(ids, action, value).then(() => undefined),
        getDefaultViewMode: () => this.pluginSettings.viewMode,
        onOrganize: (id, state) => this.engine.setOrganizeState(id, state).then(() => undefined),
        onTag: (id, tag) => this.engine.addTag(id, tag).then(() => undefined),
        onTopic: (id, topic) => this.engine.addTopic(id, topic).then(() => undefined),
        onPriority: (id, priority) => this.engine.setPriority(id, priority).then(() => undefined),
        onConvert: (id, to) => this.engine.convertCollection(id, to).then(() => undefined),
        onRating: (id, rating) => this.engine.setRating(id, rating).then(() => undefined),
        ensureCover: (url) => this.ensureCover(url),
        openLocalFile: (filePath) => {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file) void this.app.workspace.getLeaf(false).openFile(file as import("obsidian").TFile);
        },
      };
      return new OmniCollectionListView(leaf, source);
    });
    this.registerView(VIEW_TYPE_OMNI_DETAIL, (leaf) => {
      const source: DetailDataSource = {
        get: (id) => this.engine.getCollection(id),
        fetchText: (url) => this.engine.fetchPageText(url),
        onOrganize: (id, s) => this.engine.setOrganizeState(id, s).then(() => undefined),
        onPriority: (id, p) => this.engine.setPriority(id, p).then(() => undefined),
        onTag: (id, t) => this.engine.addTag(id, t).then(() => undefined),
        onTopic: (id, t) => this.engine.addTopic(id, t).then(() => undefined),
        onRating: (id, rating) => this.engine.setRating(id, rating).then(() => undefined),
        onStarComment: (id, commentId, starred) => this.engine.starComment(id, commentId, starred).then(() => undefined),
        materializeRating: (dto, rating) => this.writeUserZoneSection(dto, "评分", renderRating(rating)),
        materializeStarredComments: (dto) =>
          this.writeUserZoneSection(
            dto,
            "精选评论",
            (dto.comments ?? [])
              .filter((c) => c.starred)
              .map((c) => `- **${c.author}**：${c.content}`)
              .join("\n"),
          ),
        openLocalFile: (filePath) => {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file) void this.app.workspace.getLeaf(false).openFile(file as import("obsidian").TFile);
        },
        ensureCover: (url) => this.ensureCover(url),
        submitManualAI: (id, reply) => this.engine.submitManualAI(id, reply).then(() => undefined),
      };
      return new OmniCollectionDetailView(leaf, source);
    });
    this.registerView(VIEW_TYPE_OMNI_AI, (leaf) => {
      const source: AiReviewSource = {
        listPending: () => this.engine.listAiSuggestions(),
        review: (id, status) => this.engine.reviewAiSuggestion(id, status).then(() => undefined),
        undo: (id) => this.engine.undoAiSuggestion(id).then(() => undefined),
        openManualAI: () => void this.openManualAIPicker(),
        openManualAIBatch: () => void this.openManualAIBatchPicker(),
      };
      return new OmniAiReviewView(leaf, source);
    });
    this.registerView(VIEW_TYPE_OMNI_TAGS, (leaf) => {
      const source: TagTopicSource = {
        listTags: () => this.engine.listTags(),
        addAlias: (tag, alias) => this.engine.addTagAlias(tag, alias).then(() => undefined),
        mergeTags: (sourceTag, target) => this.engine.mergeTags(sourceTag, target).then(() => undefined),
        renameTag: (tag, next) => this.engine.renameTag(tag, next).then(() => undefined),
        listTopics: () => this.engine.listTopics(),
        renameTopic: (id, name) => this.engine.renameTopic(id, name).then(() => undefined),
        listCollections: () => this.engine.listCollections(),
        openDetail: (id) => this.openCollectionDetail(id),
        refreshMarkdown: () => this.generateCollectionMarkdown(),
      };
      return new OmniTagTopicView(leaf, source);
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
      id: "open-tag-topic-manager",
      name: "打开 Tag/Topic 管理",
      callback: () => {
        void this.openTagTopicView();
      },
    });
    this.addCommand({
      id: "open-manual-ai",
      name: "Manual AI 模板（选择收藏）",
      callback: () => {
        void this.openManualAIPicker();
      },
    });
    this.addCommand({
      id: "open-manual-ai-batch",
      name: "Manual AI 批量（打包 N 条收藏）",
      callback: () => {
        void this.openManualAIBatchPicker();
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
    this.addCommand({
      id: "scan-local-files",
      name: "扫描本地文件并关联收藏",
      callback: () => {
        void this.scanLocalFiles();
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
  if (leaf) workspace.setActiveLeaf(leaf);
  }

  onunload(): void {
    this.autoScanTimer = null;
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.engine?.dispose();
  }

  private autoScanTimer: number | null = null;
  private syncTimer: number | null = null;

  async saveSettings(): Promise<void> {
    await saveSettings(this, this.pluginSettings);
  }

  async updateRule(key: string, value: string): Promise<void> {
    try {
      await this.engine.updateRule(key, value);
      new Notice(`已保存：${key}`);
    } catch (err) {
      new Notice(`规则更新失败：${(err as Error).message}`);
    }
  }

  /** 自动扫描定时器（设置变更后重载）。 */
  reloadAutoScan(): void {
    if (this.autoScanTimer !== null) {
      window.clearInterval(this.autoScanTimer);
      this.autoScanTimer = null;
    }
    if (this.pluginSettings.localAutoScan && this.pluginSettings.localFolders.length > 0) {
      this.autoScanTimer = window.setInterval(() => {
        void this.scanAllLocalFolders(true);
      }, Math.max(1, this.pluginSettings.localAutoScanMinutes) * 60_000);
    }
  }

  /** 扫描全部已配置目录。 */
  async scanAllLocalFolders(silent = false): Promise<void> {
    if (this.pluginSettings.localFolders.length === 0) {
      if (!silent) new Notice("尚未加入本地目录（请到设置添加）");
      return;
    }
    if (!silent) new Notice("正在扫描本地目录…");
    let scanned = 0;
    let indexed = 0;
    let failed = 0;
    for (const folder of this.pluginSettings.localFolders) {
      try {
        const res = await this.engine.scanFolder(folder);
        const report = (res.payload?.report ?? {}) as { scanned?: number; indexed?: number; errors?: string[] };
        scanned += report.scanned ?? 0;
        indexed += report.indexed ?? 0;
        failed += (report.errors ?? []).length;
      } catch {
        failed += 1;
      }
    }
    if (!silent) new Notice(`扫描完成：${scanned} 个文件，索引 ${indexed} 个${failed > 0 ? `，${failed} 个失败` : ""}`);
  }

  /** 封面本地缓存：首次下载到 vault/.covers，之后走本地路径。 */
  async ensureCover(url: string): Promise<string | null> {
    if (!url) return null;
    const coverDir = "Omni Collector/.covers";
    const vault = this.app.vault;
    if (!(await vault.adapter.exists(coverDir))) {
      await vault.createFolder(coverDir).catch(() => {});
    }
    const ext = /\.(jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.exec(url)?.[1] ?? "jpg";
    const hash = await this.hashString(url);
    const filePath = `${coverDir}/${hash}.${ext}`;
    if (await vault.adapter.exists(filePath)) {
      const f = vault.getAbstractFileByPath(filePath);
      return f ? vault.getResourcePath(f as import("obsidian").TFile) : url;
    }
    try {
      const res = await requestUrl({ url, method: "GET" });
      if (res.status >= 200 && res.status < 300) {
        await vault.adapter.writeBinary(filePath, res.arrayBuffer);
        const f = vault.getAbstractFileByPath(filePath);
        return f ? vault.getResourcePath(f as import("obsidian").TFile) : url;
      }
    } catch {
      // 下载失败回退远程地址
    }
    return url;
  }

  private async hashString(s: string): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  private get controller(): OmniController {
    return {
      openCollectionList: (platform?: string) => this.openCollectionList(platform),
      openCollectionDetail: (id: string) => this.openCollectionDetail(id),
      openAiReview: () => this.openAiReviewView(),
      openTagTopic: () => this.openTagTopicView(),
      openManualAI: () => this.openManualAIPicker(),
      openManualAIBatch: () => this.openManualAIBatchPicker(),
      openSettings: () => this.openSettingsTab(),
      startEngine: async () => {
        await this.engine.startEngine("query");
        new Notice("Engine 已启动");
      },
      stopEngine: async () => {
        await this.engine.stopEngine("plugin");
        new Notice("Engine 已停止");
      },
      syncAll: () => this.syncAllAndRender(),
      syncPlatform: async (platform) => {
        const res = await this.engine.syncPlatform(platform, this.pluginSettings.initialSyncMode);
        const report = (res.payload?.report ?? {}) as { status?: string; itemsAdded?: number; itemsUpdated?: number; itemsFetched?: number };
        if (report.status === "success") {
          new Notice(`Omni Collector: ${platform} 抓取 ${report.itemsFetched ?? 0} 条（+${report.itemsAdded ?? 0} 新增 / ${report.itemsUpdated ?? 0} 更新）`);
        } else {
          new Notice(`Omni Collector: ${platform} 同步失败 ${String(res.payload?.message ?? "")}`);
        }
      },
      deepSyncPlatform: (platform) => this.deepSyncPlatform(platform),
      refreshComments: () => this.refreshCommentsAll(),
      generateMarkdown: () => this.generateCollectionMarkdown(),
      runGroupRecognition: async () => {
        const res = await this.engine.runAutoGroup();
        const candidates = (res.payload?.candidates ?? []) as Array<{ name: string; size: number; reason: string }>;
        new Notice(`分组识别完成：发现 ${candidates.length} 个候选（请到 AI 建议审核确认）`);
      },
      scanLocalFiles: () => this.scanLocalFiles(),
    };
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

  /** 自动同步调度（PRD 15.4）：每 10 分钟检查一次，按频率+随机窗口+日上限触发。 */
  reloadSyncScheduler(): void {
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.syncTimer = window.setInterval(() => void this.checkAutoSync(), 10 * 60_000);
    void this.checkAutoSync();
  }

  private async checkAutoSync(): Promise<void> {
    if (!this.pluginSettings.autoSyncEnabled) return;
    try {
      const statuses = await this.engine.listPlatformStatus();
      for (const s of statuses) {
        const frequency = this.pluginSettings.syncFrequency[s.platform] ?? "daily";
        const lastAuto = this.pluginSettings.lastAutoSyncAt[s.platform] ?? null;
        if (dailyCapReached(s.todaySyncCount, this.pluginSettings.dailySyncCapPerPlatform)) continue;
        if (!isSyncDue({ frequency, lastRunAt: lastAuto, randomWindowMinutes: this.pluginSettings.syncRandomWindowMinutes })) {
          continue;
        }
        this.pluginSettings.lastAutoSyncAt = {
          ...this.pluginSettings.lastAutoSyncAt,
          [s.platform]: new Date().toISOString(),
        };
        await this.saveSettings();
        await this.engine.syncPlatform(s.platform, "catalog").catch(() => {});
      }
    } catch {
      // Engine 未就绪时静默跳过，下个周期再试
    }
  }

  /** 深度历史同步：按设置的回溯深度拉取。 */
  async deepSyncPlatform(platform: string): Promise<void> {
    const depth = this.pluginSettings.deepSyncDepth;
    const res = await this.engine.syncPlatform(platform, "full", depth);
    const report = (res.payload?.report ?? {}) as { status?: string; itemsAdded?: number; itemsUpdated?: number };
    if (report.status === "success") {
      new Notice(`深度同步完成：${platform} +${report.itemsAdded ?? 0} 新增 / ${report.itemsUpdated ?? 0} 更新`);
    } else {
      new Notice(`深度同步失败：${platform}`);
    }
  }

  /** 评论批量更新（最近 N 天）。 */
  async refreshCommentsAll(): Promise<void> {
    new Notice("开始批量刷新评论…");
    try {
      const res = await this.engine.refreshComments(undefined, this.pluginSettings.commentBatchUpdateDays);
      const reports = (res.payload?.reports ?? []) as Array<{ platform: string; refreshed: number; failed: number }>;
      const total = reports.reduce((acc, r) => acc + r.refreshed, 0);
      new Notice(`评论刷新完成：${total} 条更新（${reports.map((r) => `${r.platform} ${r.refreshed}`).join(" / ")}）`);
    } catch (err) {
      new Notice(`评论刷新失败：${(err as Error).message}`);
    }
  }

  updateEngineAutoStart(): void {
    if (!this.engine) return;
    this.engine.dispose();
    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
      nodeBin: this.pluginSettings.nodeBin || undefined,
      autoStart: this.pluginSettings.autoStartEngine,
    });
  }

  /** 同步全部平台，完成后生成 Markdown 并提示。 */
  async syncAllAndRender(): Promise<void> {
    const platforms = ["bilibili", "youtube", "xiaohongshu", "makerworld", "xiaoheihe"];
    new Notice("Omni Collector: 开始同步全部平台…");
    let ok = 0;
    let fetched = 0;
    let added = 0;
    let updated = 0;
    for (const platform of platforms) {
      try {
        const res = await this.engine.syncPlatform(platform, this.pluginSettings.initialSyncMode);
        const report = (res.payload?.report ?? {}) as { status?: string; itemsAdded?: number; itemsUpdated?: number; itemsFetched?: number };
        if (report.status === "success") {
          ok += 1;
          fetched += report.itemsFetched ?? 0;
          added += report.itemsAdded ?? 0;
          updated += report.itemsUpdated ?? 0;
        }
      } catch {
        // 单平台失败不中断
      }
    }
    await this.generateCollectionMarkdown();
    new Notice(`Omni Collector: 同步完成 ${ok}/${platforms.length} 平台，共抓取 ${fetched} 条（+${added} 新增 / ${updated} 更新）`);
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
    // Topic 聚合页（PRD 17 / 关系图谱联动）
    const topics = await this.engine.listTopics().catch(() => []);
    if (topics.length > 0) {
      const topicDir = `${folder}/Topics`;
      if (!(await vault.adapter.exists(topicDir))) {
        await vault.createFolder(topicDir).catch(() => {});
      }
      const byId = new Map(collections.map((c) => [c.id, c]));
      for (const topic of topics) {
        const links = (topic.collection_ids ?? [])
          .map((id) => {
            const dto = byId.get(id);
            if (!dto) return "";
            return `Omni Collector/${dto.platform}/${sanitizeFilename(dto.title || dto.platformItemId)}`;
          })
          .filter(Boolean);
        const hubPath = `${topicDir}/${sanitizeFilename(topic.name)}.md`;
        try {
          const content = builder.buildTopicHub(topic.name, links);
          if (await vault.adapter.exists(hubPath)) {
            await vault.adapter.write(hubPath, content);
          } else {
            await vault.create(hubPath, content);
          }
        } catch {
          // 单个 Topic 页失败不中断
        }
      }
    }
    // Tag 聚合页（PRD 16 / 关系图谱联动）
    const tags = await this.engine.listTags().catch(() => []);
    if (tags.length > 0) {
      const tagDir = `${folder}/Tags`;
      if (!(await vault.adapter.exists(tagDir))) {
        await vault.createFolder(tagDir).catch(() => {});
      }
      for (const tag of tags) {
        const links = collections
          .filter((c) => (c.tags ?? []).includes(tag.name))
          .map((c) => `Omni Collector/${c.platform}/${sanitizeFilename(c.title || c.platformItemId)}`);
        const hubPath = `${tagDir}/${sanitizeFilename(tag.name)}.md`;
        try {
          const content = builder.buildTagHub(tag.name, links);
          if (await vault.adapter.exists(hubPath)) {
            await vault.adapter.write(hubPath, content);
          } else {
            await vault.create(hubPath, content);
          }
        } catch {
          // 单个 Tag 页失败不中断
        }
      }
    }
    new Notice(`Omni Collector: 已生成/更新 ${count} 个 Markdown`);
  }

  /** 计算收藏 Markdown 路径（与 generateCollectionMarkdown 命名一致）。 */
  private collectionMarkdownPath(dto: CollectionDTO): string {
    const safeTitle = (dto.title || dto.platformItemId).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
    return `Omni Collector/${dto.platform}/${safeTitle}.md`;
  }

  /**
   * 把用户在 UI 的显式操作物化进 Markdown 用户区（评分/精选评论，ADR-006：用户区为权威）。
   * 文件尚未生成时跳过——之后 generateCollectionMarkdown 按 DTO 建档时会带上最新值。
   */
  private async writeUserZoneSection(dto: CollectionDTO, headerKeyword: string, content: string): Promise<void> {
    const filePath = this.collectionMarkdownPath(dto);
    const vault = this.app.vault;
    try {
      if (!(await vault.adapter.exists(filePath))) return;
      const existing = await vault.adapter.read(filePath);
      const next = new MarkdownBuilder().replaceUserZoneSection(existing, headerKeyword, content);
      if (next !== null && next !== existing) await vault.adapter.write(filePath, next);
    } catch {
      // 用户区物化失败不阻断操作（SQLite 同步副本已写入）
    }
  }

  private async openCollectionList(platform?: string): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_OMNI_LIST)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_LIST, active: true, state: { platform: platform ?? null } });
    } else {
      await leaf.setViewState({ type: VIEW_TYPE_OMNI_LIST, active: true, state: { platform: platform ?? null } });
    }
  if (leaf) workspace.setActiveLeaf(leaf);
  }

  private async openCollectionDetail(collectionId: string): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_OMNI_DETAIL)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_DETAIL, active: true, state: { collectionId } });
    } else {
      await leaf.setViewState({ type: VIEW_TYPE_OMNI_DETAIL, active: true, state: { collectionId } });
    }
  if (leaf) workspace.setActiveLeaf(leaf);
  }

  private async openAiReviewView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_OMNI_AI)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_AI, active: true });
    }
  if (leaf) workspace.setActiveLeaf(leaf);
  }

  private async openTagTopicView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_OMNI_TAGS)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_TAGS, active: true });
    }
  if (leaf) workspace.setActiveLeaf(leaf);
  }

  /** Manual AI 全局入口：先选收藏，再打开模板（PRD 19.3）。 */
  private async openManualAIPicker(): Promise<void> {
    const collections = await this.engine.listCollections().catch(() => []);
    const modal = new Modal(this.app);
    modal.titleEl.setText("选择收藏（Manual AI 模板）");
    const search = modal.contentEl.createEl("input", {
      type: "text",
      placeholder: "搜索标题…",
      attr: { style: "width:100%;margin-bottom:8px;" },
    });
    const list = modal.contentEl.createEl("div", {
      cls: "omni-list",
      attr: { style: "max-height:60vh;overflow:auto;" },
    });
    const render = (keyword = ""): void => {
      list.empty();
      const filtered = collections
        .filter((c) => (c.title || "").toLowerCase().includes(keyword.toLowerCase()))
        .slice(0, 100);
      for (const c of filtered) {
        const row = list.createEl("div", { cls: "omni-row" });
        row.createEl("span", { text: c.title || c.id, cls: "omni-title" });
        row.addEventListener("click", () => {
          modal.close();
          openManualAIModal(this.app, c, {
            submit: (id, reply) => this.engine.submitManualAI(id, reply).then(() => undefined),
          });
        });
      }
      if (filtered.length === 0) {
        list.createEl("div", { text: "无匹配收藏", cls: "omni-empty" });
      }
    };
    search.addEventListener("input", () => render(search.value));
    render();
    modal.open();
  }

  /** Manual AI 批量入口：按平台/时间段打包 N 条收藏，一次交给网页 AI。 */
  private async openManualAIBatchPicker(): Promise<void> {
    const collections = await this.engine.listCollections().catch(() => []);
    const modal = new Modal(this.app);
    modal.titleEl.setText("Manual AI 批量打包");
    const filters = modal.contentEl.createEl("div", { cls: "omni-batch-filter" });
    const platformSel = filters.createEl("select");
    platformSel.createEl("option", { text: "全部平台", attr: { value: "" } });
    for (const p of ["bilibili", "youtube", "xiaohongshu", "makerworld", "xiaoheihe"]) {
      platformSel.createEl("option", { text: p, attr: { value: p } });
    }
    const daysSel = filters.createEl("select");
    for (const [label, days] of [
      ["最近 7 天", 7],
      ["最近 30 天", 30],
      ["最近 90 天", 90],
      ["全部时间", 0],
    ]) {
      daysSel.createEl("option", { text: String(label), attr: { value: String(days) } });
    }
    daysSel.value = "30";
    const maxInput = filters.createEl("input", {
      type: "number",
      attr: { value: "50", min: "1", max: "100", style: "width:70px;" },
    });
    const preview = modal.contentEl.createEl("div", { cls: "omni-total" });
    const runBtn = modal.contentEl.createEl("button", {
      text: "生成批量模板",
      cls: "omni-btn omni-btn-primary",
    });

    const pick = (): CollectionDTO[] => {
      const platform = platformSel.value;
      const days = Number(daysSel.value);
      const max = Math.max(1, Math.min(100, Number(maxInput.value) || 50));
      const cutoff = days > 0 ? Date.now() - days * 24 * 3600 * 1000 : 0;
      const filtered = collections
        .filter((c) => (!platform || c.platform === platform) && (cutoff === 0 || new Date(c.collectedAt).getTime() >= cutoff))
        .sort((a, b) => {
          const rank = (x: CollectionDTO): number =>
            x.organizeStatus === "unorganized" ? 0 : x.organizeStatus === "viewed" ? 1 : 2;
          return rank(a) - rank(b) || new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime();
        })
        .slice(0, max);
      preview.setText(`当前选中 ${filtered.length} 条（优先未整理）`);
      return filtered;
    };
    const refresh = (): void => void pick();
    platformSel.addEventListener("change", refresh);
    daysSel.addEventListener("change", refresh);
    maxInput.addEventListener("input", refresh);
    runBtn.addEventListener("click", () => {
      const items = pick();
      if (items.length === 0) {
        new Notice("没有符合条件的收藏");
        return;
      }
      modal.close();
      openManualAIBatchModal(this.app, items, {
        submit: (ids, reply) =>
          this.engine
            .submitManualAIBatch(ids, reply)
            .then((res) => Number(res.payload?.saved ?? 0)),
      });
    });
    refresh();
    modal.open();
  }

  private async openSettingsTab(): Promise<void> {
    const app = this.app as unknown as { setting: { open(): void; openTabById(id: string): void } };
    app.setting.open();
    app.setting.openTabById("omni-collector");
  }

  /** 扫描库内文件夹（默认 Omni Collector），把 Markdown/PDF 关联到收藏。 */
  async scanLocalFiles(): Promise<void> {
    const vaultPath = (this.app.vault.adapter as unknown as { getBasePath(): string }).getBasePath();
    const defaultFolder = `${vaultPath}/Omni Collector`;
    const modal = new Modal(this.app);
    modal.titleEl.setText("扫描本地文件");
    let folder = defaultFolder;
    new Setting(modal.contentEl)
      .setName("文件夹路径")
      .setDesc("扫描该目录下的 .md / .pdf，并按 Markdown 系统区 URL 关联收藏。")
      .addText((text) =>
        text.setValue(defaultFolder).onChange((v) => {
          folder = v;
        }),
      );
    modal.contentEl.createEl("button", { text: "开始扫描", cls: "omni-btn omni-btn-primary" }).addEventListener("click", () => {
      modal.close();
      void (async () => {
        new Notice("正在扫描本地文件…");
        try {
          const res = await this.engine.scanFolder(folder);
          const report = (res.payload?.report ?? {}) as { scanned?: number; indexed?: number; errors?: string[] };
          const errors = report.errors ?? [];
          new Notice(`扫描完成：共 ${report.scanned ?? 0} 个文件，索引 ${report.indexed ?? 0} 个${errors.length > 0 ? `，${errors.length} 个失败` : ""}`);
        } catch (err) {
          new Notice(`扫描失败：${(err as Error).message}`);
        }
      })();
    });
    modal.open();
  }
}
