import { Modal, Notice, type App } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";
import { buildManualTemplate, type ManualVocabulary } from "./manual-template.js";

export type { ManualVocabulary } from "./manual-template.js";
export { buildManualTemplate } from "./manual-template.js";

export interface ManualAISource {
  submit(collectionId: string, reply: string): Promise<void>;
}

/** 打开 Manual AI 弹窗（详情页 / 侧边栏 / 全局入口共用）。 */
export function openManualAIModal(
  app: App,
  item: CollectionDTO,
  source: ManualAISource,
  vocabulary?: ManualVocabulary,
): void {
  const modal = new Modal(app);
  modal.titleEl.setText("Manual 模式 AI（PRD 19.3）");
  modal.contentEl.createEl("h4", { text: "1) 复制模板到任意 AI 工具（ChatGPT/DeepSeek 等）" });
  const tpl = modal.contentEl.createEl("textarea", {
    attr: { rows: "12", style: "width:100%;" },
  });
  tpl.value = buildManualTemplate(item, vocabulary);
  modal.contentEl
    .createEl("button", { text: "复制模板", cls: "omni-btn omni-btn-sm" })
    .addEventListener("click", () => {
      tpl.select();
      document.execCommand("copy");
      new Notice("模板已复制");
    });
  modal.contentEl.createEl("h4", { text: "2) 粘贴 AI 返回的结果" });
  const reply = modal.contentEl.createEl("textarea", {
    attr: { rows: "8", style: "width:100%;" },
  });
  modal.contentEl
    .createEl("button", { text: "提交并生成建议", cls: "omni-btn omni-btn-primary" })
    .addEventListener("click", () => {
      if (!reply.value.trim()) {
        new Notice("请粘贴 AI 回复");
        return;
      }
      void source
        .submit(item.id, reply.value)
        .then(() => {
          modal.close();
          new Notice("建议已生成（请到 AI 建议审核确认）");
        })
        .catch((e: unknown) => new Notice(`提交失败：${(e as Error).message}`));
    });
  modal.open();
}
