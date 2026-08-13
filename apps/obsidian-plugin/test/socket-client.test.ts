import { describe, expect, it, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { EngineCommServer } from "@omni/engine";
import { EngineClient } from "../src/comm/socket-client.js";

let server: EngineCommServer | undefined;
let client: EngineClient | undefined;

afterEach(async () => {
  client?.dispose();
  await server?.close();
  server = undefined;
  client = undefined;
});

describe("EngineClient", () => {
  it("handshakes ENGINE_READY, queries via pipe and receives ENGINE_CLOSING over ws", async () => {
    server = new EngineCommServer({
      handlers: {
        STATUS_QUERY: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { result: { state: "READY" } },
        }),
        ENGINE_STOP: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { result: "stopping" },
        }),
      },
    });
    const info = await server.start({ wsToken: "tok" });
    const wsUrl = `ws://127.0.0.1:${info.wsPort}/?token=tok`;
    client = new EngineClient({
      pipePath: info.pipePath,
      wsUrl,
      wsPort: info.wsPort,
      dataDir: "unused",
      spawnEngine: () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]),
    });

    const closing = new Promise<string>((resolve) => {
      client!.onEvent((msg) => {
        if (msg.message_type === "ENGINE_CLOSING") resolve(msg.message_type);
      });
    });

    await client.startEngine("query");
    const reply = await client.request({
      request_id: "q1",
      message_type: "STATUS_QUERY",
      payload: { scope: "engine" },
    });
    expect(reply.message_type).toBe("TASK_COMPLETE");

    await server.close();
    expect(await closing).toBe("ENGINE_CLOSING");
    await client.stopEngine();
  });

  it("maps tag/topic/ai-undo methods to protocol messages", async () => {
    server = new EngineCommServer({
      handlers: {
        TAG_LIST: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { tags: [{ id: "t1", name: "生活美学", count: 3, aliases: ["生活美"] }] },
        }),
        TAG_ALIAS_ADD: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { task: "tag_alias_add" },
        }),
        TAG_MERGE: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { task: "tag_merge" },
        }),
        TAG_RENAME: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { task: "tag_rename" },
        }),
        TOPIC_LIST: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { topics: [{ id: "p1", name: "设计", status: "accepted", count: 2 }] },
        }),
        TOPIC_RENAME: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { task: "topic_rename" },
        }),
        AI_REVIEW_UNDO: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { task: "ai_review_undo" },
        }),
      },
    });
    const info = await server.start({ wsToken: "tok2" });
    client = new EngineClient({
      pipePath: info.pipePath,
      wsUrl: `ws://127.0.0.1:${info.wsPort}/?token=tok2`,
      wsPort: info.wsPort,
      dataDir: "unused",
      spawnEngine: () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]),
    });
    await client.startEngine("query");
    const tags = await client.listTags();
    expect(tags[0].name).toBe("生活美学");
    expect(tags[0].aliases).toContain("生活美");
    expect((await client.addTagAlias("生活美学", "美学")).message_type).toBe("TASK_COMPLETE");
    expect((await client.mergeTags("生活美", "生活美学")).message_type).toBe("TASK_COMPLETE");
    expect((await client.renameTag("生活美学", "生活美学设计")).message_type).toBe("TASK_COMPLETE");
    const topics = await client.listTopics();
    expect(topics[0].name).toBe("设计");
    expect((await client.renameTopic("p1", "设计思维")).message_type).toBe("TASK_COMPLETE");
    expect((await client.undoAiSuggestion("s1")).message_type).toBe("TASK_COMPLETE");
  });
});
