import { ItemView, WorkspaceLeaf } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";
import { nextOrganizeState } from "./helpers.js";

export const VIEW_TYPE_OMNI_DETAIL = "omni-collector-detail";

export interface DetailDataSource {
  get(collectionId: string): Promise<CollectionDTO>;
  onOrganize(collectionId: string, state: CollectionDTO["organizeStatus"]): Promise<void>;
}

export class OmniCollectionDetailView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly collectionId: string,
    private readonly source: DetailDataSource,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OMNI_DETAIL;
  }

  getDisplayText(): string {
    return "Omni Collector 详情";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    const item = await this.source.get(this.collectionId);

    const system = container.createEl("section", { cls: "omni-system" });
    system.createEl("h3", { text: "系统信息（只读）" });
    system.createEl("div", { text: `标题：${item.title}` });
    system.createEl("div", { text: `平台：${item.platform}（${item.contentType}）` });
    system.createEl("div", { text: `链接：${item.url}` });
    system.createEl("div", { text: `同步状态：${item.syncStatus}` });

    const organize = container.createEl("section", { cls: "omni-organize" });
    organize.createEl("h3", { text: "整理与优先级" });
    const badge = organize.createEl("div", {
      text: `整理：${item.organizeStatus} / 优先级：${item.priority}`,
    });
    organize
      .createEl("button", { text: "推进整理状态", cls: "omni-act" })
      .addEventListener("click", () => {
        void this.source
          .onOrganize(item.id, nextOrganizeState(item.organizeStatus))
          .then(() => {
            badge.setText(`整理：${nextOrganizeState(item.organizeStatus)} / 优先级：${item.priority}`);
          });
      });

    const user = container.createEl("section", { cls: "omni-user" });
    user.createEl("h3", { text: "用户内容区（系统永不覆盖）" });
    user.createEl("div", { text: "我的笔记 / 精选评论 / 评分与优先级 由用户在 Markdown 中维护（ADR-006）。" });
  }

  async onClose(): Promise<void> {
    // 无额外清理
  }
}
