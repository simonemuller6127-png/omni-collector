import { RuleCenter } from "@omni/database";

export interface InitSyncPlan {
  /** 目录全量无限制；完整详情仅同步最近 N 条（PRD 6.4）。 */
  fullDetailLimit: number;
}

/**
 * 初始化同步规划（PRD 6.4 / SPEC S10）：
 * init_sync_full_limit 默认 50，区间 20~80，从 RuleCenter 读取。
 */
export function planInitialSync(rules: RuleCenter): InitSyncPlan {
  const raw = rules.getNumber("init_sync_full_limit", 50);
  const clamped = Math.min(80, Math.max(20, raw));
  return { fullDetailLimit: clamped };
}
