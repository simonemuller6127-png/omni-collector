import { Modal, Notice, type App } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";

/** PRD 19.3 批量版：把 N 条收藏打包成一份带索引的模板。 */
export function buildManualBatchTemplate(items: CollectionDTO[]): string {
  const list = items
    .map(
      (item, i) =>
        `${i}. 标题：${item.title}\n   平台：${item.platform}\n   链接：${item.url}\n` +
        (item.description ? `   简介：${item.description.slice(0, 300)}\n` : ""),
    )
    .join("\n");
  return [
    "你是收藏整理助手。下面有 " +
      items.length +
      " 条收藏，请逐条输出 JSON 数组，元素结构：",
    '[{"index":0,"suggestions":[{"type":"suggested_tag|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}]}]',
    "index 必须与收藏编号一一对应（0 开始）；suggested_tag 的 payload 为字符串数组 JSON；",
    "suggested_topic 为单个主题字符串；suggested_summary 为 1-2 句摘要；",
    "suggested_group 为收藏分组名。只输出 JSON，不要额外解释。",
    "",
    "--- 收藏列表 ---",
    list,
  ].join("\n");
}

export interface ManualBatchSource {
  submit(collectionIds: string[], reply: string): Promise<number>;
}

/** 打开 Manual AI 批量弹窗：复制模板 → 粘贴批量回复 → 生成逐条建议。 */
export function openManualAIBatchModal(
  app: App,
  items: CollectionDTO[],
  source: ManualBatchSource,
): void {
  const modal = new Modal(app);
  modal.titleEl.setText(`Manual AI 批量（${items.length} 条）`);
  modal.contentEl.createEl("h4", { text: "1) 复制模板到任意 AI 工具（一次处理全部收藏）" });
  const tpl = modal.contentEl.createEl("textarea", {
    attr: { rows: "16", style: "width:100%;" },
  });
  tpl.value = buildManualBatchTemplate(items);
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
