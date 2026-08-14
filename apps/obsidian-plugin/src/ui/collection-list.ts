import { App, ItemView, Modal, Notice, Setting, WorkspaceLeaf } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";
import { filterCollections, nextOrganizeState, type CollectionFilter } from "./helpers.js";

export const VIEW_TYPE_OMNI_LIST = "omni-collector-list";

export interface ListDataSource {
  list(): Promise<CollectionDTO[]>;
  listLocalFiles(): Promise<Array<{ file_path: string; file_name: string; file_type: string | null; linked_collection_id: string | null; linked_title: string | null }>>;
  onOpenDetail(collectionId: string): void;
  onBatch(ids: string[], action: "tag" | "topic" | "priority" | "organize" | "convert", value: string): Promise<void>;
  getDefaultViewMode(): "list" | "card";
  onOrganize(collectionId: string, state: CollectionDTO["organizeStatus"]): Promise<void>;
  onTag(collectionId: string, tag: string): Promise<void>;
  onTopic(collectionId: string, topic: string): Promise<void>;
  onPriority(collectionId: string, priority: CollectionDTO["priority"]): Promise<void>;
  onConvert(collectionId: string, to: "favorited" | "archived"): Promise<void>;
  ensureCover(url: string): Promise<string | null>;
  openLocalFile(filePath: string): void;
}

const PLATFORMS = [
  { key: "bilibili", label: "B站" },
  { key: "youtube", label: "YouTube" },
  { key: "xiaohongshu", label: "小红书" },
  { key: "makerworld", label: "MakerWorld" },
  { key: "xiaoheihe", label: "小黑盒" },
];

const PRIORITIES: Array<{ key: CollectionDTO["priority"]; label: string }> = [
  { key: "normal", label: "普通" },
  { key: "important", label: "重要" },
  { key: "project", label: "项目" },
  { key: "knowledge", label: "知识" },
];

function organizeLabel(state: CollectionDTO["organizeStatus"]): string {
  switch (state) {
    case "unorganized":
      return "标记整理";
    case "viewed":
      return "标记已整理";
    case "organized":
      return "标记归档";
    case "archived":
      return "已归档 ✓";
  }
}

class PromptModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly placeholder: string,
    private readonly onSubmit: (value: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    let input = "";
    new Setting(contentEl)
      .addText((text) =>
        text.setPlaceholder(this.placeholder).onChange((v) => {
          input = v;
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("确定").setCta().onClick(() => {
          if (input.trim()) this.onSubmit(input.trim());
          this.close();
        }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class OmniCollectionListView extends ItemView {
  private items: CollectionDTO[] = [];
  private localFiles: Array<{ file_path: string; file_name: string; file_type: string | null; linked_collection_id: string | null; linked_title: string | null }> = [];
  private statusFilter: "all" | "unorganized" | "organized" | "archived" = "all";
  private saveTypeFilter: "all" | "favorited" | "watch_later" | "liked" = "all";
  private priorityFilter: "all" | CollectionDTO["priority"] = "all";
  private platformFilter: string | null = null;
  private mode: "collections" | "local" = "collections";
  private viewMode: "list" | "card" = "list";
  private coverCache = new Map<string, string>();
  private selecting = false;
  private readonly selected = new Set<string>();
  private listEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private batchBarEl!: HTMLElement;
  private totalEl!: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly source: ListDataSource,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OMNI_LIST;
  }

  getDisplayText(): string {
    return "Omni Collector 收藏";
  }

  getState(): Record<string, unknown> {
    return { platform: this.platformFilter };
  }

  async setState(state: Record<string, unknown>): Promise<void> {
    this.platformFilter = (state.platform as string | null) ?? null;
    if (this.toolbarEl) await this.renderList();
  }

  async onOpen(): Promise<void> {
    const initial = (this.getState().platform as string | null) ?? null;
    this.platformFilter = initial;
    this.viewMode = this.source.getDefaultViewMode();
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("omni-list-view");
    container.createEl("div", { text: "Omni Collector 收藏", cls: "omni-panel-title" });
    this.totalEl = container.createEl("div", { cls: "omni-total" });
    this.toolbarEl = container.createEl("div", { cls: "omni-toolbar" });
    this.batchBarEl = container.createEl("div", { cls: "omni-batch-bar" });
    this.batchBarEl.addClass("is-hidden");
    this.listEl = container.createEl("div", { cls: "omni-list" });
    await this.refreshList();
  }

  private renderToolbar(): void {
    const tb = this.toolbarEl;
    tb.empty();
    tb.createEl('button', { text: this.mode === 'collections' ? '收藏' : '收藏', cls: `omni-chip${this.mode === 'collections' ? ' omni-chip-active' : ''}` })
      .addEventListener('click', () => { this.mode = 'collections'; this.renderToolbar(); void this.renderList(); });
    tb.createEl('button', { text: '本地文件', cls: `omni-chip${this.mode === 'local' ? ' omni-chip-active' : ''}` })
      .addEventListener('click', () => { this.mode = 'local'; this.renderToolbar(); void this.renderList(); });
    if (this.mode === 'collections') {
      tb.createEl('span', { text: '｜', cls: 'omni-toolbar-sep' });
      tb.createEl('button', { text: '全部平台', cls: `omni-chip${this.platformFilter === null ? ' omni-chip-active' : ''}` })
        .addEventListener('click', () => { this.platformFilter = null; this.renderToolbar(); void this.renderList(); });
      for (const p of PLATFORMS) {
        tb.createEl('button', { text: p.label, cls: `omni-chip${this.platformFilter === p.key ? ' omni-chip-active' : ''}` })
          .addEventListener('click', () => { this.platformFilter = p.key; this.renderToolbar(); void this.renderList(); });
      }
      tb.createEl('span', { text: '｜', cls: 'omni-toolbar-sep' });
      const types: Array<{ key: 'all' | 'favorited' | 'watch_later' | 'liked'; label: string }> = [
        { key: 'all', label: '全部类型' }, { key: 'favorited', label: '收藏' }, { key: 'watch_later', label: '稍后再看' }, { key: 'liked', label: '点赞' },
      ];
      for (const t of types) {
        tb.createEl('button', { text: t.label, cls: `omni-chip${this.saveTypeFilter === t.key ? ' omni-chip-active' : ''}` })
          .addEventListener('click', () => { this.saveTypeFilter = t.key; this.renderToolbar(); void this.renderList(); });
      }
      tb.createEl('span', { text: '｜', cls: 'omni-toolbar-sep' });
      const statuses: Array<{ key: 'all' | 'unorganized' | 'organized' | 'archived'; label: string }> = [
        { key: 'all', label: '全部状态' }, { key: 'unorganized', label: '未整理' }, { key: 'organized', label: '已整理' }, { key: 'archived', label: '已归档' },
      ];
      for (const s of statuses) {
        tb.createEl('button', { text: s.label, cls: `omni-chip${this.statusFilter === s.key ? ' omni-chip-active' : ''}` })
          .addEventListener('click', () => { this.statusFilter = s.key; this.renderToolbar(); void this.renderList(); });
      }
      tb.createEl('span', { text: '｜', cls: 'omni-toolbar-sep' });
      const priorities: Array<{ key: 'all' | CollectionDTO['priority']; label: string }> = [
        { key: 'all', label: '全部优先级' }, { key: 'important', label: '重要' }, { key: 'project', label: '项目' },
      ];
      for (const p of priorities) {
        tb.createEl('button', { text: p.label, cls: `omni-chip${this.priorityFilter === p.key ? ' omni-chip-active' : ''}` })
          .addEventListener('click', () => { this.priorityFilter = p.key; this.renderToolbar(); void this.renderList(); });
      }
    }
    tb.createEl('button', { text: '刷新', cls: 'omni-chip omni-chip-refresh' })
      .addEventListener('click', () => { void this.refreshList(); });
    if (this.mode === 'collections') {
    tb.createEl('button', { text: this.viewMode === 'list' ? '切换卡片视图' : '切换列表视图', cls: 'omni-chip' })
      .addEventListener('click', () => { this.viewMode = this.viewMode === 'list' ? 'card' : 'list'; this.renderToolbar(); void this.renderList(); });
    if (this.mode === 'collections') {
      tb.createEl('button', { text: this.selecting ? '完成选择' : '批量选择', cls: `omni-chip${this.selecting ? ' omni-chip-active' : ''}` })
        .addEventListener('click', () => {
          this.selecting = !this.selecting;
          this.selected.clear();
          this.renderToolbar();
          this.renderBatchBar();
          void this.renderList();
        });
    }
  }
  }

  private async refreshList(): Promise<void> {
    try {
      this.items = await this.source.list();
    } catch (err) {
      new Notice(`加载收藏失败：${(err as Error).message}`);
    }
    this.renderToolbar();
    await this.renderList();
  }

  private async renderList(): Promise<void> {
    this.listEl.empty();
    if (this.mode === 'local') {
      this.totalEl.setText(`本地文件 ${this.localFiles.length} 个`);
      if (this.localFiles.length === 0) {
        this.listEl.createEl('div', { text: '暂无本地文件（到设置加入目录并扫描）', cls: 'omni-empty' });
        return;
      }
      for (const f of this.localFiles) {
        const row = this.listEl.createEl('div', { cls: 'omni-row' });
        const main = row.createEl('div', { cls: 'omni-row-main' });
        main.createEl('div', { text: f.file_name || f.file_path.split(/[\\/]/).pop() || f.file_path, cls: 'omni-title' });
        const meta = main.createEl('div', { cls: 'omni-row-meta' });
        meta.createEl('span', { text: f.file_type ?? 'file', cls: 'omni-badge omni-badge-platform' });
        meta.createEl('span', { text: f.linked_title ? `关联：${f.linked_title}` : '未关联', cls: 'omni-badge' });
        meta.createEl('span', { text: f.file_path, cls: 'omni-meta-text' });
        row.createEl('button', { text: '打开', cls: 'omni-act' }).addEventListener('click', () => this.source.openLocalFile(f.file_path));
      }
      return;
    }
    const filter: CollectionFilter = {};
    if (this.statusFilter === 'unorganized') filter.status = 'unorganized';
    else if (this.statusFilter === 'organized') filter.status = 'organized';
    else if (this.statusFilter === 'archived') filter.status = 'archived';
    if (this.priorityFilter !== 'all') filter.priority = this.priorityFilter;
    let items = filterCollections(this.items, filter);
    if (this.platformFilter) items = items.filter((i) => i.platform === this.platformFilter);
    if (this.saveTypeFilter !== 'all') items = items.filter((i) => i.saveType === this.saveTypeFilter);

    this.totalEl.setText(`共 ${this.items.length} 条收藏${this.platformFilter ? `（${PLATFORMS.find((p) => p.key === this.platformFilter)?.label ?? this.platformFilter}）` : ''}，当前显示 ${items.length} 条`);
    if (items.length === 0) {
      this.listEl.createEl('div', { text: '暂无收藏（到侧边栏点「同步全部平台」）', cls: 'omni-empty' });
      return;
    }
    if (this.viewMode === 'card') {
      const grid = this.listEl.createEl('div', { cls: 'omni-card-grid' });
      for (const item of items) {
        const card = grid.createEl('div', { cls: 'omni-card' });
        const imgBox = card.createEl('div', { cls: 'omni-card-cover-wrap' });
        if (item.coverUrl) {
          imgBox.createEl('img', { cls: 'omni-card-cover', attr: { referrerpolicy: 'no-referrer', loading: 'lazy' } });
          void this.resolveCover(item.coverUrl).then((src) => {
            const img = imgBox.querySelector('img');
            if (img && src) img.setAttribute('src', src);
          });
        } else {
          imgBox.createEl('div', { cls: 'omni-card-cover omni-card-cover-empty' });
        }
        card.createEl('div', { text: item.title || item.platformItemId, cls: 'omni-card-title' });
        const meta = card.createEl('div', { cls: 'omni-row-meta' });
        meta.createEl('span', { text: PLATFORMS.find((p) => p.key === item.platform)?.label ?? item.platform, cls: 'omni-badge omni-badge-platform' });
        meta.createEl('span', { text: item.saveType === 'liked' ? '点赞' : item.saveType === 'watch_later' ? '稍后再看' : '收藏', cls: 'omni-badge' });
        card.addEventListener('click', () => this.source.onOpenDetail(item.id));
      }
      return;
    }
    for (const item of items) {
      const row = this.listEl.createEl('div', { cls: 'omni-row' });
      if (this.selecting) {
        const cb = row.createEl('input', { type: 'checkbox', cls: 'omni-check' });
        cb.checked = this.selected.has(item.id);
        cb.addEventListener('change', () => {
          if (cb.checked) this.selected.add(item.id);
          else this.selected.delete(item.id);
          this.renderBatchBar();
        });
      }
      const main = row.createEl('div', { cls: 'omni-row-main' });
      main.createEl('a', { text: item.title || item.platformItemId, href: item.url, cls: 'omni-title' });
      main.addEventListener('click', () => this.source.onOpenDetail(item.id));
      const meta = main.createEl('div', { cls: 'omni-row-meta' });
      meta.createEl('span', { text: PLATFORMS.find((p) => p.key === item.platform)?.label ?? item.platform, cls: 'omni-badge omni-badge-platform' });
      meta.createEl('span', { text: item.saveType === 'liked' ? '点赞' : item.saveType === 'watch_later' ? '稍后再看' : '收藏', cls: 'omni-badge' });
      if (item.contentStatus === "deleted") {
        meta.createEl('span', { text: '失效', cls: 'omni-badge omni-badge-deleted' });
        row.addClass("omni-row-deleted");
      }
      meta.createEl('span', { text: PRIORITIES.find((p) => p.key === item.priority)?.label ?? item.priority, cls: 'omni-badge omni-badge-priority' });
      if (item.groupName) meta.createEl('span', { text: `组:${item.groupName}`, cls: 'omni-badge omni-badge-group' });
      for (const t of item.tags ?? []) meta.createEl('span', { text: `#${t}`, cls: 'omni-badge omni-badge-tag' });
      for (const t of item.topics ?? []) meta.createEl('span', { text: `◎${t}`, cls: 'omni-badge omni-badge-topic' });
      meta.createEl('span', { text: new Date(item.collectedAt).toLocaleDateString('zh-CN'), cls: 'omni-meta-text' });

      const actions = row.createEl('div', { cls: 'omni-row-actions' });
      if (item.saveType === 'watch_later') {
        const fav = actions.createEl('button', { text: '转收藏', cls: 'omni-act' });
        fav.addEventListener('click', () => { void this.source.onConvert(item.id, 'favorited').then(() => { item.saveType = 'favorited'; void this.renderList(); }); });
        const done = actions.createEl('button', { text: '归档完成', cls: 'omni-act' });
        done.addEventListener('click', () => { void this.source.onConvert(item.id, 'archived').then(() => { item.organizeStatus = 'archived'; void this.renderList(); }); });
      }
      this.addRowButton(actions, '＋Tag', () => this.promptTag(item));
      this.addRowButton(actions, '＋Topic', () => this.promptTopic(item));
      this.addPriorityButton(actions, item);
      this.addOrganizeButton(actions, item);
    }
  }

  private async resolveCover(url: string): Promise<string | null> {
    const cached = this.coverCache.get(url);
    if (cached) return cached;
    const src = await this.source.ensureCover(url);
    if (src) this.coverCache.set(url, src);
    return src;
  }

  private addRowButton(parent: HTMLElement, label: string, cb: () => void): void {
    const btn = parent.createEl("button", { text: label, cls: "omni-act" });
    btn.addEventListener("click", cb);
  }

  private addPriorityButton(parent: HTMLElement, item: CollectionDTO): void {
    const btn = parent.createEl("button", { text: `优先级:${PRIORITIES.find((p) => p.key === item.priority)?.label ?? item.priority}`, cls: "omni-act omni-act-priority" });
    btn.addEventListener("click", () => {
      const next = PRIORITIES[(PRIORITIES.findIndex((p) => p.key === item.priority) + 1) % PRIORITIES.length];
      btn.addClass("omni-btn-disabled");
      void this.source
        .onPriority(item.id, next.key)
        .then(() => {
          item.priority = next.key;
          void this.renderList();
        })
        .catch((e) => new Notice(`优先级更新失败：${(e as Error).message}`))
        .finally(() => btn.removeClass("omni-btn-disabled"));
    });
  }

  private addOrganizeButton(parent: HTMLElement, item: CollectionDTO): void {
    const btn = parent.createEl("button", { text: organizeLabel(item.organizeStatus), cls: "omni-act" });
    btn.addEventListener("click", () => {
      btn.addClass("omni-btn-disabled");
      btn.setText("处理中…");
      void this.source
        .onOrganize(item.id, nextOrganizeState(item.organizeStatus))
        .then(() => {
          item.organizeStatus = nextOrganizeState(item.organizeStatus);
          void this.renderList();
        })
        .catch((e) => {
          btn.removeClass("omni-btn-disabled");
          btn.setText(organizeLabel(item.organizeStatus));
          new Notice(`更新失败：${(e as Error).message}`);
        });
    });
  }

  private promptTag(item: CollectionDTO): void {
    new PromptModal(this.app, `给「${item.title.slice(0, 20)}」打 Tag`, "输入标签名", (tag) => {
      void this.source
        .onTag(item.id, tag)
        .then(() => {
          item.tags = [...(item.tags ?? []), tag];
          void this.renderList();
        })
        .catch((e) => new Notice(`Tag 添加失败：${(e as Error).message}`));
    }).open();
  }

  private promptTopic(item: CollectionDTO): void {
    new PromptModal(this.app, `把「${item.title.slice(0, 20)}」归入 Topic`, "输入 Topic 名", (topic) => {
      void this.source
        .onTopic(item.id, topic)
        .then(() => {
          item.topics = [...(item.topics ?? []), topic];
          void this.renderList();
        })
        .catch((e) => new Notice(`Topic 添加失败：${(e as Error).message}`));
    }).open();
  }

  private currentItems(): CollectionDTO[] {
    const filter: CollectionFilter = {};
    if (this.statusFilter === "unorganized") filter.status = "unorganized";
    else if (this.statusFilter === "organized") filter.status = "organized";
    else if (this.statusFilter === "archived") filter.status = "archived";
    if (this.priorityFilter !== "all") filter.priority = this.priorityFilter;
    let items = filterCollections(this.items, filter);
    if (this.platformFilter) items = items.filter((i) => i.platform === this.platformFilter);
    if (this.saveTypeFilter !== "all") items = items.filter((i) => i.saveType === this.saveTypeFilter);
    return items;
  }

  private renderBatchBar(): void {
    const bar = this.batchBarEl;
    bar.empty();
    if (!this.selecting) {
      bar.addClass("is-hidden");
      return;
    }
    bar.removeClass("is-hidden");
    bar.createEl("span", { text: `已选 ${this.selected.size} 条`, cls: "omni-meta-text" });
    bar.createEl("button", { text: "全选当前", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => {
      for (const i of this.currentItems()) this.selected.add(i.id);
      this.renderBatchBar();
      void this.renderList();
    });
    bar.createEl("button", { text: "清除", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => {
      this.selected.clear();
      this.renderBatchBar();
      void this.renderList();
    });
    bar.createEl("button", { text: "批量 Tag", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.promptBatch("tag"));
    bar.createEl("button", { text: "批量 Topic", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.promptBatch("topic"));
    bar.createEl("button", { text: "设为重要", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.runBatch("priority", "important"));
    bar.createEl("button", { text: "标记已整理", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.runBatch("organize", "organized"));
    bar.createEl("button", { text: "转收藏", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.runBatch("convert", "favorited"));
    bar.createEl("button", { text: "归档", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.runBatch("convert", "archived"));
  }

  private promptBatch(action: "tag" | "topic"): void {
    new PromptModal(this.app, action === "tag" ? "批量打 Tag" : "批量归入 Topic", action === "tag" ? "输入标签名" : "输入 Topic 名", (v) => {
      void this.runBatch(action, v);
    }).open();
  }

  private async runBatch(action: "tag" | "topic" | "priority" | "organize" | "convert", value: string): Promise<void> {
    const ids = [...this.selected];
    if (ids.length === 0) {
      new Notice("请先勾选收藏");
      return;
    }
    try {
      await this.source.onBatch(ids, action, value);
      new Notice(`已批量处理 ${ids.length} 条`);
      this.selected.clear();
      this.renderBatchBar();
      await this.refreshList();
    } catch (err) {
      new Notice(`批量操作失败：${(err as Error).message}`);
    }
  }

  async onClose(): Promise<void> {}
}
