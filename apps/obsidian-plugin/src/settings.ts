import type { Plugin } from "obsidian";

export interface OmniSettings {
  /** 用户指定的数据目录（ADR-014）。 */
  dataDir: string;
  /** Engine 入口脚本路径（插件安装时释放，TDD Part 12.1）。 */
  engineScript: string;
  /** 一次性 WebSocket 握手令牌。 */
  wsToken: string;
}

export const DEFAULT_SETTINGS: OmniSettings = {
  dataDir: "",
  engineScript: "",
  wsToken: "",
};

export async function loadSettings(plugin: Plugin): Promise<OmniSettings> {
  return Object.assign({}, DEFAULT_SETTINGS, (await plugin.loadData()) ?? {});
}

export async function saveSettings(plugin: Plugin, settings: OmniSettings): Promise<void> {
  await plugin.saveData(settings);
}
