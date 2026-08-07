import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_OMNI_AI = "omni-collector-ai-review";

export interface AiSuggestionView {
  id: string;
  collection_id: string;
  suggestion_type: string;
  payload?: string;
}

export interface AiReviewSource {
  listPending(): Promise<AiSuggestionView[]>;
  review(id: string, status: "accepted" | "rejected"): Promise<void>;
}

export class OmniAiReviewView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly source: AiReviewSource,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OMNI_AI;
  }

  getDisplayText(): string {
    return "AI 建议审核";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    const list = container.createEl("div", { cls: "omni-ai-list" });
    const render = async (): Promise<void> => {
      list.empty();
      const items = await this.source.listPending();
      for (const s of items) {
        const row = list.createEl("div", { cls: "omni-ai-row" });
        row.createEl("div", {
          text: `[${s.suggestion_type}] ${s.payload ?? ""}`,
          cls: "omni-ai-payload",
        });
        row
          .createEl("button", { text: "确认", cls: "omni-act" })
          .addEventListener("click", () => {
            void this.source.review(s.id, "accepted").then(() => render());
          });
        row
          .createEl("button", { text: "拒绝", cls: "omni-act" })
          .addEventListener("click", () => {
            void this.source.review(s.id, "rejected").then(() => render());
          });
      }
    };
    await render();
  }

  async onClose(): Promise<void> {
    // 无额外清理
  }
}
