import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";
import { filterCollections, nextOrganizeState, type CollectionFilter } from "./helpers.js";

export const VIEW_TYPE_OMNI_LIST = "omni-collector-list";

export interface ListDataSource {
  list(): Promise<CollectionDTO[]>;
  onOrganize(collectionId: string, state: CollectionDTO["organizeStatus"]): Promise<void>;
}

const PLATFORM_LABELS: Record<string, string> = {
  bilibili: "B站",
  youtube: "YT",
  xiaohongshu: "小红书",
  makerworld: "MW",
  xiaoheihe: "小黑盒",
};

type FilterKey = "all" | "unorganized" | "organized" | "important" | "archived";

export class OmniCollectionListView extends ItemView {
  private items: CollectionDTO[] = [];
  private activeFilter: FilterKey = "all";
  private listEl!: HTMLElement;

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

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("omni-list-view");
    container.createEl("div", { text: "Omni Collector 收藏", cls: "omni-panel-title" });

    const toolbar = container.createEl("div", { cls: "omni-toolbar" });
    const filters: Array<{ key: FilterKey; label: string }> = [
      { key: "all", label: "全部" },
      { key: "unorganized", label: "未整理" },
      { key: "organized", label: "已整理" },
      { key: "important", label: "重要" },
      { key: "archived", label: "已归档" },
    ];
    for (const f of filters) {
      toolbar
        .createEl("button", { text: f.label, cls: `omni-chip${this.activeFilter === f.key ? " omni-chip-active" : ""}` })
        .addEventListener("click", () => {
          this.activeFilter = f.key;
          toolbar.empty();
          this.renderToolbar(toolbar);
          void this.renderList();
        });
    }
    toolbar
      .createEl("button", { text: "刷新", cls: "omni-chip" })
      .addEventListener("click", () => {
        void this.refreshList();
      });

    this.listEl = container.createEl("div", { cls: "omni-list" });
    await this.refreshList();
  }

  private renderToolbar(toolbar: HTMLElement): void {
    const filters: Array<{ key: FilterKey; label: string }> = [
      { key: "all", label: "全部" },
      { key: "unorganized", label: "未整理" },
      { key: "organized", label: "已整理" },
      { key: "important", label: "重要" },
      { key: "archived", label: "已归档" },
    ];
    for (const f of filters) {
      toolbar
        .createEl("button", { text: f.label, cls: `omni-chip${this.activeFilter === f.key ? " omni-chip-active" : ""}` })
        .addEventListener("click", () => {
          this.activeFilter = f.key;
          toolbar.empty();
          this.renderToolbar(toolbar);
          void this.renderList();
        });
    }
    toolbar
      .createEl("button", { text: "刷新", cls: "omni-chip" })
      .addEventListener("click", () => {
        void this.refreshList();
      });
  }

  private toFilter(): CollectionFilter {
    switch (this.activeFilter) {
      case "unorganized":
        return { status: "unorganized" };
      case "organized":
        return { status: "organized" };
      case "archived":
        return { status: "archived" };
      case "important":
        return { priority: "important" };
      default:
        return {};
    }
  }

  private async refreshList(): Promise<void> {
    try {
      this.items = await this.source.list();
    } catch (err) {
      new Notice(`Omni Collector: 加载收藏失败 ${(err as Error).message}`);
    }
    await this.renderList();
  }

  private async renderList(): Promise<void> {
    this.listEl.empty();
    const items = filterCollections(this.items, this.toFilter());
    if (items.length === 0) {
      this.listEl.createEl("div", { text: "暂无收藏（先到侧边栏同步）", cls: "omni-empty" });
      return;
    }
    for (const item of items) {
      const row = this.listEl.createEl("div", { cls: "omni-row" });
      const main = row.createEl("div", { cls: "omni-row-main" });
      main.createEl("a", { text: item.title || item.platformItemId, href: item.url, cls: "omni-title" });
      const meta = main.createEl("div", { cls: "omni-row-meta" });
      meta.createEl("span", { text: PLATFORM_LABELS[item.platform] ?? item.platform, cls: "omni-badge omni-badge-platform" });
      meta.createEl("span", { text: item.saveType === "liked" ? "点赞" : item.saveType === "watch_later" ? "稍后再看" : "收藏", cls: "omni-badge" });
      meta.createEl("span", { text: item.priority === "important" ? "重要" : item.priority, cls: "omni-badge omni-badge-priority" });
      if (item.groupName) meta.createEl("span", { text: `组:${item.groupName}`, cls: "omni-badge omni-badge-group" });
      meta.createEl("span", { text: new Date(item.collectedAt).toLocaleDateString("zh-CN"), cls: "omni-meta-text" });
      row
        .createEl("button", {
          text: item.organizeStatus === "organized" ? "已整理 ✓" : "标记整理",
          cls: "omni-act",
        })
        .addEventListener("click", async () => {
          try {
            await this.source.onOrganize(item.id, nextOrganizeState(item.organizeStatus));
            item.organizeStatus = nextOrganizeState(item.organizeStatus);
            await this.renderList();
          } catch (err) {
            new Notice(`Omni Collector: 更新失败 ${(err as Error).message}`);
          }
        });
    }
  }

  async onClose(): Promise<void> {}
}
