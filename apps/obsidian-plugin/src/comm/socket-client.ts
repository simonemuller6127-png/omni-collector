import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { WebSocket, type RawData } from "ws";
import type { OmniMessage, OmniMessageType } from "@omni/shared-core";
import { validateOmniMessage } from "@omni/shared-core";

export interface EngineClientOptions {
  pipePath: string;
  wsUrl: string;
  nodeBin?: string;
  engineScript?: string;
  dataDir: string;
  requestTimeoutMs?: number;
  spawnEngine?: () => ChildProcess;
}

/**
 * Plugin 侧 Engine 客户端（TDD Part 9.3，SPEC S3.4）。
 * 与 Obsidian API 完全解耦，可在 Node 环境下单测。
 */
export class EngineClient {
  private proc?: ChildProcess;
  private ws?: WebSocket;
  private readonly eventCbs: Array<(msg: OmniMessage) => void> = [];
  private eventsAttached = false;
  private readonly requestTimeoutMs: number;

  constructor(private readonly opts: EngineClientOptions) {
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 30_000;
  }

  async startEngine(taskKind: string): Promise<void> {
    this.proc =
      this.opts.spawnEngine?.() ??
      spawn(
        this.opts.nodeBin ?? process.execPath,
        [
          this.opts.engineScript ?? "",
          "--data-dir",
          this.opts.dataDir,
          "--socket",
          this.pipeNameOf(this.opts.pipePath),
          "--ws-port",
          String(new URL(this.opts.wsUrl).port),
          "--ws-token",
          new URL(this.opts.wsUrl).searchParams.get("token") ?? "",
        ],
        { stdio: "ignore", windowsHide: true },
      );
    this.eventsAttached = false;
    this.ws = new WebSocket(this.opts.wsUrl);
    await new Promise<void>((resolve, reject) => {
      this.ws!.once("open", () => resolve());
      this.ws!.once("error", reject);
    });
    await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "ENGINE_START",
      payload: { task: taskKind },
    });
    this.attachEvents();
  }

  request(msg: Omit<OmniMessage, "timestamp"> & { timestamp?: string }): Promise<OmniMessage> {
    const full: OmniMessage = { ...msg, timestamp: msg.timestamp ?? new Date().toISOString() };
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.opts.pipePath);
      let buffer = "";
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("request timeout"));
      }, this.requestTimeoutMs);
      socket.setEncoding("utf8");
      socket.on("connect", () => socket.write(`${JSON.stringify(full)}\n`));
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const idx = buffer.indexOf("\n");
        if (idx < 0) return;
        const line = buffer.slice(0, idx);
        socket.destroy();
        clearTimeout(timer);
        const result = validateOmniMessage(JSON.parse(line));
        if (!result.ok) {
          reject(new Error(`COMM_001: ${result.error}`));
          return;
        }
        resolve(result.message);
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  onEvent(cb: (msg: OmniMessage) => void): void {
    this.eventCbs.push(cb);
    this.attachEvents();
  }

  private attachEvents(): void {
    if (this.eventsAttached || !this.ws) return;
    this.eventsAttached = true;
    this.ws.on("message", (data: RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as OmniMessage;
        for (const cb of this.eventCbs) cb(msg);
      } catch {
        // 忽略非法事件帧
      }
    });
  }

  async stopEngine(reason = "plugin"): Promise<void> {
    try {
      await this.request({
        request_id: randomUUID(),
        timestamp: new Date().toISOString(),
        message_type: "ENGINE_STOP",
        payload: { reason },
      });
    } catch {
      // 引擎可能已退出，忽略
    }
    this.dispose();
  }

  watchExit(cb: (code: number) => void): void {
    this.proc?.on("exit", (code) => cb(code ?? -1));
  }

  dispose(): void {
    this.eventsAttached = false;
    this.ws?.terminate();
    this.ws = undefined;
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill("SIGTERM");
    }
    this.proc = undefined;
  }

  private pipeNameOf(pipePath: string): string {
    return pipePath.includes("\\\\.\\pipe\\") ? pipePath.replace("\\\\.\\pipe\\", "") : pipePath;
  }
}
