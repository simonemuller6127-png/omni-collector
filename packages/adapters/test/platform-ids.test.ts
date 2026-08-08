import { describe, expect, it } from "vitest";
import {
  extractYoutubeId,
  extractXiaohongshuId,
  extractMakerWorldId,
  extractXiaoheiheId,
  extractXiaoheiheLinkId,
  extractUgcSeason,
  YouTubeAdapter,
  XiaohongshuAdapter,
  MakerWorldAdapter,
  XiaoheiheAdapter,
} from "../src/index.js";

describe("platform id extraction", () => {
  it("youtube", () => {
    expect(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://example.com/none")).toBeNull();
  });

  it("xiaohongshu", () => {
    expect(extractXiaohongshuId("https://www.xiaohongshu.com/explore/64a1b2c3000000001302abcd")).toBe(
      "64a1b2c3000000001302abcd",
    );
    expect(extractXiaohongshuId("https://www.xiaohongshu.com/discovery/item/123456")).toBe("123456");
    expect(extractXiaohongshuId("https://example.com")).toBeNull();
  });

  it("makerworld", () => {
    expect(extractMakerWorldId("https://makerworld.com/zh/models/123456~slug")).toBe("123456");
    expect(extractMakerWorldId("https://example.com")).toBeNull();
  });

  it("xiaoheihe", () => {
    expect(extractXiaoheiheId("https://xiaoheihe.cn/game/100001")).toBe("100001");
    expect(extractXiaoheiheId("https://api.xiaoheihe.cn/app/42")).toBe("42");
    expect(extractXiaoheiheId("https://example.com")).toBeNull();
    expect(extractXiaoheiheLinkId("https://www.xiaoheihe.cn/app/bbs/link/187318769")).toBe("187318769");
    expect(extractXiaoheiheLinkId("https://xiaoheihe.cn/game/100001")).toBeNull();
  });
});

describe("adapter normalize mapping", () => {
  it("maps raw to UniversalCollection per platform", () => {
    const yt = new YouTubeAdapter().normalize(
      { platformItemId: "dQw4w9WgXcQ", url: "https://youtu.be/dQw4w9WgXcQ", title: "T", saveType: "favorited" },
      { description: "d", contentType: "video" },
    );
    expect(yt.platform).toBe("youtube");
    expect(yt.contentType).toBe("video");

    const xhs = new XiaohongshuAdapter().normalize(
      { platformItemId: "note1", url: "https://www.xiaohongshu.com/explore/note1", title: "N", saveType: "favorited" },
    );
    expect(xhs.platform).toBe("xiaohongshu");
    expect(xhs.contentType).toBe("note");

    const mw = new MakerWorldAdapter().normalize(
      { platformItemId: "1", url: "https://makerworld.com/zh/models/1~a", title: "M", saveType: "favorited" },
    );
    expect(mw.contentType).toBe("3dmodel");

    const xhh = new XiaoheiheAdapter().normalize(
      { platformItemId: "2", url: "https://xiaoheihe.cn/game/2", title: "G", saveType: "favorited" },
    );
    expect(xhh.contentType).toBe("post");
  });
});

describe("extractUgcSeason", () => {
  it("extracts series info from bilibili view detail", () => {
    const json = {
      data: {
        ugc_season: { id: 123, title: "RIG系列", season_id: 456, ep_count: 10 },
      },
    };
    expect(extractUgcSeason(json)).toMatchObject({ title: "RIG系列", epCount: 10 });
  });

  it("returns null when no ugc_season", () => {
    expect(extractUgcSeason({ data: {} })).toBeNull();
    expect(extractUgcSeason(null)).toBeNull();
  });
});
