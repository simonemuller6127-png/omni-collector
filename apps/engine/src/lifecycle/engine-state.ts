/** Engine 进程状态机（ADR-009 冻结）。 */
export enum EngineState {
  OFF = "OFF",
  STARTING = "STARTING",
  READY = "READY",
  RUNNING = "RUNNING",
  IDLE = "IDLE",
  STOPPING = "STOPPING",
  FAILED = "FAILED",
}
