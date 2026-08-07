import {
  validateSyncTransition,
  type SyncTaskStatus,
} from "@omni/shared-core";

/**
 * 同步任务状态机（TDD Part 8.2，ADR-008）：
 * pending → running → success
 * pending → running → failed → retrying → success
 * failed 达到最大重试次数 → human_queue（SYNC_003）
 */
export class SyncTaskState {
  private _status: SyncTaskStatus = "pending";
  private _retryCount = 0;

  constructor(private readonly maxRetry = 3) {}

  get status(): SyncTaskStatus {
    return this._status;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  start(): void {
    this.transition("running");
  }

  succeed(): void {
    this.transition("success");
  }

  fail(): void {
    this.transition("failed");
    this._retryCount += 1;
    this._status = this._retryCount >= this.maxRetry ? "human_queue" : "retrying";
  }

  retry(): void {
    this.transition("running");
  }

  private transition(next: SyncTaskStatus): void {
    const result = validateSyncTransition(this._status, next);
    if (!result.ok) {
      throw new Error(result.error);
    }
    this._status = next;
  }
}
