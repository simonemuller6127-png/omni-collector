/** 同步任务状态机（TDD Part 8.2，SPEC S8.2 冻结）。 */

export const SYNC_TASK_STATUSES = [
  "pending",
  "running",
  "success",
  "failed",
  "retrying",
  "human_queue",
] as const;

export type SyncTaskStatus = (typeof SYNC_TASK_STATUSES)[number];

export const SYNC_TASK_TRANSITIONS: Record<SyncTaskStatus, SyncTaskStatus[]> = {
  pending: ["running"],
  running: ["success", "failed"],
  failed: ["retrying", "human_queue"],
  retrying: ["running"],
  human_queue: [],
  success: [],
};

export type SyncTransitionResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateSyncTransition(
  from: SyncTaskStatus,
  to: SyncTaskStatus,
): SyncTransitionResult {
  const allowed = SYNC_TASK_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, error: `invalid sync task transition: ${from} -> ${to}` };
  }
  return { ok: true };
}
