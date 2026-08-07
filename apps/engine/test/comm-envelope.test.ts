import { describe, expect, it } from "vitest";
import { validateOmniMessage } from "@omni/shared-core";

const valid = {
  request_id: "r1",
  timestamp: "2026-08-07T00:00:00Z",
  message_type: "STATUS_QUERY",
  payload: { scope: "engine" },
};

describe("validateOmniMessage", () => {
  it("accepts a valid envelope", () => {
    const r = validateOmniMessage(valid);
    expect(r.ok).toBe(true);
  });

  it("rejects missing request_id / timestamp / message_type", () => {
    for (const key of ["request_id", "timestamp", "message_type"]) {
      const copy = { ...valid, [key]: undefined };
      expect(validateOmniMessage(copy).ok).toBe(false);
    }
  });

  it("rejects unknown message_type", () => {
    expect(validateOmniMessage({ ...valid, message_type: "NOPE" }).ok).toBe(false);
  });

  it("rejects missing required payload fields", () => {
    expect(
      validateOmniMessage({
        ...valid,
        message_type: "RULE_UPDATE",
        payload: { rule_key: "k" },
      }).ok,
    ).toBe(false);
    expect(
      validateOmniMessage({
        ...valid,
        message_type: "TASK_AI",
        payload: {},
      }).ok,
    ).toBe(false);
  });
});
