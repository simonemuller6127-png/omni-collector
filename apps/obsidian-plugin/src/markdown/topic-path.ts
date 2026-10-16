/**
 * Topic 路径命名（PRD 17 多级 Topic，B 部分：只改渲染/路径，不跑迁移）：
 * 用户决策「Topic 层级用路径命名实现」（Topics/游戏/F1赛车.md），
 * 不做 topics.parent_id migration、不上 Embedding/Clustering。
 * 纯函数模块，不依赖 Obsidian API，可单测。
 */

/** 层级分隔符（存储侧 Topic 名即含此字符）。 */
export const TOPIC_PATH_SEPARATOR = ":";

/**
 * 拆分层级 Topic 名为路径段，去掉空段与首尾空白。
 * 「游戏:F1赛车」→ ["游戏", "F1赛车"]；「桌搭设计」→ ["桌搭设计"]；"" → []。
 */
export function parseTopicSegments(topicName: string): string[] {
  return (topicName ?? "")
    .split(TOPIC_PATH_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 是否层级 Topic（含分隔符且至少两段）。 */
export function isHierarchicalTopic(topicName: string): boolean {
  return parseTopicSegments(topicName).length > 1;
}

/**
 * 层级 Topic 的 frontmatter parent（父级路径名），无层级时返回 undefined。
 * 「游戏:F1赛车」→ "游戏"；「游戏:F1:排位赛」→ "游戏:F1"；「桌搭设计」→ undefined。
 */
export function topicParentPath(topicName: string): string | undefined {
  const segs = parseTopicSegments(topicName);
  return segs.length > 1 ? segs.slice(0, -1).join(TOPIC_PATH_SEPARATOR) : undefined;
}

/** 末端（叶子）名称，用于 H1 与文件名。「游戏:F1赛车」→ "F1赛车"。 */
export function topicLeafName(topicName: string): string {
  const segs = parseTopicSegments(topicName);
  return segs.length > 0 ? segs[segs.length - 1] : (topicName ?? "").trim();
}

/** 层级深度（1 起）。「桌搭设计」→ 1，「游戏:F1赛车」→ 2。 */
export function topicDepth(topicName: string): number {
  const segs = parseTopicSegments(topicName);
  return segs.length > 0 ? segs.length : 1;
}

/**
 * Topic hub 相对 Topics/ 根的子路径（不含扩展名，段已做文件名清洗）。
 * 「游戏:F1赛车」→ "游戏/F1赛车"；「桌搭设计」→ "桌搭设计"。
 * 跨平台不安全字符（/ \ : * ? " < > |）由调用方的 sanitizeFilename 兜底；
 * 这里再兜一层，避免路径穿越。
 */
export function topicHubRelPath(topicName: string, sanitize: (s: string) => string): string {
  const segs = parseTopicSegments(topicName);
  if (segs.length === 0) return sanitize(topicName ?? "");
  return segs.map(sanitize).filter(Boolean).join("/");
}

/** 路径存在性判断（Obsidian DataAdapter.exists）。 */
export interface ExistsChecker {
  exists(p: string): Promise<boolean>;
}

/** 目录创建（Obsidian Vault.createFolder；也接受同步返回的实现）。 */
export interface FolderCreator {
  createFolder(p: string): unknown;
}

/**
 * 递归创建 vault 目录（父目录先建），幂等。
 * 拆 exists / createFolder 两个能力，因 Obsidian 中分散在 DataAdapter 与 Vault 上。
 */
export async function ensureDir(
  checker: ExistsChecker,
  creator: FolderCreator,
  dir: string,
): Promise<void> {
  if (await checker.exists(dir)) return;
  const parts = dir.replace(/\\/g, "/").split("/");
  let acc = "";
  for (const part of parts) {
    if (!part) {
      acc = "/";
      continue;
    }
    acc = acc ? `${acc}/${part}` : part;
    if (await checker.exists(acc)) continue;
    try {
      const res = creator.createFolder(acc);
      // 兼容同步与异步实现
      if (res && typeof (res as Promise<unknown>).then === "function") {
        await (res as Promise<unknown>);
      }
    } catch {
      // 目录已存在或并发创建：静默忽略，交由后续 write 报错
    }
  }
}
