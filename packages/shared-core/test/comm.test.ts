import { describe, expect, it } from "vitest";
import { MESSAGE_TYPES, validateOmniMessage } from "../src/comm.js";

function msg(message_type: string, payload: Record<string, unknown>) {
  return {
    request_id: "r1",
    timestamp: new Date().toISOString(),
    message_type,
    payload,
  };
}

describe("comm protocol v1.1 tag/topic/ai additions", () => {
  it("registers new message types", () => {
    for (const t of [
      "TAG_LIST",
      "TAG_ALIAS_ADD",
      "TAG_MERGE",
      "TAG_RENAME",
      "TOPIC_LIST",
      "TOPIC_RENAME",
      "AI_REVIEW_UNDO",
    ]) {
      expect(MESSAGE_TYPES).toContain(t);
    }
  });

  it("requires payload fields for tag/topic management messages", () => {
    expect(validateOmniMessage(msg("TAG_ALIAS_ADD", {})).ok).toBe(false);
    expect(validateOmniMessage(msg("TAG_MERGE", { source: "a", target: "b" })).ok).toBe(true);
    expect(validateOmniMessage(msg("TAG_RENAME", { tag: "a", next: "b" })).ok).toBe(true);
    expect(validateOmniMessage(msg("TOPIC_RENAME", { topic_id: "t1", name: "x" })).ok).toBe(true);
    expect(validateOmniMessage(msg("AI_REVIEW_UNDO", { suggestion_id: "s1" })).ok).toBe(true);
    expect(validateOmniMessage(msg("TAG_LIST", {})).ok).toBe(true);
    expect(validateOmniMessage(msg("TOPIC_LIST", {})).ok).toBe(true);
    expect(validateOmniMessage(msg("TASK_AI_MANUAL_BATCH", { collection_ids: ["a"], reply: "x" })).ok).toBe(true);
    expect(validateOmniMessage(msg("TASK_AI_MANUAL_BATCH", {})).ok).toBe(false);
    expect(validateOmniMessage(msg("RULE_LIST", {})).ok).toBe(true);
    expect(validateOmniMessage(msg("TASK_COMMENTS", {})).ok).toBe(true);
  });
});
