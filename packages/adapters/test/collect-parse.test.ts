import { describe, expect, it } from "vitest";
import { parseXhsFavoritedNotes } from "../src/xiaohongshu/xiaohongshu.adapter.js";
import { parseXhhFavoritePayload } from "../src/xiaoheihe/xiaoheihe.adapter.js";

describe("parseXhsFavoritedNotes", () => {
  it("parses feed-style noteCard shape", () => {
    const json = {
      code: 0,
      data: {
        cursor: "abc",
        has_more: true,
        notes: [
          {
            id: "64a1b2c3000000001302abcd",
            modelType: "note",
            noteCard: {
              noteId: "64a1b2c3000000001302abcd",
              displayTitle: "我的收藏笔记",
              user: { nickname: "作者A", avatar: "https://x/avatar.jpg" },
              cover: { url: "https://x/cover.jpg" },
              type: "normal",
            },
          },
          {
            id: "note2",
            modelType: "video",
            noteCard: {
              noteId: "note2",
              displayTitle: "视频笔记",
              user: { nickname: "作者B" },
              cover: { url: "https://x/v.jpg" },
              type: "video",
            },
          },
        ],
      },
    };
    const notes = parseXhsFavoritedNotes(json);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({
      noteId: "64a1b2c3000000001302abcd",
      title: "我的收藏笔记",
      author: "作者A",
      coverUrl: "https://x/cover.jpg",
    });
    expect(notes[1].video).toBe(true);
  });

  it("parses flat note shape", () => {
    const json = {
      data: {
        items: [
          {
            note_id: "n1",
            title: "扁平结构",
            user: { nickname: "作者C" },
            cover: { url: "https://x/c.jpg" },
          },
        ],
      },
    };
    const notes = parseXhsFavoritedNotes(json);
    expect(notes[0]).toMatchObject({ noteId: "n1", title: "扁平结构", author: "作者C" });
  });

  it("returns [] for unknown payload", () => {
    expect(parseXhsFavoritedNotes({ data: {} })).toEqual([]);
    expect(parseXhsFavoritedNotes(null)).toEqual([]);
  });
});

describe("parseXhhFavoritePayload", () => {
  it("parses link post favorites (real web shape)", () => {
    const json = {
      status: "ok",
      result: {
        has_next: "1",
        links: [
          {
            link: {
              linkid: 187318769,
              title: "导师：文字我不看，有莲花我真回",
              description: "事实证明，和导师沟通，语言显得苍白无力",
              user: { username: "今天做完实验了吗", userid: "94290858" },
              topics: [{ name: "盒友杂谈", topic_id: 7214 }],
              imgs: ["https://imgheybox1.max-c.com/bbs/x/thumb.jpeg"],
              create_at: "1785816940",
              has_video: 0,
              is_deleted: 0,
            },
          },
        ],
      },
    };
    const items = parseXhhFavoritePayload(json);
    expect(items[0]).toMatchObject({
      itemId: "187318769",
      title: "导师：文字我不看，有莲花我真回",
      url: "https://www.xiaoheihe.cn/app/bbs/link/187318769",
      author: "今天做完实验了吗",
      coverUrl: "https://imgheybox1.max-c.com/bbs/x/thumb.jpeg",
      topic: "盒友杂谈",
      contentType: "post",
    });
    expect(items[0].collectedAt).toBe("2026-08-04T04:15:40.000Z");
  });

  it("skips deleted links", () => {
    const json = {
      result: {
        links: [
          {
            link: { linkid: 1, title: "已删除", is_deleted: 1 },
          },
        ],
      },
    };
    expect(parseXhhFavoritePayload(json)).toEqual([]);
  });

  it("returns [] for unknown payload", () => {
    expect(parseXhhFavoritePayload({ result: {} })).toEqual([]);
    expect(parseXhhFavoritePayload([])).toEqual([]);
  });
});
