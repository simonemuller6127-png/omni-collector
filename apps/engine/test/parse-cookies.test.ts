import { describe, expect, it } from "vitest";
import { parseStoredCookies } from "../src/index.js";

describe("parseStoredCookies", () => {
  it("parses JSON array format", () => {
    const out = parseStoredCookies(
      JSON.stringify([
        { name: "a1", value: "abc", domain: ".xiaohongshu.com", path: "/" },
        { name: "web_session", value: "xyz" },
        { name: "", value: "skip" },
      ]),
      "xiaohongshu",
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "a1", value: "abc" });
  });

  it("parses raw header format with platform default domain", () => {
    const out = parseStoredCookies("SESSDATA=abc%2C123; bili_jct=xyz; DedeUserID=42", "bilibili");
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ name: "SESSDATA", value: "abc%2C123", domain: ".bilibili.com", path: "/" });
    expect(out[2].name).toBe("DedeUserID");
    expect(out[0].expires).toBeGreaterThan(Date.now() / 1000);
  });

  it("returns [] for garbage", () => {
    expect(parseStoredCookies("no-equals-here", "bilibili")).toHaveLength(0);
  });
});
