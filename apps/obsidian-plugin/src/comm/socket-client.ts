import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { WebSocket, type RawData } from "ws";
import type { OmniMessage, OmniMessageType } from "@omni/shared-core";
import { validateOmniMessage, type TagDTO, type TopicDTO } from "@omni/shared-core";

export interface EngineClientOptions {
  pipePath: string;
  wsUrl: string;
  /** 固定 WS 端口（测试/嵌入场景）；默认自动分配空闲端口。 */
  wsPort?: number;
  nodeBin?: string;
  engineScript?: string;
  dataDir: string;
  requestTimeoutMs?: number;
  spawnEngine?: () => ChildProcess;
  /** 请求前自动拉起引擎（默认 true；设为 false 则需手动 startEngine）。 */
  autoStart?: boolean;
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
  private wsUrl: string;
  private started = false;
  private starting?: Promise<void>;
  private readonly autoStart: boolean;

  constructor(private readonly opts: EngineClientOptions) {
    // 同步/扫描等任务可能耗时较长，默认 10 分钟
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 600_000;
    this.wsUrl = opts.wsUrl;
    this.autoStart = opts.autoStart ?? true;
  }

  async startEngine(taskKind: string): Promise<void> {
    if (this.started) return;
    if (this.starting) return this.starting;
    this.starting = this.doStart(taskKind).finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  /** 若引擎未启动则自动拉起（请求类方法内部调用）。 */
  async ensureStarted(): Promise<void> {
    if (this.started) return;
    await this.startEngine("query");
  }

  get connected(): boolean {
    return this.started;
  }

  /** 轻量连通性探测。 */
  async ping(): Promise<boolean> {
    try {
      await this.listPlatformStatus();
      return true;
    } catch {
      return false;
    }
  }

  private async doStart(taskKind: string): Promise<void> {
    // 预先分配真实 WS 端口（engine --ws-port 0 时客户端拿不到实际端口）
    const wsPort = this.opts.wsPort ?? (await this.findFreePort());
    const token = new URL(this.opts.wsUrl).searchParams.get("token") ?? "";
    this.wsUrl = `ws://127.0.0.1:${wsPort}/?token=${token}`;
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
          String(wsPort),
          "--ws-token",
          token,
        ],
        { stdio: "ignore", windowsHide: true },
      );
    this.proc.once("exit", () => {
      this.started = false;
      this.eventsAttached = false;
    });
    this.eventsAttached = false;
    // 引擎启动有延迟，WS 连接需要重试（最多 ~16s）
    let connected = false;
    for (let attempt = 0; attempt < 8 && !connected; attempt += 1) {
      try {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("ws connect timeout")), 3000);
          this.ws!.once("open", () => {
            clearTimeout(t);
            resolve();
          });
          this.ws!.once("error", (e) => {
            clearTimeout(t);
            reject(e);
          });
        });
        connected = true;
      } catch {
        this.ws?.terminate();
        if (attempt === 7) throw new Error("ws connect failed after retries");
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const res = await this.requestRaw({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "ENGINE_START",
      payload: { task: taskKind },
    });
    if (res.message_type !== "ENGINE_READY") {
      throw new Error(`ENGINE_START failed: ${res.message_type}`);
    }
    this.started = true;
    this.attachEvents();
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        const address = srv.address() as net.AddressInfo;
        srv.close(() => resolve(address.port));
      });
    });
  }

  request(msg: Omit<OmniMessage, "timestamp"> & { timestamp?: string }): Promise<OmniMessage> {
    if (!this.started && msg.message_type !== "ENGINE_START" && this.autoStart) {
      return this.ensureStarted().then(() => this.requestRaw(msg));
    }
    return this.requestRaw(msg);
  }

  private requestRaw(msg: Omit<OmniMessage, "timestamp"> & { timestamp?: string }): Promise<OmniMessage> {
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

  /** 更新业务规则（如 makerworld_sync_likes 用户开关）。 */
  async updateRule(key: string, value: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "RULE_UPDATE",
      payload: { rule_key: key, rule_value: value },
    });
  }

  /** 导入平台 Cookie（Cookie-Editor JSON / "k=v" 字符串），引擎加密后仅存本地。 */
  async importCookie(platform: string, cookiesJson: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "COOKIE_IMPORT",
      payload: { platform, cookies_json: cookiesJson },
    });
  }

  /** 查询平台 Cookie 状态（不返回明文）。 */
  async cookieStatus(platform: string): Promise<{
    platform: string;
    has_cookie: boolean;
    cookie_count: number;
    valid: boolean;
    account_status: string;
    account_error_reason: string | null;
  }> {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "COOKIE_STATUS",
      payload: { platform },
    });
    return (res.payload ?? {}) as {
      platform: string;
      has_cookie: boolean;
      cookie_count: number;
      valid: boolean;
      account_status: string;
      account_error_reason: string | null;
    };
  }

  /** 列出待审核 AI 建议。 */
  async listAiSuggestions(): Promise<
    Array<{
      id: string;
      collection_id: string;
      collection_title?: string;
      suggestion_type: string;
      payload?: string;
      status?: string;
      created_at?: string;
      reviewed_at?: string | null;
    }>
  > {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "AI_REVIEW_LIST",
      payload: {},
    });
    return (res.payload?.suggestions as Array<{
      id: string;
      collection_id: string;
      collection_title?: string;
      suggestion_type: string;
      payload?: string;
      status?: string;
      created_at?: string;
      reviewed_at?: string | null;
    }>) ?? [];
  }

  /** 审核建议：accepted / rejected。 */
  async reviewAiSuggestion(id: string, status: "accepted" | "rejected"): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "AI_REVIEW_UPDATE",
      payload: { suggestion_id: id, status },
    });
  }

  /** 撤销已确认的 AI 建议（24 小时内，SPEC S9.2）。 */
  async undoAiSuggestion(id: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "AI_REVIEW_UNDO",
      payload: { suggestion_id: id },
    });
  }

  /** 运行 ContentGroup 关联识别（生成 suggested_group 建议，等待用户审核）。 */
  async runAutoGroup(): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_GROUP",
      payload: {},
    });
  }

  /** 查询收藏列表（DTO）。 */
  async listCollections(): Promise<import("@omni/shared-core").CollectionDTO[]> {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "collections" },
    });
    return (res.payload?.collections as import("@omni/shared-core").CollectionDTO[]) ?? [];
  }

  /** 同步指定平台。 */
  async syncPlatform(
    platform: string,
    mode: "catalog" | "full" | "detail" = "full",
    depth?: number,
  ): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_SYNC",
      payload: { platform, mode, ...(typeof depth === "number" ? { depth } : {}) },
    });
  }

  /** 评论批量更新（最近 N 天，PRD 12.5）。 */
  async refreshComments(platform?: string, days?: number): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_COMMENTS",
      payload: { ...(platform ? { platform } : {}), ...(typeof days === "number" ? { days } : {}) },
    });
  }

  /** 规则中心（PRD 15.4）。 */
  async listRules(): Promise<{
    rules: Array<{
      rule_key: string;
      rule_value: string;
      default_value: string | null;
      description: string | null;
      impact: string | null;
      updated_at: string;
    }>;
    changes: Array<{ rule_key: string; old_value: string | null; new_value: string; changed_at: string }>;
  }> {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "RULE_LIST",
      payload: {},
    });
    return {
      rules: (res.payload?.rules ?? []) as Array<{
        rule_key: string;
        rule_value: string;
        default_value: string | null;
        description: string | null;
        impact: string | null;
        updated_at: string;
      }>,
      changes: (res.payload?.changes ?? []) as Array<{
        rule_key: string;
        old_value: string | null;
        new_value: string;
        changed_at: string;
      }>,
    };
  }

  /** 更新收藏整理状态。 */
  async setOrganizeState(
    collectionId: string,
    organizeStatus: "unorganized" | "viewed" | "organized" | "archived",
  ): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_ORGANIZE",
      payload: { collection_id: collectionId, organize_status: organizeStatus },
    });
  }

  /** 查询各平台收藏数与上次同步时间。 */
  async listPlatformStatus(): Promise<
    Array<{
      platform: string;
      count: number;
      lastSyncAt: string | null;
      todaySyncCount: number;
      health: { level: "green" | "yellow" | "red"; reason: string };
    }>
  > {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "platforms" },
    });
    return (res.payload?.platforms as Array<{
      platform: string;
      count: number;
      lastSyncAt: string | null;
      todaySyncCount: number;
      health: { level: "green" | "yellow" | "red"; reason: string };
    }>) ?? [];
  }

  /** 查询单条收藏详情（含评论）。 */
  async getCollection(collectionId: string): Promise<import("@omni/shared-core").CollectionDTO | null> {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "collection", id: collectionId },
    });
    return (res.payload?.collection as import("@omni/shared-core").CollectionDTO) ?? null;
  }

  /** 用户手动给收藏打 Tag。 */
  async addTag(collectionId: string, tag: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_TAG",
      payload: { collection_id: collectionId, tag },
    });
  }

  /** Tag Atlas 列表（PRD 16.2）。 */
  async listTags(): Promise<TagDTO[]> {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TAG_LIST",
      payload: {},
    });
    return (res.payload?.tags as TagDTO[]) ?? [];
  }

  /** 为 Tag 添加别名。 */
  async addTagAlias(tag: string, alias: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TAG_ALIAS_ADD",
      payload: { tag, alias },
    });
  }

  /** 合并 Tag（source 并入 target）。 */
  async mergeTags(source: string, target: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TAG_MERGE",
      payload: { source, target },
    });
  }

  /** 重命名 Tag（重名自动合并）。 */
  async renameTag(tag: string, next: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TAG_RENAME",
      payload: { tag, next },
    });
  }

  /** Topic 列表（PRD 17）。 */
  async listTopics(): Promise<TopicDTO[]> {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TOPIC_LIST",
      payload: {},
    });
    return (res.payload?.topics as TopicDTO[]) ?? [];
  }

  /** 重命名 Topic。 */
  async renameTopic(topicId: string, name: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TOPIC_RENAME",
      payload: { topic_id: topicId, name },
    });
  }

  /** 用户手动把收藏归入 Topic。 */
  async addTopic(collectionId: string, topic: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_TOPIC",
      payload: { collection_id: collectionId, topic },
    });
  }

  /** 用户手动设置收藏优先级。 */
  async setPriority(collectionId: string, priority: "normal" | "important" | "project" | "knowledge"): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_PRIORITY",
      payload: { collection_id: collectionId, priority },
    });
  }

  /** 用户手动评分 1~5 星（PRD 29.2）；rating=0 清除。 */
  async setRating(collectionId: string, rating: number): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_RATING",
      payload: { collection_id: collectionId, rating },
    });
  }

  /** 用户精选评论（PRD 7.3）：切换 is_starred 同步副本。 */
  async starComment(collectionId: string, commentId: string, starred: boolean): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_COMMENT_STAR",
      payload: { collection_id: collectionId, comment_id: commentId, starred },
    });
  }

  /** 扫描本地文件夹（Markdown/PDF）并关联收藏。 */
  async scanFolder(folder: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_INDEX",
      payload: { folder },
    });
  }

  /** 按需抓取网页正文（不落盘）。 */
  async fetchPageText(url: string): Promise<{ title?: string; text?: string; comments?: Array<{ author: string; content: string; likeCount: number }> }> {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_FETCH",
      payload: { url },
    });
    return {
      title: (res.payload?.title as string | undefined) ?? undefined,
      text: (res.payload?.text as string | undefined) ?? undefined,
      comments: (res.payload?.comments as Array<{ author: string; content: string; likeCount: number }> | undefined) ?? undefined,
    };
  }

  /** 稍后再看处理：转为收藏或归档。 */
  async convertCollection(collectionId: string, to: "favorited" | "archived"): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_CONVERT",
      payload: { collection_id: collectionId, to },
    });
  }

  /** 查询本地文件索引。 */
  async listLocalFiles(): Promise<Array<{ file_path: string; file_name: string; file_type: string | null; linked_collection_id: string | null; linked_title: string | null }>> {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "local_files" },
    });
    return (res.payload?.files as Array<{ file_path: string; file_name: string; file_type: string | null; linked_collection_id: string | null; linked_title: string | null }>) ?? [];
  }

  /** 查询汇总统计。 */
  async getSummary(): Promise<{
    total: number;
    unorganized: number;
    important: number;
    aiPending: number;
    watchLater: number;
    localFiles: number;
    topics: number;
    anomalies: { deleted: number; syncFailed: number; fileMissing: number };
  }> {
    const res = await this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "summary" },
    });
    return (res.payload?.summary as {
      total: number;
      unorganized: number;
      important: number;
      aiPending: number;
      watchLater: number;
      localFiles: number;
      topics: number;
      anomalies: { deleted: number; syncFailed: number; fileMissing: number };
    }) ?? {
      total: 0, unorganized: 0, important: 0, aiPending: 0, watchLater: 0, localFiles: 0, topics: 0,
      anomalies: { deleted: 0, syncFailed: 0, fileMissing: 0 },
    };
  }

  /** 批量操作。 */
  async batch(ids: string[], action: "tag" | "topic" | "priority" | "organize" | "convert", value: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_BATCH",
      payload: { ids, action, value },
    });
  }

  /** Manual 模式：提交 AI 回复解析为 Suggestion。 */
  async submitManualAI(collectionId: string, reply: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_AI_MANUAL",
      payload: { collection_id: collectionId, reply },
    });
  }

  /** Manual 批量：一次提交多收藏的打包回复（PRD 19.3 批量版）。 */
  async submitManualAIBatch(collectionIds: string[], reply: string): Promise<OmniMessage> {
    return this.request({
      request_id: randomUUID(),
      timestamp: new Date().toISOString(),
      message_type: "TASK_AI_MANUAL_BATCH",
      payload: { collection_ids: collectionIds, reply },
    });
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
