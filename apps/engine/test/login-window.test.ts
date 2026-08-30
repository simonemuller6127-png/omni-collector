import { describe, expect, it } from "vitest";
import { hasLoginMarker, LOGIN_COOKIE_MARKERS, LOGIN_URLS } from "../src/sync/login-window.js";
import { SUPPORTED_PLATFORMS } from "../src/sync/sync-runner.js";

describe("login window (PRD 26.1)", () => {
  it("all supported platforms have a login URL and marker config", () => {
    for (const p of SUPPORTED_PLATFORMS) {
      expect(LOGIN_URLS[p], `login url for ${p}`).toMatch(/^https:\/\//);
      expect(Array.isArray(LOGIN_COOKIE_MARKERS[p] ?? []), `markers for ${p}`).toBe(true);
    }
  });

  it("hasLoginMarker matches non-empty marker cookies only", () => {
    expect(hasLoginMarker("bilibili", [{ name: "SESSDATA", value: "abc" }])).toBe(true);
    expect(hasLoginMarker("bilibili", [{ name: "SESSDATA", value: "" }])).toBe(false);
    expect(hasLoginMarker("bilibili", [{ name: "buvid3", value: "x" }])).toBe(false);
    expect(hasLoginMarker("xiaohongshu", [{ name: "web_session", value: "s" }, { name: "a1", value: "x" }])).toBe(true);
    expect(hasLoginMarker("youtube", [{ name: "SAPISID", value: "t" }])).toBe(true);
    // 无标记平台（makerworld/xiaoheihe）永远由页面探测兜底，cookie 判定恒 false
    expect(hasLoginMarker("makerworld", [{ name: "token", value: "t" }])).toBe(false);
  });
});
