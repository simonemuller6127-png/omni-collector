/** 通信协议（TDD Part 4，ADR-001 冻结）。 */

export const MESSAGE_TYPES = [
  "ENGINE_START",
  "ENGINE_STOP",
  "TASK_SYNC",
  "TASK_AI",
  "TASK_GROUP",
  "TASK_ORGANIZE",
  "TASK_TAG",
  "TASK_TOPIC",
  "TASK_PRIORITY",
  "TASK_INDEX",
  "TASK_FETCH",
  "TASK_CONVERT",
  "TASK_BATCH",
  "TASK_AI_MANUAL",
  "TASK_AI_MANUAL_BATCH",
  "TAG_LIST",
  "TAG_ALIAS_ADD",
  "TAG_MERGE",
  "TAG_RENAME",
  "TOPIC_LIST",
  "TOPIC_RENAME",
  "AI_REVIEW_LIST",
  "AI_REVIEW_UPDATE",
  "AI_REVIEW_UNDO",
  "STATUS_QUERY",
  "RULE_UPDATE",
  "ENGINE_READY",
  "TASK_PROGRESS",
  "TASK_COMPLETE",
  "TASK_ERROR",
  "HEALTH_UPDATE",
  "ENGINE_CLOSING",
] as const;

export type OmniMessageType = (typeof MESSAGE_TYPES)[number];

export interface OmniMessage {
  request_id: string;
  timestamp: string;
  message_type: OmniMessageType;
  payload: Record<string, unknown>;
}

/** 各消息类型 payload 必填字段（TDD Part 4.4）。 */
export const REQUIRED_PAYLOAD_FIELDS: Partial<Record<OmniMessageType, string[]>> = {
  ENGINE_START: ["task"],
  TASK_SYNC: ["mode"],
  TASK_AI: ["collection_id"],
  TASK_GROUP: [],
  TASK_ORGANIZE: ["collection_id", "organize_status"],
  TASK_TAG: ["collection_id", "tag"],
  TASK_TOPIC: ["collection_id", "topic"],
  TASK_PRIORITY: ["collection_id", "priority"],
  TASK_INDEX: ["folder"],
  TASK_FETCH: ["url"],
  TASK_CONVERT: ["collection_id", "to"],
  TASK_BATCH: ["ids", "action"],
  TASK_AI_MANUAL: ["collection_id", "reply"],
  TASK_AI_MANUAL_BATCH: ["collection_ids", "reply"],
  TAG_ALIAS_ADD: ["tag", "alias"],
  TAG_MERGE: ["source", "target"],
  TAG_RENAME: ["tag", "next"],
  TOPIC_RENAME: ["topic_id", "name"],
  AI_REVIEW_UNDO: ["suggestion_id"],
  AI_REVIEW_UPDATE: ["suggestion_id", "status"],
  STATUS_QUERY: ["scope"],
  RULE_UPDATE: ["rule_key", "rule_value"],
};

export type ValidationResult =
  | { ok: true; message: OmniMessage }
  | { ok: false; error: string };

export function validateOmniMessage(value: unknown): ValidationResult {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "message must be an object" };
  }
  const msg = value as Record<string, unknown>;
  if (typeof msg.request_id !== "string" || msg.request_id.length === 0) {
    return { ok: false, error: "missing request_id" };
  }
  if (typeof msg.timestamp !== "string" || msg.timestamp.length === 0) {
    return { ok: false, error: "missing timestamp" };
  }
  if (!MESSAGE_TYPES.includes(msg.message_type as OmniMessageType)) {
    return { ok: false, error: `unknown message_type: ${String(msg.message_type)}` };
  }
  if (typeof msg.payload !== "object" || msg.payload === null) {
    return { ok: false, error: "payload must be an object" };
  }
  const payload = msg.payload as Record<string, unknown>;
  const required = REQUIRED_PAYLOAD_FIELDS[msg.message_type as OmniMessageType];
  if (required) {
    for (const field of required) {
      if (payload[field] === undefined) {
        return { ok: false, error: `${msg.message_type} requires payload.${field}` };
      }
    }
  }
  return { ok: true, message: msg as unknown as OmniMessage };
}
