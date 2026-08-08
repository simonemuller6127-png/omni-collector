import { ItemView, Modal, Notice, WorkspaceLeaf } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";

export const VIEW_TYPE_OMNI_DETAIL = "omni-collector-detail";

export interface DetailDataSource {
  get(collectionId: string): Promise<CollectionDTO | null>;
  fetchText(url: string): Promise<{ title?: string; text?: string }>;
  onOrganize(collectionId: string, state: CollectionDTO["organizeStatus"]): Promise<void>;
  onPriority(collectionId: string, priority: CollectionDTO["priority"]): Promise<void>;
  onTag(collectionId: string, tag: string): Promise<void>;
  onTopic(collectionId: string, topic: string): Promise<void>;
}

const PLATFORM_LABELS: Record<string, string> = {
  bilibili: "B站",
  youtube: "YouTube",
  xiaohongshu: "小红书",
  makerworld: "MakerWorld",
  xiaoheihe: "小黑盒",
};

/** 平台官方可嵌入播放器（复用平台能力，不搬浏览器）。 */
function embedUrl(item: CollectionDTO): string | null {
  if (item.platform === "bilibili") {
    const m = /(BV[0-9A-Za-z]+)/.exec(item.url);
    return m ? `https://player.bilibili.com/player.html?bvid=${m[1]}&page=1` : null;
  }
  if (item.platform === "youtube") {
    const m = /(?:v=|youtu\.be\/|shorts\/)([0-9A-Za-z_-]{11})/.exec(item.url);
    return m ? `https://www.youtube.com/embed/${m[1]}` : null;
  }
  return null;
}

export class OmniCollectionDetailView extends ItemView {
  private currentId = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly source: DetailDataSource,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OMNI_DETAIL;
  }

  getDisplayText(): string {
    return "Omni Collector 内容预览";
  }

  getState(): Record<string, unknown> {
    return { collectionId: this.currentId };
  }

  async setState(state: Record<string, unknown>): Promise<void> {
    this.currentId = (state.collectionId as string) ?? "";
    await this.renderContent();
  }

  async onOpen(): Promise<void> {
    this.currentId = (this.getState().collectionId as string) ?? "";
    await this.renderContent();
  }

  private async renderContent(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("omni-detail");
    if (!this.currentId) {
      container.createEl("div", { text: "未选择收藏", cls: "omni-empty" });
      return;
    }
    const item = await this.source.get(this.currentId);
    if (!item) {
      container.createEl("div", { text: "收藏不存在", cls: "omni-empty" });
      return;
    }

    // 封面
    if (item.coverUrl) {
      container.createEl("img", { cls: "omni-detail-cover", attr: { src: item.coverUrl, referrerpolicy: "no-referrer" } });
    }

    // 标题 + 元信息
    container.createEl("div", { text: item.title || item.platformItemId, cls: "omni-detail-title" });
    const meta = container.createEl("div", { cls: "omni-row-meta" });
    meta.createEl("span", { text: PLATFORM_LABELS[item.platform] ?? item.platform, cls: "omni-badge omni-badge-platform" });
    meta.createEl("span", { text: item.author ?? "未知作者", cls: "omni-badge" });
    meta.createEl("span", { text: item.contentType === "video" ? "视频" : item.contentType, cls: "omni-badge" });
    meta.createEl("span", { text: new Date(item.collectedAt).toLocaleDateString("zh-CN"), cls: "omni-meta-text" });

    // 内嵌播放器（B站 / YouTube）
    const embed = embedUrl(item);
    if (embed) {
      container.createEl("div", { cls: "omni-detail-player" }).createEl("iframe", {
        attr: { src: embed, allow: "fullscreen; picture-in-picture; encrypted-media", allowfullscreen: "", style: "width:100%;aspect-ratio:16/9;border:0;border-radius:8px;" },
      });
    } else {
      container
        .createEl("button", { text: "在浏览器打开原文", cls: "omni-btn omni-btn-primary" })
        .addEventListener("click", () => {
          void window.open(item.url, "_blank");
        });
    }

    // 描述
    if (item.description) {
      container.createEl("div", { text: "简介", cls: "omni-section-title" });
      container.createEl("div", { text: item.description, cls: "omni-detail-desc" });
    }

    // 正文（按需抓取，不落盘）
    const bodySection = container.createEl("div", { cls: "omni-detail-body" });
    const bodyBtn = bodySection.createEl("button", { text: "加载正文", cls: "omni-btn omni-btn-sm" });
    const bodyText = bodySection.createEl("div", { cls: "omni-detail-desc", attr: { style: "display:none;" } });
    bodyBtn.addEventListener("click", () => {
      bodyBtn.setText("加载中…");
      bodyBtn.addClass("omni-btn-disabled");
      void this.source
        .fetchText(item.url)
        .then((res) => {
          bodyBtn.setText("重新加载正文");
          bodyBtn.removeClass("omni-btn-disabled");
          if (res.text) {
            bodyText.setText(res.text);
            bodyText.show();
          } else {
            bodyText.setText("正文暂不可用（平台限制或需重新同步）");
            bodyText.show();
          }
        })
        .catch((e) => {
          bodyBtn.setText("加载正文");
          bodyBtn.removeClass("omni-btn-disabled");
          new Notice(`正文加载失败：${(e as Error).message}`);
        });
    });

    // Tags / Topics
    const chips = container.createEl("div", { cls: "omni-detail-chips" });
    for (const t of item.tags ?? []) chips.createEl("span", { text: `#${t}`, cls: "omni-badge omni-badge-tag" });
    for (const t of item.topics ?? []) chips.createEl("span", { text: `◎${t}`, cls: "omni-badge omni-badge-topic" });
    const tagBtn = chips.createEl("button", { text: "＋Tag", cls: "omni-chip" });
    tagBtn.addEventListener("click", () => this.promptText("打 Tag", "输入标签名", (v) => this.source.onTag(item.id, v)));
    const topicBtn = chips.createEl("button", { text: "＋Topic", cls: "omni-chip" });
    topicBtn.addEventListener("click", () => this.promptText("归入 Topic", "输入 Topic 名", (v) => this.source.onTopic(item.id, v)));

    // 评论（已同步的）
    if ((item.comments ?? []).length > 0) {
      container.createEl("div", { text: "评论", cls: "omni-section-title" });
      const comments = container.createEl("div", { cls: "omni-detail-comments" });
      for (const c of item.comments ?? []) {
        const row = comments.createEl("div", { cls: "omni-comment" });
        row.createEl("span", { text: c.author, cls: "omni-comment-author" });
        row.createEl("span", { text: c.content, cls: "omni-comment-content" });
      }
    }

    // 本地关联文件
    if ((item.linkedFiles ?? []).length > 0) {
      container.createEl("div", { text: "本地文件", cls: "omni-section-title" });
      const files = container.createEl("div", { cls: "omni-detail-files" });
      for (const f of item.linkedFiles ?? []) {
        const name = f.split(/[\\/]/).pop() ?? f;
        files.createEl("div", { text: `📄 ${name}`, cls: "omni-file-row", attr: { title: f } });
      }
    }

    // 整理操作
    const actions = container.createEl("div", { cls: "omni-detail-actions" });
    const orgBtn = actions.createEl("button", { text: `整理：${item.organizeStatus}（点击推进）`, cls: "omni-act" });
    orgBtn.addEventListener("click", () => {
      const next = item.organizeStatus === "unorganized" ? "viewed" : item.organizeStatus === "viewed" ? "organized" : "archived";
      void this.source.onOrganize(item.id, next).then(() => {
        item.organizeStatus = next;
        orgBtn.setText(`整理：${next}（点击推进）`);
      });
    });
    const priBtn = actions.createEl("button", { text: `优先级：${item.priority}`, cls: "omni-act omni-act-priority" });
    priBtn.addEventListener("click", () => {
      const order: CollectionDTO["priority"][] = ["normal", "important", "project", "knowledge"];
      const next = order[(order.indexOf(item.priority) + 1) % order.length];
      void this.source.onPriority(item.id, next).then(() => {
        item.priority = next;
        priBtn.setText(`优先级：${next}`);
      });
    });
  }

  private promptText(title: string, placeholder: string, submit: (v: string) => Promise<void>): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText(title);
    const input = modal.contentEl.createEl("input", { type: "text", placeholder });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        void submit(input.value.trim())
          .then(() => {
            modal.close();
            new Notice("已保存");
          })
          .catch((err) => new Notice(`保存失败：${(err as Error).message}`));
      }
    });
    modal.contentEl.createEl("button", { text: "确定", cls: "omni-btn omni-btn-primary" }).addEventListener("click", () => {
      if (input.value.trim()) {
        void submit(input.value.trim())
          .then(() => {
            modal.close();
            new Notice("已保存");
          })
          .catch((err) => new Notice(`保存失败：${(err as Error).message}`));
      }
    });
    modal.open();
  }

  async onClose(): Promise<void> {}
}
