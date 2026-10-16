/**
 * 插件内报错解释文档（错误码 -> 含义 + 修复方法）。
 * Engine 返回的错误码格式统一为 MODULE_NNN（TDD Part 10），
 * 出现在 TASK_ERROR payload、SyncReport.errorCode/errorDetail 与平台健康 reason 中。
 */

export interface ErrorDoc {
  code: string;
  title: string;
  meaning: string;
  fix: string;
}

export const ERROR_DOCS: Record<string, ErrorDoc> = {
  AUTH_002: {
    code: "AUTH_002",
    title: "平台会话失效",
    meaning:
      "平台的登录态（Cookie/storageState）已过期或无效。同步时拿不到你的账号身份，因此无法读取收藏——此前版本甚至会静默抓到 0 条仍显示“同步完成”。",
    fix: "打开 设置 → Omni Collector → 账号登录，点对应平台的「登录」按钮，在弹出的浏览器窗口里重新登录，登录成功后会自动重新抓取 Cookie。",
  },
  AUTH_003: {
    code: "AUTH_003",
    title: "Cookie 状态查询失败",
    meaning: "查询平台 Cookie 状态时出错（平台名无效或本地加密存储读取失败）。",
    fix: "确认平台名正确；若反复出现，尝试重新导入 Cookie 或重新登录。",
  },
  LOGIN_001: {
    code: "LOGIN_001",
    title: "登录流程失败",
    meaning: "可视化登录窗口流程异常：平台不支持、等待超时（默认 300 秒）或窗口被提前关闭。",
    fix: "重新点「登录」，在窗口保持打开的状态下完成登录；网络不好时多等页面加载完成。",
  },
  SYNC_001: {
    code: "SYNC_001",
    title: "同步抓取/入库失败",
    meaning:
      "同步流水线在抓取平台数据或写入数据库时失败：常见原因是平台风控（如 B 站 -412）、接口变更、网络波动或某条数据缺字段。",
    fix: "查看 errorDetail 里的平台错误码；稍后重试一次。若持续失败，把 errorDetail 反馈给开发者。",
  },
  SYNC_002: {
    code: "SYNC_002",
    title: "同步任务派发失败",
    meaning: "Engine 在启动或执行同步任务时发生异常（如数据库被占用、浏览器实例启动失败）。",
    fix: "先停止再启动 Engine（侧边栏或设置里操作），然后重试同步。",
  },
  SYNC_003: {
    code: "SYNC_003",
    title: "评论批量刷新失败",
    meaning: "批量重新抓取最近 N 天收藏的评论时失败。",
    fix: "减少刷新天数后重试；若某平台一直失败，先确认该平台登录态有效（见 AUTH_002）。",
  },
  COMM_001: {
    code: "COMM_001",
    title: "通信错误",
    meaning: "插件与 Engine 之间的请求失败或超时（Engine 未就绪、正在执行长任务或已退出）。",
    fix: "点侧边栏「启动 Engine」；若已启动仍报错，重启 Obsidian 后再试。",
  },
  QUERY_001: {
    code: "QUERY_001",
    title: "查询失败",
    meaning: "查询的收藏不存在，或数据库读取异常。",
    fix: "刷新收藏列表；若刚同步完仍找不到，确认同步是否成功。",
  },
  RULE_001: {
    code: "RULE_001",
    title: "规则更新失败",
    meaning: "更新规则时缺少 rule_key 或值非法。",
    fix: "检查设置项填写是否完整。",
  },
  RULE_002: {
    code: "RULE_002",
    title: "规则读取失败",
    meaning: "读取规则中心（含变更记录）时数据库异常。",
    fix: "重启 Engine；若持续出现，检查数据库文件是否被其他进程锁定。",
  },
  AI_002: {
    code: "AI_002",
    title: "AI 未配置或参数缺失",
    meaning: "未配置 AI Provider（缺少 API Key），或请求缺少 collection_id。",
    fix: "打开设置填写 AI Provider 与 API Key 后重试。",
  },
  AI_003: {
    code: "AI_003",
    title: "AI 任务执行失败",
    meaning: "调用 AI 生成建议时失败（网络、额度或模型返回异常）。",
    fix: "检查 API Key 与网络；查看 Engine 日志中的具体模型报错。",
  },
  AI_005: {
    code: "AI_005",
    title: "建议审核失败",
    meaning: "审核的建议不存在，或 status 不在 accepted/rejected/expired 之内。",
    fix: "刷新 AI 建议审核列表后重试。",
  },
  AI_006: {
    code: "AI_006",
    title: "Manual AI 输入不完整",
    meaning: "手动提交 AI 回复时缺少 collection_id 或回复内容。",
    fix: "确认从收藏详情发起，并粘贴了完整回复。",
  },
  AI_007: {
    code: "AI_007",
    title: "无法撤销建议",
    meaning: "仅接受后 24 小时内可撤销；超过时限或找不到撤销所需的反馈记录。",
    fix: "超过 24 小时的建议请手动修正对应 Tag/Topic/摘要。",
  },
  AI_008: {
    code: "AI_008",
    title: "Manual AI 批量输入不完整",
    meaning: "批量打包提交时缺少 collection_ids 或回复内容。",
    fix: "重新生成批量模板，并完整粘贴 AI 的批量回复。",
  },
  IDX_001: {
    code: "IDX_001",
    title: "本地文件索引失败",
    meaning: "扫描文件夹时路径不存在或读取失败。",
    fix: "确认文件夹路径存在且可读（默认为 vault 内 Omni Collector 目录）。",
  },
  FETCH_002: {
    code: "FETCH_002",
    title: "小红书正文抓取受限",
    meaning: "小红书正文需要 xsec_token，该 token 会随时间失效（平台风控）。",
    fix: "对该平台重新执行一次同步后，再打开正文抓取。",
  },
  YTDLP_FAILED: {
    code: "YTDLP_FAILED",
    title: "yt-dlp 执行失败",
    meaning: "YouTube 同步依赖 yt-dlp，未安装、不在 PATH、或缺少 cookies 文件。",
    fix: "安装/更新 yt-dlp；需要登录观看的视频，先在设置里更新 YouTube Cookie。",
  },
  ENGINE_001: {
    code: "ENGINE_001",
    title: "Engine 已在运行",
    meaning: "检测到另一个 Engine 实例（engine.lock 已存在），禁止多开。",
    fix: "如确认没有其他实例，删除数据目录下的 engine.lock 后重试。",
  },
  ENGINE_002: {
    code: "ENGINE_002",
    title: "数据库迁移失败",
    meaning: "数据库校验/迁移失败，已自动回滚到备份。",
    fix: "查看 Engine 日志确认原因；不要手工改动 OmniCollector.db。",
  },
};

/** 从任意错误文本中匹配错误码（如 "SYNC_002: ..." / "COMM_001: AUTH_002: xxx"）。
 * 一条消息里有多个错误码时优先取有文档且更具体的那个（COMM_001 只是信封错误）。 */
export function matchErrorCode(message?: string | null): string | null {
  if (!message) return null;
  const re = /\b((?:AUTH|SYNC|LOGIN|COMM|QUERY|RULE|AI|IDX|FETCH|ENGINE|YTDLP)_\d{3})\b/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) found.push(m[1]);
  const documented = found.filter((c) => c in ERROR_DOCS);
  return documented.find((c) => c !== "COMM_001") ?? documented[0] ?? null;
}

/** 取错误码对应的解释文档；纯文本里没有已知错误码时返回 null。 */
export function describeError(messageOrCode?: string | null): ErrorDoc | null {
  if (!messageOrCode) return null;
  const code = ERROR_DOCS[messageOrCode] ? messageOrCode : matchErrorCode(messageOrCode);
  return code ? ERROR_DOCS[code] : null;
}

/** 把报错格式化成「原文 + 换行 + 含义/修复」的 Notice 文本。 */
export function formatErrorWithDoc(message?: string | null): string {
  const doc = describeError(message);
  if (!doc) return message ?? "未知错误";
  return `${message}\n【${doc.code} ${doc.title}】${doc.meaning}\n修复：${doc.fix}`;
}
