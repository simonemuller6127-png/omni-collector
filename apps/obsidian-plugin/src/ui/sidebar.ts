import { ItemView, WorkspaceLeaf } from "obsidian";
import type { EngineClient } from "../comm/socket-client.js";

export const VIEW_TYPE_OMNI = "omni-collector-view";

export class OmniSidebarView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly engine: EngineClient,
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
    container.createEl("div", { text: "Omni Collector", cls: "omni-title" });
    const status = container.createEl("div", { text: "Engine: 未知", cls: "omni-status" });
    this.engine.onEvent((msg) => {
      if (msg.message_type === "ENGINE_READY") {
        status.setText("Engine: READY");
      } else if (msg.message_type === "ENGINE_CLOSING") {
        status.setText("Engine: 已关闭");
      } else if (msg.message_type === "TASK_ERROR") {
        status.setText(`Engine: 错误 ${String(msg.payload.code ?? "")}`);
      }
    });
  }

  async onClose(): Promise<void> {
    // 视图关闭不做额外处理；Engine 生命周期由 Plugin 管理
  }
}
