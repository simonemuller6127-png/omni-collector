import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { OmniMessage, OmniMessageType } from "@omni/shared-core";
import { validateOmniMessage } from "@omni/shared-core";
import { ErrorCodes } from "../errors/app-error.js";

export type CommHandler = (msg: OmniMessage) => OmniMessage | Promise<OmniMessage>;

export interface CommServerOptions {
  pipeName?: string;
  wsPort?: number;
  wsToken?: string;
  handlers?: Partial<Record<OmniMessageType, CommHandler>>;
}

export interface CommServerInfo {
  pipePath: string;
  wsPort: number;
}

function message(message_type: OmniMessageType, payload: Record<string, unknown>): OmniMessage {
  return {
    request_id: randomUUID(),
    timestamp: new Date().toISOString(),
    message_type,
    payload,
  };
}

function taskError(requestId: string, code: string, error: string): OmniMessage {
  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    message_type: "TASK_ERROR",
    payload: { code, message: error },
  };
}

/**
 * Engine 通信服务端（TDD Part 4，ADR-001）：
 * - Local Socket（Windows Named Pipe / Unix Domain Socket）：命令通道，按行 JSON 帧
 * - WebSocket（127.0.0.1 + 一次性令牌）：事件推送通道
 */
export class EngineCommServer {
  private netServer?: net.Server;
  private wss?: WebSocketServer;
  private readonly sockets = new Set<net.Socket>();
  private readonly wsClients = new Set<WebSocket>();
  private readonly handlers: Partial<Record<OmniMessageType, CommHandler>>;

  constructor(options: CommServerOptions = {}) {
    this.handlers = options.handlers ?? {};
  }

  async start(options: CommServerOptions = {}): Promise<CommServerInfo> {
    const pipeName = options.pipeName ?? `omni-collector-${process.pid}-${Date.now()}`;
    const pipePath =
      process.platform === "win32"
        ? `\\\\.\\pipe\\${pipeName}`
        : path.join(os.tmpdir(), `${pipeName}.sock`);

    this.netServer = net.createServer((socket) => this.handleSocket(socket));
    await new Promise<void>((resolve, reject) => {
      this.netServer!.once("error", reject);
      this.netServer!.listen(pipePath, () => {
        this.netServer!.removeListener("error", reject);
        resolve();
      });
    });

    this.wss = new WebSocketServer({ port: options.wsPort ?? 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => this.wss!.once("listening", () => resolve()));
    const wsPort = (this.wss.address() as { port: number }).port;
    this.wss.on("connection", (ws, req) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (options.wsToken && url.searchParams.get("token") !== options.wsToken) {
        ws.close(1008, "bad token");
        return;
      }
      this.wsClients.add(ws);
      ws.on("close", () => this.wsClients.delete(ws));
    });

    return { pipePath, wsPort };
  }

  broadcast(msg: OmniMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  async close(reason = "engine shutdown"): Promise<void> {
    this.broadcast(message("ENGINE_CLOSING", { reason }));
    for (const ws of this.wsClients) ws.close();
    this.wsClients.clear();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => (this.netServer ? this.netServer.close(() => resolve()) : resolve()));
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()));
    this.netServer = undefined;
    this.wss = undefined;
  }

  private handleSocket(socket: net.Socket): void {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        void this.handleLine(socket, line);
      }
    });
  }

  private async handleLine(socket: net.Socket, line: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.send(socket, taskError("", "COMM_001", "COMM_001: malformed JSON"));
      return;
    }
    const result = validateOmniMessage(parsed);
    if (!result.ok) {
      this.send(socket, taskError("", "COMM_001", `COMM_001: ${result.error}`));
      return;
    }
    const msg = result.message;
    if (msg.message_type === "ENGINE_START") {
      this.send(
        socket,
        this.withRequestId(message("ENGINE_READY", { engine_version: "0.0.0", state: "READY" }), msg),
      );
      return;
    }
    const handler = this.handlers[msg.message_type];
    if (!handler) {
      this.send(
        socket,
        taskError(
          msg.request_id,
          ErrorCodes.ENGINE_003,
          `${ErrorCodes.ENGINE_003}: handler not registered`,
        ),
      );
      return;
    }
    try {
      const response = await handler(msg);
      this.send(socket, this.withRequestId(response, msg));
    } catch (err) {
      this.send(socket, taskError(msg.request_id, "ENGINE_003", (err as Error).message));
    }
  }

  private withRequestId(response: OmniMessage, request: OmniMessage): OmniMessage {
    return {
      ...response,
      request_id: request.request_id,
      timestamp: new Date().toISOString(),
    };
  }

  private send(socket: net.Socket, msg: OmniMessage): void {
    socket.write(`${JSON.stringify(msg)}\n`);
  }
}
