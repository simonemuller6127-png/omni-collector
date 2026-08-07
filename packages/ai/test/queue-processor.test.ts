import { describe, expect, it } from "vitest";
import {
  AiQueueProcessor,
  buildPrompt,
  inputHash,
  parseSuggestions,
  type AiQueueDeps,
  type AIProvider,
  type QueueItemWithContent,
} from "../src/index.js";

class FakeProvider implements AIProvider {
  readonly name = "fake";
  calls = 0;
  constructor(private readonly reply: string) {}
  async chat(): Promise<{ text: string }> {
    this.calls += 1;
    return { text: this.reply };
  }
}

function makeDeps(reply: string, queue: QueueItemWithContent[]): { deps: AiQueueDeps; provider: FakeProvider; saved: Array<Record<string, unknown>>; done: string[]; failed: string[] } {
  const provider = new FakeProvider(reply);
  const saved: Array<Record<string, unknown>> = [];
  const done: string[] = [];
  const failed: string[] = [];
  const hashes = new Set<string>();
  const deps: AiQueueDeps = {
    provider,
    nextBatch: () => queue,
    markProcessing: () => {},
    markDone: (id) => done.push(id),
    markFailed: (id, err) => failed.push(`${id}:${err}`),
    findSuggestionByHash: (h) => (hashes.has(h) ? { id: "existing" } : undefined),
    saveSuggestion: (s) => {
      hashes.add(s.input_hash ?? "");
      saved.push(s as Record<string, unknown>);
      return {};
    },
  };
  return { deps, provider, saved, done, failed };
}

describe("AiQueueProcessor", () => {
  it("processes batch, saves pending suggestions, marks done", async () => {
    const item: QueueItemWithContent = {
      id: "q1",
      collectionId: "c1",
      title: "AI 编程技巧",
      url: "https://x.com/1",
      description: "关于 Agent 的最佳实践",
      platform: "xiaohongshu",
    };
    const reply = JSON.stringify([
      { type: "suggested_tag", payload: '["AI", "编程", "Agent"]', confidence: 0.9 },
      { type: "suggested_topic", payload: "AI 编程实践", confidence: 0.8 },
      { type: "suggested_summary", payload: "分享 AI 编程 Agent 的最佳实践与技巧。" },
    ]);
    const { deps, provider, saved, done } = makeDeps(reply, [item]);
    const processor = new AiQueueProcessor(deps);
    const result = await processor.run();
    expect(result.processed).toBe(1);
    expect(result.suggestionsCreated).toBe(3);
    expect(result.failed).toBe(0);
    expect(provider.calls).toBe(1);
    expect(done).toEqual(["q1"]);
    expect(saved.map((s) => s.suggestion_type)).toEqual(["suggested_tag", "suggested_topic", "suggested_summary"]);
    expect(saved[0].input_hash).toBe(inputHash(item));
  });

  it("dedupes identical input via input_hash (NULL strategy: no second AI call)", async () => {
    const item: QueueItemWithContent = { id: "q1", collectionId: "c1", title: "T", url: "https://x.com/1" };
    const { deps, provider, done } = makeDeps(
      '[{"type":"suggested_tag","payload":"AI 标签"}]',
      [item, { ...item, id: "q2", collectionId: "c2" }],
    );
    const processor = new AiQueueProcessor(deps);
    const result = await processor.run();
    expect(result.deduped).toBe(1);
    expect(provider.calls).toBe(1);
    expect(done).toEqual(["q1", "q2"]);
  });

  it("isolates provider failures per item and continues batch", async () => {
    const good: QueueItemWithContent = { id: "q1", collectionId: "c1", title: "好", url: "https://x.com/1" };
    const bad: QueueItemWithContent = { id: "q2", collectionId: "c2", title: "坏", url: "https://x.com/2" };
    const provider = {
      name: "fake",
      chat: async () => {
        throw new Error("AI_001: rate limited");
      },
    };
    const done: string[] = [];
    const failed: string[] = [];
    const deps: AiQueueDeps = {
      provider,
      nextBatch: () => [good, bad],
      markProcessing: () => {},
      markDone: (id) => done.push(id),
      markFailed: (id, err) => failed.push(`${id}:${err}`),
      findSuggestionByHash: () => undefined,
      saveSuggestion: () => ({}),
    };
    const result = await new AiQueueProcessor(deps).run();
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(2);
    expect(done).toEqual([]);
    expect(failed.length).toBe(2);
  });

  it("parses fenced JSON and ignores invalid entries", () => {
    const out = parseSuggestions(
      '```json\n[{"type":"suggested_tag","payload":"AI 标签"},{"type":"bad","payload":"x"}]\n```',
    );
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("suggested_tag");
    expect(buildPrompt({ id: "x", collectionId: "x", title: "T", url: "https://u", author: "A" })).toContain("标题：T");
  });
});
