import { Modal, Notice, type App } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";
import { buildManualBatchTemplate, type ManualVocabulary } from "./manual-template.js";

export type { ManualVocabulary } from "./manual-template.js";
export { buildManualBatchTemplate } from "./manual-template.js";

export interface ManualBatchSource {
  submit(collectionIds: string[], reply: string): Promise<number>;
}

/** 打开 Manual AI 批量弹窗：复制模板 → 粘贴批量回复 → 生成逐条建议。 */
export function openManualAIBatchModal(
  app: App,
  items: CollectionDTO[],
  source: ManualBatchSource,
  vocabulary?: ManualVocabulary,
): void {
  const modal = new Modal(app);
  modal.titleEl.setText(`Manual AI 批量（${items.length} 条）`);
  modal.contentEl.createEl("h4", { text: "1) 复制模板到任意 AI 工具（一次处理全部收藏）" });
  const tpl = modal.contentEl.createEl("textarea", {
    attr: { rows: "16", style: "width:100%;" },
  });
  tpl.value = buildManualBatchTemplate(items, vocabulary);
  modal.contentEl
    .createEl("button", { text: "复制模板", cls: "omni-btn omni-btn-sm" })
    .addEventListener("click", () => {
      tpl.select();
      document.execCommand("copy");
      new Notice("模板已复制");
    });
  modal.contentEl.createEl("h4", { text: "2) 粘贴 AI 返回的批量结果" });
  const reply = modal.contentEl.createEl("textarea", {
    attr: { rows: "10", style: "width:100%;" },
  });
  modal.contentEl
    .createEl("button", { text: "提交并生成建议", cls: "omni-btn omni-btn-primary" })
    .addEventListener("click", () => {
      if (!reply.value.trim()) {
        new Notice("请粘贴 AI 回复");
        return;
      }
      void source
        .submit(
          items.map((i) => i.id),
          reply.value,
        )
        .then((saved) => {
          modal.close();
          new Notice(`批量建议已生成（${saved} 条，请到 AI 建议审核确认）`);
        })
        .catch((e: unknown) => new Notice(`提交失败：${(e as Error).message}`));
    });
  modal.open();
}
