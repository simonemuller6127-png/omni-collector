import { ItemView, Modal, Notice, WorkspaceLeaf } from "obsidian";
import type { CollectionDTO } from "@omni/shared-core";
import { openManualAIModal } from "./manual-ai.js";
import { renderRating } from "../markdown/markdown-builder.js";

export const VIEW_TYPE_OMNI_DETAIL = "omni-collector-detail";

export interface DetailDataSource {
  get(collectionId: string): Promise<CollectionDTO | null>;
  fetchText(url: string): Promise<{ title?: string; text?: string; comments?: Array<{ author: string; content: string; likeCount: number }> }>;
  onOrganize(collectionId: string, state: CollectionDTO["organizeStatus"]): Promise<void>;
  onPriority(collectionId: string, priority: CollectionDTO["priority"]): Promise<void>;
  onTag(collectionId: string, tag: string): Promise<void>;
  onTopic(collectionId: string, topic: string): Promise<void>;
  /** 手动评分 1~5（0=清除），仅写 SQLite 同步副本。 */
  onRating(collectionId: string, rating: number): Promise<void>;
  /** 精选评论切换（PRD 7.3），仅写 SQLite 同步副本。 */
  onStarComment(collectionId: string, commentId: string, starred: boolean): Promise<void>;
  /** 把最新评分物化进 Markdown 用户区（ADR-006）。 */
  materializeRating(dto: CollectionDTO, rating: number): Promise<void>;
  /** 把最新精选评论列表物化进 Markdown 用户区。 */
  materializeStarredComments(dto: CollectionDTO): Promise<void>;
  openLocalFile(filePath: string): void;
  ensureCover(url: string): Promise<string | null>;
  submitManualAI(collectionId: string, reply: string): Promise<void>;
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

    // 封面（本地缓存，加速显示）
    if (item.coverUrl) {
      const img = container.createEl("img", { cls: "omni-detail-cover", attr: { referrerpolicy: "no-referrer" } });
      void this.source.ensureCover(item.coverUrl).then((src) => {
        if (src) img.setAttribute("src", src);
      });
    }

    container.createEl("div", { text: item.title || item.platformItemId, cls: "omni-detail-title" });
    const meta = container.createEl("div", { cls: "omni-row-meta" });
    if (item.contentStatus === "deleted") {
      meta.createEl("span", { text: "失效", cls: "omni-badge omni-badge-deleted" });
    }
    meta.createEl("span", { text: PLATFORM_LABELS[item.platform] ?? item.platform, cls: "omni-badge omni-badge-platform" });
    meta.createEl("span", { text: item.author ?? "未知作者", cls: "omni-badge" });
    meta.createEl("span", { text: item.contentType === "video" ? "视频" : item.contentType, cls: "omni-badge" });
    meta.createEl("span", { text: new Date(item.collectedAt).toLocaleDateString("zh-CN"), cls: "omni-meta-text" });

    // 内嵌播放器（B站 / YouTube）
    const embed = embedUrl(item);
    if (embed) {
      container.createEl("div", { cls: "omni-detail-player" }).createEl("iframe", {
        attr: {
          src: embed,
          allow: "fullscreen; picture-in-picture; encrypted-media",
          allowfullscreen: "",
          style: "width:100%;aspect-ratio:16/9;border:0;border-radius:8px;",
        },
      });
    } else {
      container
        .createEl("button", { text: "在浏览器打开原文", cls: "omni-btn omni-btn-primary" })
        .addEventListener("click", () => {
          void window.open(item.url, "_blank");
        });
    }

    // 简介
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
          bodyText.setText(res.text || "正文暂不可用（平台限制或需重新同步）");
          bodyText.show();
          if (res.comments && res.comments.length > 0) {
            let section = container.querySelector(".omni-detail-comments");
            if (!section) {
              container.createEl("div", { text: "评论", cls: "omni-section-title" });
              section = container.createEl("div", { cls: "omni-detail-comments" });
            }
            for (const c of res.comments) {
              const row = section.createEl("div", { cls: "omni-comment" });
              row.createEl("span", { text: c.author, cls: "omni-comment-author" });
              row.createEl("span", { text: c.content, cls: "omni-comment-content" });
            }
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
    const manualBtn = chips.createEl("button", { text: "Manual AI", cls: "omni-chip" });
    manualBtn.addEventListener("click", () =>
      openManualAIModal(this.app, item, { submit: (id, reply) => this.source.submitManualAI(id, reply) }),
    );

    // 已同步评论（PRD 7.3：可手动精选，精选写入 Markdown 用户区）
    if ((item.comments ?? []).length > 0) {
      container.createEl("div", { text: "评论", cls: "omni-section-title" });
      const comments = container.createEl("div", { cls: "omni-detail-comments" });
      for (const c of item.comments ?? []) {
        const row = comments.createEl("div", { cls: `omni-comment${c.starred ? " omni-comment-starred" : ""}` });
        row.createEl("span", { text: c.author, cls: "omni-comment-author" });
        row.createEl("span", { text: c.content, cls: "omni-comment-content" });
        if (c.id) {
          const starBtn = row.createEl("button", {
            text: c.starred ? "★" : "☆",
            cls: `omni-star${c.starred ? " omni-star-on" : ""}`,
            attr: { title: c.starred ? "取消精选" : "精选此评论" },
          });
          starBtn.addEventListener("click", () => {
            const next = !c.starred;
            void this.source
              .onStarComment(item.id, c.id as string, next)
              .then(() => {
                c.starred = next;
                row.toggleClass("omni-comment-starred", next);
                starBtn.setText(next ? "★" : "☆");
                starBtn.toggleClass("omni-star-on", next);
                return this.source.materializeStarredComments(item);
              })
              .catch((e) => new Notice(`精选评论失败：${(e as Error).message}`));
          });
        }
      }
    }

    // 手动评分（PRD 29.2：1~5 星，用户区权威 + SQLite 同步副本）
    const ratingBox = container.createEl("div", { cls: "omni-detail-rating" });
    ratingBox.createEl("span", { text: "我的评分", cls: "omni-section-title" });
    const starsRow = ratingBox.createEl("div", { cls: "omni-rating-stars" });
    let current = item.rating ?? 0;
    const ratingLabel = starsRow.createEl("span", { text: current > 0 ? renderRating(current) : "未评分", cls: "omni-rating-label" });
    const starBtns: HTMLButtonElement[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const star = starsRow.createEl("button", {
        text: i <= current ? "★" : "☆",
        cls: `omni-star${i <= current ? " omni-star-on" : ""}`,
        attr: { title: `${i} 星` },
      });
      starBtns.push(star);
      star.addEventListener("click", () => {
        const next = i === current ? 0 : i; // 再点当前最高星 = 清除
        void this.source
          .onRating(item.id, next)
          .then(() => {
            current = next;
            item.rating = next || null;
            ratingLabel.setText(next > 0 ? renderRating(next) : "未评分");
            for (let j = 1; j <= 5; j += 1) {
              starBtns[j - 1].setText(j <= next ? "★" : "☆");
              starBtns[j - 1].toggleClass("omni-star-on", j <= next);
            }
            return this.source.materializeRating(item, next);
          })
          .catch((e) => new Notice(`评分失败：${(e as Error).message}`));
      });
    }

    // 本地关联文件
    if ((item.linkedFiles ?? []).length > 0) {
      container.createEl("div", { text: "本地文件", cls: "omni-section-title" });
      const files = container.createEl("div", { cls: "omni-detail-files" });
      for (const f of item.linkedFiles ?? []) {
        const name = f.split(/[\\/]/).pop() ?? f;
        files.createEl("div", { text: `📄 ${name}`, cls: "omni-file-row", attr: { title: f } });
      }
      const openBtn = container.createEl("button", { text: "打开笔记", cls: "omni-btn omni-btn-sm" });
      openBtn.addEventListener("click", () => {
        const first = (item.linkedFiles ?? [])[0];
        if (first) this.source.openLocalFile(first);
      });
    }

    // Related Collections（同分组或同实体跨平台）
    if ((item.related ?? []).length > 0) {
      container.createEl("div", { text: "相关收藏", cls: "omni-section-title" });
      const relatedBox = container.createEl("div", { cls: "omni-detail-related" });
      for (const r of item.related ?? []) {
        const row = relatedBox.createEl("div", { cls: "omni-related-row" });
        row.createEl("span", { text: PLATFORM_LABELS[r.platform] ?? r.platform, cls: "omni-badge omni-badge-platform" });
        row.createEl("span", { text: r.title || r.id, cls: "omni-related-title" });
        row.addEventListener("click", () => {
          this.currentId = r.id;
          void this.renderContent();
        });
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
    const done = (): void => {
      if (input.value.trim()) {
        void submit(input.value.trim())
          .then(() => {
            modal.close();
            new Notice("已保存");
          })
          .catch((err) => new Notice(`保存失败：${(err as Error).message}`));
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done();
    });
    modal.contentEl.createEl("button", { text: "确定", cls: "omni-btn omni-btn-primary" }).addEventListener("click", done);
    modal.open();
  }

  async onClose(): Promise<void> {}
}
