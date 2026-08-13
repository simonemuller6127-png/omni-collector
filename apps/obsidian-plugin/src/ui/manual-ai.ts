import { Modal, Notice, type App } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";

/** PRD 19.3 Manual 模式：模板 + 粘贴 AI 回复 + 回填为 Suggestion。 */
export function buildManualTemplate(item: CollectionDTO): string {
  return [
    "你是收藏整理助手。根据下面的收藏内容，输出 JSON 数组，元素结构：",
    '{"type":"suggested_tag|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}。',
    "suggested_tag 的 payload 为字符串数组 JSON；suggested_topic 为单个主题字符串；",
    "suggested_summary 为 1-2 句摘要字符串；suggested_group 为收藏分组名。只输出 JSON，不要额外解释。",
    "",
    `已有Tag：${(item.tags ?? []).length > 0 ? (item.tags ?? []).join(", ") : "无"}`,
    "--- 收藏内容 ---",
    `平台：${item.platform}`,
    `标题：${item.title}`,
    `作者：${item.author ?? "未知"}`,
    `链接：${item.url}`,
    item.description ? `简介：${item.description.slice(0, 500)}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export interface ManualAISource {
  submit(collectionId: string, reply: string): Promise<void>;
}

/** 打开 Manual AI 弹窗（详情页 / 侧边栏 / 全局入口共用）。 */
export function openManualAIModal(
  app: App,
  item: CollectionDTO,
  source: ManualAISource,
): void {
  const modal = new Modal(app);
  modal.titleEl.setText("Manual 模式 AI（PRD 19.3）");
  modal.contentEl.createEl("h4", { text: "1) 复制模板到任意 AI 工具（ChatGPT/DeepSeek 等）" });
  const tpl = modal.contentEl.createEl("textarea", {
    attr: { rows: "12", style: "width:100%;" },
  });
  tpl.value = buildManualTemplate(item);
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
