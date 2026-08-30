import { ItemView, Modal, Notice, WorkspaceLeaf } from "obsidian";
import type { CollectionDTO, TagDTO, TopicDTO } from "@omni/shared-core";

export const VIEW_TYPE_OMNI_TAGS = "omni-collector-tags";

export interface TagTopicSource {
  listTags(): Promise<TagDTO[]>;
  addAlias(tag: string, alias: string): Promise<void>;
  mergeTags(source: string, target: string): Promise<void>;
  renameTag(tag: string, next: string): Promise<void>;
  listTopics(): Promise<TopicDTO[]>;
  renameTopic(topicId: string, name: string): Promise<void>;
  /** Topic 手动合并：source 成员并入目标名称对应的 Topic 后删除 source。 */
  mergeTopic(sourceId: string, targetName: string): Promise<void>;
  listCollections(): Promise<CollectionDTO[]>;
  openDetail(collectionId: string): Promise<void>;
  refreshMarkdown(): Promise<void>;
}

interface DuplicatePair {
  a: string;
  b: string;
  score: number;
}

function normTag(s: string): string {
  return s.toLowerCase().replace(/[\s\u3000_\-—–.,，。:：;；'"“”‘’()（）]/g, "");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** 疑似重复 Tag（供人工合并；引擎保留权威实现）。 */
function findDuplicates(tags: TagDTO[], limit = 30): DuplicatePair[] {
  const keys = tags.map((t) => ({ raw: t.name, key: normTag(t.name) }));
  const out: DuplicatePair[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = keys[i];
      const b = keys[j];
      if (!a.key || !b.key || a.key === b.key) continue;
      const shorter = a.key.length <= b.key.length ? a : b;
      const longer = shorter === a ? b : a;
      let score = 0;
      if (shorter.key.length >= 2 && (longer.key.startsWith(shorter.key) || longer.key.includes(shorter.key))) {
        const diff = longer.key.length - shorter.key.length;
        if (diff <= 3) score = shorter.key.length / longer.key.length;
      }
      if (score < 0.8) {
        const maxLen = Math.max(a.key.length, b.key.length);
        const sim = maxLen === 0 ? 0 : 1 - levenshtein(a.key, b.key) / maxLen;
        if (sim >= 0.8) score = sim;
      }
      if (score > 0) out.push({ a: a.raw, b: b.raw, score });
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, limit);
}

export class OmniTagTopicView extends ItemView {
  private tab = "tags";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly source: TagTopicSource,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OMNI_TAGS;
  }

  getDisplayText(): string {
    return "Tag / Topic 管理";
  }

  getIcon(): string {
    return "tag";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async onClose(): Promise<void> {}

  private async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("omni-tag-topic");
    const tabs = container.createEl("div", { cls: "omni-tabs" });
    this.tabButton(tabs, "tags", "Tag Atlas", () => {
      this.tab = "tags";
      void this.render();
    });
    this.tabButton(tabs, "topics", "Topic", () => {
      this.tab = "topics";
      void this.render();
    });
    container.createEl("div", {
      text:
        this.tab === "tags"
          ? "Tag 规范化名称统一展示；别名可索引到主 Tag；疑似重复建议人工合并（PRD 16.2）。"
          : "Topic 聚合浏览；收藏笔记与 Topic 聚合页通过 [[wikilink]] 接入官方关系图谱（PRD 17）。",
      cls: "omni-hint",
    });
    if (this.tab === "tags") {
      await this.renderTags(container);
    } else {
      await this.renderTopics(container);
    }
  }

  private tabButton(parent: HTMLElement, key: string, label: string, cb: () => void): void {
    const btn = parent.createEl("button", {
      text: label,
      cls: `omni-chip${this.tab === key ? " omni-chip-active" : ""}`,
    });
    btn.addEventListener("click", cb);
  }

  private async renderTags(container: HTMLElement): Promise<void> {
    const [tags, collections] = await Promise.all([
      this.source.listTags().catch(() => []),
      this.source.listCollections().catch(() => []),
    ]);
    const total = collections.reduce((acc, c) => acc + (c.tags?.length ?? 0), 0);
    container.createEl("div", {
      text: `共 ${tags.length} 个 Tag · ${total} 条绑定`,
      cls: "omni-total",
    });
    const duplicates = findDuplicates(tags);
    if (duplicates.length > 0) {
      const box = container.createEl("div", { cls: "omni-dupe-box" });
      box.createEl("div", { text: "疑似重复（点击一键合并）", cls: "omni-section-title" });
      for (const d of duplicates) {
        const row = box.createEl("div", { cls: "omni-dupe-row" });
        row.createEl("span", { text: `${d.a}  →  ${d.b}`, cls: "omni-dupe-name" });
        row
          .createEl("button", { text: "合并", cls: "omni-act omni-act-ghost" })
          .addEventListener("click", () => {
            void this.runWithNotice(
              () => this.source.mergeTags(d.a, d.b).then(() => this.source.refreshMarkdown()),
              "已合并",
            ).then(() => this.render());
          });
      }
    }
    const list = container.createEl("div", { cls: "omni-list" });
    for (const t of tags) {
      const row = list.createEl("div", { cls: "omni-row" });
      const main = row.createEl("div", { cls: "omni-row-main" });
      main.createEl("div", { text: `#${t.name}`, cls: "omni-title omni-title-tag" });
      main.createEl("div", {
        text: `${t.count} 条` + (t.aliases.length > 0 ? ` · 别名：${t.aliases.join(" / ")}` : ""),
        cls: "omni-row-meta omni-meta-text",
      });
      const actions = row.createEl("div", { cls: "omni-row-actions" });
      this.action(actions, "别名", () => this.prompt("添加别名", "输入别名（如 Frontend）", (v) =>
        this.source.addAlias(t.name, v)));
      this.action(actions, "重命名", () => this.prompt("重命名 Tag", "新名称", (v) =>
        this.source.renameTag(t.name, v).then(() => this.source.refreshMarkdown())));
      this.action(actions, "合并到…", () => this.prompt("合并到", "目标 Tag 名称", (v) =>
        this.source.mergeTags(t.name, v).then(() => this.source.refreshMarkdown())));
    }
    if (tags.length === 0) {
      list.createEl("div", { text: "暂无 Tag。同步时会自动提取平台话题；AI 建议确认后也会写入。", cls: "omni-empty" });
    }
  }

  private async renderTopics(container: HTMLElement): Promise<void> {
    const [topics, collections] = await Promise.all([
      this.source.listTopics().catch(() => []),
      this.source.listCollections().catch(() => []),
    ]);
    container.createEl("div", { text: `共 ${topics.length} 个 Topic`, cls: "omni-total" });
    const list = container.createEl("div", { cls: "omni-list" });
    for (const t of topics) {
      const row = list.createEl("div", { cls: "omni-row" });
      const main = row.createEl("div", { cls: "omni-row-main" });
      const head = main.createEl("div", { cls: "omni-row-meta" });
      head.createEl("span", { text: `◎${t.name}`, cls: "omni-badge omni-badge-topic" });
      head.createEl("span", { text: `${t.count} 条 · ${t.status}`, cls: "omni-meta-text" });
      const members = collections.filter((c) => (c.topics ?? []).includes(t.name));
      for (const m of members.slice(0, 8)) {
        const mrow = main.createEl("div", { cls: "omni-topic-member" });
        mrow.setText(m.title || m.id);
        mrow.addEventListener("click", () => void this.source.openDetail(m.id));
      }
      if (members.length > 8) {
        main.createEl("div", { text: `…等 ${members.length} 条`, cls: "omni-meta-text" });
      }
      const actions = row.createEl("div", { cls: "omni-row-actions" });
      this.action(actions, "重命名", () => this.prompt("重命名 Topic", "新名称", (v) =>
        this.source.renameTopic(t.id, v).then(() => this.source.refreshMarkdown())));
      this.action(actions, "并入…", () => this.prompt(`把「${t.name}」并入`, "目标 Topic 名称", (v) =>
        this.source.mergeTopic(t.id, v).then(() => this.source.refreshMarkdown())));
    }
    if (topics.length === 0) {
      list.createEl("div", { text: "暂无 Topic。AI 建议确认后会自动创建；也可在收藏详情手动归入 Topic。", cls: "omni-empty" });
    }
  }

  private action(parent: HTMLElement, label: string, cb: () => void): void {
    parent.createEl("button", { text: label, cls: "omni-act" }).addEventListener("click", cb);
  }

  private prompt(title: string, placeholder: string, submit: (v: string) => Promise<void>): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText(title);
    const input = modal.contentEl.createEl("input", { type: "text", placeholder });
    const done = (): void => {
      if (!input.value.trim()) return;
      void submit(input.value.trim())
        .then(() => {
          modal.close();
          new Notice("已保存");
        })
        .catch((e: unknown) => new Notice(`保存失败：${(e as Error).message}`));
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done();
    });
    modal.contentEl
      .createEl("button", { text: "确定", cls: "omni-btn omni-btn-primary" })
      .addEventListener("click", done);
    modal.open();
  }

  private async runWithNotice(fn: () => Promise<void>, okText: string): Promise<void> {
    try {
      await fn();
      new Notice(okText);
    } catch (e) {
      new Notice(`操作失败：${(e as Error).message}`);
    }
  }
}
