import { describe, expect, it } from "vitest";
import { getMixinKey, signParams } from "../src/index.js";

describe("wbi", () => {
  it("derives a stable 32-char mixin key", () => {
    // 公开样例：img/sub 文件名
    const key = getMixinKey(
      "7cd084941338484aae1ad9425b84077c",
      "4932caff0ff746eab6f01bf08b70ac45",
    );
    expect(key).toHaveLength(32);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it("adds wts and w_rid with sorted params", () => {
    const signed = signParams({ b: "2", a: "1" }, "01234567890123456789012345678901");
    expect(signed.wts).toMatch(/^\d{10}$/);
    expect(signed.w_rid).toHaveLength(32);
    const keys = Object.keys(signed).sort();
    expect(keys).toEqual(["a", "b", "w_rid", "wts"]);
  });
});
