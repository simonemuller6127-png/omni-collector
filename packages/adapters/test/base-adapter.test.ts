import { describe, expect, it } from "vitest";
import { BaseAdapter } from "../src/index.js";

class TestAdapter extends BaseAdapter {
  readonly platform = "test";
  readonly listUrl = "https://example.com/list";
  readonly itemSelector = ".item";
  readonly titleSelector = ".title";
  readonly urlSelector = "a.url";
  readonly authorSelector = ".author";
  readonly coverSelector = "img.cover";
  readonly nextPage = "click";

  async authenticate(): Promise<void> {}
  async validateSession(): Promise<"valid"> {
    return "valid";
  }
  async fetchCatalog(): Promise<never[]> {
    return [];
  }
  async fetchDetail(): Promise<Record<string, never>> {
    return {};
  }
  normalize(raw: { url: string; platformItemId: string; title: string; saveType: "favorited" }) {
    return {
      platform: this.platform,
      platformItemId: raw.platformItemId,
      url: raw.url,
      title: raw.title,
      contentType: "video",
      saveType: raw.saveType,
      comments: [],
      status: "active" as const,
    };
  }
  async healthCheck() {
    return {
      platform: this.platform,
      parseFailureRate: 0,
      slowPageRatio: 0,
      collectedAt: new Date().toISOString(),
    };
  }
  async cleanup(): Promise<void> {}
}

describe("BaseAdapter", () => {
  it("retries with backoff and succeeds", async () => {
    const adapter = new TestAdapter();
    let calls = 0;
    const result = await adapter.retryWithBackoff(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("flaky");
        return "ok";
      },
      { baseDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after max retries and throws last error", async () => {
    const adapter = new TestAdapter();
    await expect(
      adapter.retryWithBackoff(
        async () => {
          throw new Error("always fails");
        },
        { maxRetries: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrowError("always fails");
  });

  it("classifies health levels per SPEC S11.3", () => {
    const adapter = new TestAdapter();
    expect(adapter.classifyHealth(0.1, 1)).toBe(0);
    expect(adapter.classifyHealth(0.25, 1)).toBe(1);
    expect(adapter.classifyHealth(0.1, 4)).toBe(1);
    expect(adapter.classifyHealth(0.6, 0)).toBe(3);
  });

  it("applies random delay within the configured range", async () => {
    const adapter = new TestAdapter();
    const started = Date.now();
    await adapter.withRandomDelay(5, 5);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4);
  });

  it("normalizes raw into UniversalCollection shape", () => {
    const adapter = new TestAdapter();
    const out = adapter.normalize({
      url: "https://example.com/1",
      platformItemId: "p1",
      title: "T",
      saveType: "favorited",
    });
    expect(out.platform).toBe("test");
    expect(out.status).toBe("active");
    expect(out.comments).toEqual([]);
  });
});
