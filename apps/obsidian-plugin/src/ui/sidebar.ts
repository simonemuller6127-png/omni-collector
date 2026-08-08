import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { EngineClient } from "../comm/socket-client.js";

export const VIEW_TYPE_OMNI = "omni-collector-view";

export interface OmniController {
  openCollectionList(): Promise<void>;
  openAiReview(): Promise<void>;
  openSettings(): Promise<void>;
  startEngine(): Promise<void>;
  syncAll(): Promise<void>;
  syncPlatform(platform: string): Promise<void>;
  generateMarkdown(): Promise<void>;
  runGroupRecognition(): Promise<void>;
}

const PLATFORMS: Array<{ key: string; label: string }> = [
  { key: "bilibili", label: "B站" },
  { key: "youtube", label: "YouTube" },
  { key: "xiaohongshu", label: "小红书" },
  { key: "makerworld", label: "MakerWorld" },
  { key: "xiaoheihe", label: "小黑盒" },
];

export class OmniSidebarView extends ItemView {
  private statusEl!: HTMLElement;
  private engineState: "unknown" | "ready" | "closing" | "error" = "unknown";
  private platformEls = new Map<string, HTMLElement>();
  private actionButtons: HTMLElement[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private readonly engine: EngineClient,
    private readonly ctrl: OmniController,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OMNI;
  }

  getDisplayText(): string {
    return "Omni Collector";
  }

  getIcon(): string {
    return "sparkles";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("omni-panel");

    // 标题 + 引擎状态
    container.createEl("div", { text: "Omni Collector", cls: "omni-panel-title" });
    const statusRow = container.createEl("div", { cls: "omni-status-row" });
    const dot = statusRow.createEl("span", { cls: "omni-dot omni-dot-unknown" });
    this.statusEl = statusRow.createEl("span", { text: "Engine: 未连接", cls: "omni-status-text" });
    statusRow
      .createEl("button", { text: "启动引擎", cls: "omni-btn omni-btn-sm" })
      .addEventListener("click", () => {
        void this.withBusy(this.ctrl.startEngine());
      });

    // 同步区
    container.createEl("div", { text: "同步", cls: "omni-section-title" });
    container
      .createEl("button", { text: "同步全部平台", cls: "omni-btn omni-btn-primary" })
      .addEventListener("click", () => {
        void this.withBusy(this.ctrl.syncAll());
      });
    const grid = container.createEl("div", { cls: "omni-platform-grid" });
    for (const p of PLATFORMS) {
      const row = grid.createEl("div", { cls: "omni-platform-row" });
      row
        .createEl("button", { text: p.label, cls: "omni-btn omni-btn-sm" })
        .addEventListener("click", () => {
          void this.withBusy(this.ctrl.syncPlatform(p.key));
        });
      const meta = row.createEl("span", { cls: "omni-platform-meta" });
      this.platformEls.set(p.key, meta);
    }

    // 内容区
    container.createEl("div", { text: "内容", cls: "omni-section-title" });
    const contentRow = container.createEl("div", { cls: "omni-btn-grid" });
    this.addActionButton(contentRow, "收藏列表", () => this.ctrl.openCollectionList());
    this.addActionButton(contentRow, "生成 Markdown", () => this.withBusy(this.ctrl.generateMarkdown()));
    this.addActionButton(contentRow, "分组识别", () => this.withBusy(this.ctrl.runGroupRecognition()));
    this.addActionButton(contentRow, "AI 建议审核", () => this.ctrl.openAiReview());

    // 设置
    container
      .createEl("button", { text: "打开设置", cls: "omni-btn" })
      .addEventListener("click", () => {
        void this.ctrl.openSettings();
      });

    // 引擎事件
    this.engine.onEvent((msg) => {
      if (msg.message_type === "ENGINE_READY") {
        this.setEngineState("ready");
      } else if (msg.message_type === "ENGINE_CLOSING") {
        this.setEngineState("closing");
      } else if (msg.message_type === "TASK_ERROR") {
        this.setEngineState("error", String(msg.payload.code ?? ""));
      }
    });

    // 拉取平台状态
    void this.refreshPlatformStatus();
  }

  async onClose(): Promise<void> {}

  private addActionButton(parent: HTMLElement, label: string, cb: () => void): void {
    const btn = parent.createEl("button", { text: label, cls: "omni-btn" });
    btn.addEventListener("click", cb);
    this.actionButtons.push(btn);
  }

  private setEngineState(state: "unknown" | "ready" | "closing" | "error", code = ""): void {
    this.engineState = state;
    const dot = this.containerEl.querySelector(".omni-dot");
    dot?.removeClass("omni-dot-unknown", "omni-dot-ready", "omni-dot-closing", "omni-dot-error");
    dot?.addClass(`omni-dot-${state}`);
    const text = state === "ready" ? "Engine: READY" : state === "closing" ? "Engine: 已关闭" : state === "error" ? `Engine: 错误 ${code}` : "Engine: 未连接";
    this.statusEl.setText(text);
  }

  private async refreshPlatformStatus(): Promise<void> {
    try {
      const platforms = await this.engine.listPlatformStatus();
      for (const p of platforms) {
        const el = this.platformEls.get(p.platform);
        if (!el) continue;
        const last = p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleDateString("zh-CN") : "未同步";
        el.setText(`${p.count} 条 · ${last}`);
      }
    } catch {
      // 引擎未启动时静默
    }
  }

  private async withBusy(p: Promise<unknown>): Promise<void> {
    for (const b of this.actionButtons) b.addClass("omni-btn-disabled");
    try {
      await p;
    } catch (err) {
      new Notice(`Omni Collector: ${(err as Error).message}`);
    } finally {
      for (const b of this.actionButtons) b.removeClass("omni-btn-disabled");
      void this.refreshPlatformStatus();
    }
  }
}
