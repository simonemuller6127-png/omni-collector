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
};

export async function loadSettings(plugin: Plugin): Promise<OmniSettings> {
  return Object.assign({}, DEFAULT_SETTINGS, (await plugin.loadData()) ?? {});
}

export async function saveSettings(plugin: Plugin, settings: OmniSettings): Promise<void> {
  await plugin.saveData(settings);
}
