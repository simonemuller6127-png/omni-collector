/** 统一错误（TDD Part 10 基线：MODULE_CODE_NUMBER + 等级）。 */
export type ErrorLevel = "INFO" | "WARNING" | "ERROR" | "FATAL";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly level: ErrorLevel,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const ErrorCodes = {
  ENGINE_001: "ENGINE_001", // ERROR 实例已存在，禁止多开
  ENGINE_002: "ENGINE_002", // FATAL Migration 校验失败，已回滚备份
  ENGINE_003: "ENGINE_003", // ERROR 状态不允许该操作 / 任务超时
  ENGINE_004: "ENGINE_004", // INFO Engine 正常关闭
  ENGINE_005: "ENGINE_005", // ERROR 非法状态迁移
} as const;
