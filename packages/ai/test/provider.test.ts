import { describe, expect, it, vi, afterEach } from "vitest";
import { DeepSeekProvider, createProvider, OpenAICompatibleProvider } from "../src/index.js";

function mockFetch(json: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: "mock",
      json: async () => json,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI Provider", () => {
  it("sends OpenAI-compatible chat request and parses response", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return {
          ok: true,
          status: 200,
          statusText: "ok",
          json: async () => ({
            choices: [{ message: { content: "建议标签：前端" } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        };
      }),
    );
    const provider = new DeepSeekProvider({ apiKey: "test-key", model: "deepseek-chat" });
    const res = await provider.chat([
      { role: "system", content: "你是标签助手" },
      { role: "user", content: "给这篇文章打标签" },
    ]);
    expect(res.text).toBe("建议标签：前端");
    expect(res.usage?.totalTokens).toBe(15);
    expect(calls[0].url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(calls[0].body.model).toBe("deepseek-chat");
    expect(calls[0].body.messages).toHaveLength(2);
  });

  it("throws AI_001 on provider error", async () => {
    mockFetch({ error: { message: "invalid api key" } }, 401);
    const provider = createProvider("deepseek", { apiKey: "bad" });
    await expect(provider.chat([{ role: "user", content: "hi" }])).rejects.toThrowError("AI_001");
  });

  it("throws on empty completion", async () => {
    mockFetch({ choices: [{ message: { content: "" } }] });
    const provider = new OpenAICompatibleProvider("custom", { apiKey: "k", baseURL: "https://x/v1", model: "m" }, "https://x/v1", "m");
    await expect(provider.chat([{ role: "user", content: "hi" }])).rejects.toThrowError("AI_001");
  });
});
