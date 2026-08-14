import type { Plugin } from "obsidian";

export interface OmniSettings {
  /** 用户指定的数据目录（ADR-014）。 */
  dataDir: string;
  /** Engine 入口脚本路径（插件安装时释放，TDD Part 12.1）。 */
  engineScript: string;
  /** 一次性 WebSocket 握手令牌。 */
  wsToken: string;
  /** MakerWorld 是否同步点赞内容（用户开关，默认关闭）。 */
  makerworldSyncLikes: boolean;
  /** Node.js 可执行文件路径（Engine 子进程）；留空时使用 PATH 上的 node。 */
  nodeBin: string;
  /** AI 批处理总开关（写入规则 ai_enabled）。 */
  aiEnabled: boolean;
  /** AI Provider：deepseek | openai。 */
  aiProvider: string;
  /** AI API Key（写入规则 ai_api_key，仅本地）。 */
  aiApiKey: string;
  /** AI 模型名（写入规则 ai_model）。 */
  aiModel: string;
  /** 初次/手动同步模式：catalog（轻量目录）| full（含详情）。 */
  initialSyncMode: "catalog" | "full";
  /** 请求前自动拉起 Engine（默认 true；关闭后需手动点「启动引擎」）。 */
  autoStartEngine: boolean;
  /** 收藏列表默认视图：list（纯文字）| card（缩略图卡片）。 */
  viewMode: "list" | "card";
  /** 本地文件扫描目录列表。 */
  localFolders: string[];
  /** 是否自动扫描本地目录。 */
  localAutoScan: boolean;
  /** 自动扫描间隔（分钟）。 */
  localAutoScanMinutes: number;
  /** 各平台自动同步频率（daily/weekly）。 */
  syncFrequency: Record<string, "daily" | "weekly">;
  /** 初始化完整详情同步条数上限（20~80）。 */
  initFullDetailLimit: number;
  /** 自动同步随机执行窗口（分钟）。 */
  syncRandomWindowMinutes: number;
  /** 单平台每日自动同步次数上限。 */
  dailySyncCapPerPlatform: number;
  /** 功能级 AI 开关：Tag。 */
  aiTagEnabled: boolean;
  /** 功能级 AI 开关：Topic。 */
  aiTopicEnabled: boolean;
  /** 功能级 AI 开关：摘要。 */
  aiSummaryEnabled: boolean;
  /** 每日云端 AI 调用上限。 */
  aiDailyCallLimit: number;
  /** 深度历史同步默认回溯深度（页）。 */
  deepSyncDepth: number;
  /** 评论批量更新最近 N 天。 */
  commentBatchUpdateDays: number;
  /** 各平台上次自动同步时间（ISO）。 */
  lastAutoSyncAt: Record<string, string>;
  /** 自动同步总开关（默认关闭，避免风控期平台被定时触发）。 */
  autoSyncEnabled: boolean;
}

export const DEFAULT_SETTINGS: OmniSettings = {
  dataDir: "",
  engineScript: "",
  wsToken: "",
  makerworldSyncLikes: false,
  nodeBin: "",
  aiEnabled: false,
  aiProvider: "deepseek",
  aiApiKey: "",
  aiModel: "",
  initialSyncMode: "catalog",
  autoStartEngine: true,
  viewMode: "list",
  localFolders: [],
  localAutoScan: false,
  localAutoScanMinutes: 30,
  syncFrequency: {
    bilibili: "daily",
    youtube: "daily",
    xiaohongshu: "daily",
    makerworld: "daily",
    xiaoheihe: "daily",
  },
  initFullDetailLimit: 50,
  syncRandomWindowMinutes: 120,
  dailySyncCapPerPlatform: 3,
  aiTagEnabled: true,
  aiTopicEnabled: true,
  aiSummaryEnabled: true,
  aiDailyCallLimit: 50,
  deepSyncDepth: 50,
  commentBatchUpdateDays: 7,
  lastAutoSyncAt: {},
  autoSyncEnabled: false,
};

export async function loadSettings(plugin: Plugin): Promise<OmniSettings> {
  return Object.assign({}, DEFAULT_SETTINGS, (await plugin.loadData()) ?? {});
}

export async function saveSettings(plugin: Plugin, settings: OmniSettings): Promise<void> {
  await plugin.saveData(settings);
}
