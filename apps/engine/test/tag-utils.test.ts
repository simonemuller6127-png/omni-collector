import { describe, expect, it } from "vitest";
import { cleanTitleForDisplay, extractHashtags, findNearDuplicateTags } from "../src/tags/tag-utils.js";

describe("tag-utils", () => {
  it("extracts unique hashtags from titles", () => {
    expect(
      extractHashtags("27美术生看过来，线描保姆级步骤图#速写人物 #画画 #美术生的日常 #美术生"),
    ).toEqual(["速写人物", "画画", "美术生的日常", "美术生"]);
    expect(extractHashtags("无话题标题")).toEqual([]);
    expect(extractHashtags("#AI #AI #编程")).toEqual(["AI", "编程"]);
  });

  it("cleans display title by removing hashtag tokens", () => {
    expect(
      cleanTitleForDisplay("这才是复古科技爱好者的梦中桌搭#创意数码 #桌搭好物 #Macmini #生活美"),
    ).toBe("这才是复古科技爱好者的梦中桌搭");
    expect(cleanTitleForDisplay("普通标题")).toBe("普通标题");
  });

  it("finds near-duplicate tags (prefix/containment and edit distance)", () => {
    const pairs = findNearDuplicateTags(["生活美", "生活美学", "美术生", "美术生日常", "AI", "AI 编程", "完全无关"]);
    const names = pairs.map((p) => [p.a, p.b].sort().join("|"));
    expect(names).toContain("生活美|生活美学");
    expect(names).toContain("美术生|美术生日常");
  });
});
