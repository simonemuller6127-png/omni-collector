import { ItemView, WorkspaceLeaf } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";
import { filterCollections, nextOrganizeState, type CollectionFilter } from "./helpers.js";

export const VIEW_TYPE_OMNI_LIST = "omni-collector-list";

export interface ListDataSource {
  list(): Promise<CollectionDTO[]>;
  onOrganize(collectionId: string, state: CollectionDTO["organizeStatus"]): Promise<void>;
}

export class OmniCollectionListView extends ItemView {
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
    const filter: CollectionFilter = {};
    const list = container.createEl("div", { cls: "omni-list" });
    const render = async (): Promise<void> => {
      list.empty();
      const items = filterCollections(await this.source.list(), filter);
      for (const item of items) {
        const row = list.createEl("div", { cls: "omni-row" });
        row.createEl("a", { text: item.title, href: item.url, cls: "omni-title" });
        row.createEl("span", { text: `[${item.priority}]`, cls: "omni-badge" });
        row
          .createEl("button", {
            text: item.organizeStatus === "organized" ? "已整理" : "标记整理",
            cls: "omni-act",
          })
          .addEventListener("click", () => {
            void this.source
              .onOrganize(item.id, nextOrganizeState(item.organizeStatus))
              .then(() => render());
          });
      }
    };
    await render();
  }

  async onClose(): Promise<void> {
    // 视图关闭不额外处理
  }
}
