import { describe, expect, it } from "vitest";
import net from "node:net";
import { WebSocket } from "ws";
import { EngineCommServer } from "../src/index.js";

function connectPipe(pipePath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipePath);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

function readLine(socket: net.Socket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let buffer = "";
    const onData = (chunk: string) => {
      buffer += chunk;
      const idx = buffer.indexOf("\n");
      if (idx >= 0) {
        socket.off("data", onData);
        resolve(JSON.parse(buffer.slice(0, idx)));
      }
    };
    socket.on("data", onData);
  });
}

function wsOpen(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

describe("EngineCommServer", () => {
  it("answers ENGINE_READY on ENGINE_START and rejects malformed input with COMM_001", async () => {
    const server = new EngineCommServer();
    const info = await server.start();
    const socket = await connectPipe(info.pipePath);
    try {
      const start = {
        request_id: "s1",
        timestamp: new Date().toISOString(),
        message_type: "ENGINE_START",
        payload: { task: "query" },
      };
      socket.write(`${JSON.stringify(start)}\n`);
      const ready = (await Promise.race([
        readLine(socket),
        new Promise((_, rej) => setTimeout(() => rej(new Error("READY timeout")), 3000)),
      ])) as Record<string, unknown>;
      expect(ready.message_type).toBe("ENGINE_READY");

      socket.write("{not json}\n");
      const err = (await readLine(socket)) as Record<string, unknown>;
      expect(err.message_type).toBe("TASK_ERROR");
      expect((err.payload as Record<string, unknown>).code).toBe("COMM_001");
    } finally {
      socket.destroy();
      await server.close();
    }
  });

  it("rejects invalid envelopes and routes registered handlers", async () => {
    const server = new EngineCommServer({
      handlers: {
        STATUS_QUERY: () => ({
          request_id: "",
          timestamp: new Date().toISOString(),
          message_type: "TASK_COMPLETE",
          payload: { result: { state: "READY" } },
        }),
      },
    });
    const info = await server.start();
    const socket = await connectPipe(info.pipePath);
    try {
      socket.write(`${JSON.stringify({ foo: 1 })}\n`);
      const err = (await readLine(socket)) as Record<string, unknown>;
      expect(err.message_type).toBe("TASK_ERROR");
      expect((err.payload as Record<string, unknown>).code).toBe("COMM_001");

      socket.write(
        `${JSON.stringify({
          request_id: "q1",
          timestamp: new Date().toISOString(),
          message_type: "STATUS_QUERY",
          payload: { scope: "engine" },
        })}\n`,
      );
      const reply = (await readLine(socket)) as Record<string, unknown>;
      expect(reply.message_type).toBe("TASK_COMPLETE");
    } finally {
      socket.destroy();
      await server.close();
    }
  });

  it("pushes ENGINE_CLOSING over websocket and rejects bad tokens", async () => {
    const server = new EngineCommServer();
    const info = await server.start({ wsToken: "secret" });
    const ws = await wsOpen(`ws://127.0.0.1:${info.wsPort}/?token=secret`);
    ws.on("error", () => {});
    const closing = new Promise<Record<string, unknown>>((resolve) => {
      ws.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    const bad = new WebSocket(`ws://127.0.0.1:${info.wsPort}/?token=wrong`);
    bad.on("error", () => {});
    await new Promise<void>((resolve) => {
      bad.once("close", () => resolve());
    });
    expect(bad.readyState).toBe(WebSocket.CLOSED);

    await server.close();
    const msg = await closing;
    expect(msg.message_type).toBe("ENGINE_CLOSING");
    ws.terminate();
  });
});
