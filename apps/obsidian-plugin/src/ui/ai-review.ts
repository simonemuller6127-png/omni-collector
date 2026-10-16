import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { CONTENT_TYPE_VALUES, describePayload, TYPE_LABELS } from "./ai-review-labels.js";

export { CONTENT_TYPE_VALUES, describePayload, TYPE_LABELS } from "./ai-review-labels.js";

export const VIEW_TYPE_OMNI_AI = "omni-collector-ai-review";

export interface AiSuggestionView {
  id: string;
  collection_id: string;
  collection_title?: string;
  suggestion_type: string;
  payload?: string;
  status?: string;
  created_at?: string;
  reviewed_at?: string | null;
}

export interface AiReviewSource {
  listPending(): Promise<AiSuggestionView[]>;
  review(id: string, status: "accepted" | "rejected"): Promise<void>;
  undo(id: string): Promise<void>;
  openManualAI?: () => void;
  openManualAIBatch?: () => void;
}

const CONTENT_TYPE_BADGE_PREFIX = "形式：";

function renderPayload(
  container: HTMLElement,
  suggestion: AiSuggestionView,
): void {
  const render = describePayload(suggestion);
  if (render.kind === "chips") {
    const chips = container.createEl("div", { cls: "omni-chip-row" });
    for (const tag of render.tags) {
      chips.createEl("span", { text: `#${tag}`, cls: "omni-badge omni-badge-tag" });
    }
    return;
  }
  if (render.kind === "content-type") {
    container.createEl("span", {
      text: `${CONTENT_TYPE_BADGE_PREFIX}${render.value || "未知"}`,
      cls: "omni-badge omni-badge-tag",
      attr: { title: "形式标签只写入 collections.content_type，不会进入 Tag Atlas" },
    });
    return;
  }
  if (render.kind === "group") {
    container.createEl("span", {
      text: `分组「${render.name}」 · ${render.count} 条`,
      cls: "omni-badge omni-badge-group",
    });
    return;
  }
  container.createEl("span", { text: render.text, cls: "omni-ai-text" });
}

export class OmniAiReviewView extends ItemView {
  private accepted = new Map<string, AiSuggestionView>();

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

  /** 视图标识图标：AI 审核用「机器人」，与其他视图区分。 */
  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    const header = container.createEl("div", { cls: "omni-toolbar" });
    if (this.source.openManualAI) {
      header
        .createEl("button", { text: "Manual AI 模板", cls: "omni-btn omni-btn-sm" })
        .addEventListener("click", () => this.source.openManualAI?.());
    }
    if (this.source.openManualAIBatch) {
      header
        .createEl("button", { text: "Manual AI 批量", cls: "omni-btn omni-btn-sm" })
        .addEventListener("click", () => this.source.openManualAIBatch?.());
    }
    const list = container.createEl("div", { cls: "omni-ai-list" });
    container.createEl("div", {
      text: "确认后建议才会写入 Tag / Topic / 分组；已确认项 24 小时内可撤销。",
      cls: "omni-hint",
    });
    const render = async (): Promise<void> => {
      list.empty();
      const items = await this.source.listPending().catch((e: unknown) => {
        new Notice(`加载建议失败：${(e as Error).message}`);
        return [];
      });
      for (const s of items) {
        this.renderRow(list, s, false);
      }
      for (const s of this.accepted.values()) {
        this.renderRow(list, s, true);
      }
      if (items.length === 0 && this.accepted.size === 0) {
        list.createEl("div", { text: "暂无待审核的 AI 建议", cls: "omni-empty" });
      }
    };
    await render();
  }

  private renderRow(list: HTMLElement, s: AiSuggestionView, isAccepted: boolean): void {
    const row = list.createEl("div", { cls: "omni-ai-row" });
    const main = row.createEl("div", { cls: "omni-ai-main" });
    const head = main.createEl("div", { cls: "omni-ai-head" });
    head.createEl("span", {
      text: TYPE_LABELS[s.suggestion_type] ?? s.suggestion_type,
      cls: "omni-badge omni-badge-platform",
    });
    head.createEl("span", {
      text: s.collection_title || s.collection_id,
      cls: "omni-ai-title",
    });
    if (isAccepted) {
      head.createEl("span", { text: "已确认（可撤销）", cls: "omni-badge omni-badge-topic" });
    }
    renderPayload(main, s);
    const actions = row.createEl("div", { cls: "omni-row-actions" });
    if (!isAccepted) {
      actions
        .createEl("button", { text: "确认", cls: "omni-act" })
        .addEventListener("click", () => {
          void this.source
            .review(s.id, "accepted")
            .then(() => {
              this.accepted.set(s.id, s);
              void this.reRender();
            })
            .catch((e: unknown) => new Notice(`确认失败：${(e as Error).message}`));
        });
      actions
        .createEl("button", { text: "拒绝", cls: "omni-act omni-act-ghost" })
        .addEventListener("click", () => {
          void this.source
            .review(s.id, "rejected")
            .then(() => this.reRender())
            .catch((e: unknown) => new Notice(`拒绝失败：${(e as Error).message}`));
        });
    } else {
      actions
        .createEl("button", { text: "撤销", cls: "omni-act" })
        .addEventListener("click", () => {
          void this.source
            .undo(s.id)
            .then(() => {
              this.accepted.delete(s.id);
              void this.reRender();
            })
            .catch((e: unknown) => new Notice(`撤销失败：${(e as Error).message}`));
        });
    }
  }

  private async reRender(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    const header = container.createEl("div", { cls: "omni-toolbar" });
    if (this.source.openManualAI) {
      header
        .createEl("button", { text: "Manual AI 模板", cls: "omni-btn omni-btn-sm" })
        .addEventListener("click", () => this.source.openManualAI?.());
    }
    if (this.source.openManualAIBatch) {
      header
        .createEl("button", { text: "Manual AI 批量", cls: "omni-btn omni-btn-sm" })
        .addEventListener("click", () => this.source.openManualAIBatch?.());
    }
    const list = container.createEl("div", { cls: "omni-ai-list" });
    container.createEl("div", {
      text: "确认后建议才会写入 Tag / Topic / 分组；已确认项 24 小时内可撤销。",
      cls: "omni-hint",
    });
    const items = await this.source.listPending().catch(() => []);
    for (const s of items) this.renderRow(list, s, false);
    for (const s of this.accepted.values()) this.renderRow(list, s, true);
    if (items.length === 0 && this.accepted.size === 0) {
      list.createEl("div", { text: "暂无待审核的 AI 建议", cls: "omni-empty" });
    }
  }

  async onClose(): Promise<void> {
    this.accepted.clear();
  }
}
