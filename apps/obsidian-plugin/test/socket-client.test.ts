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
});
