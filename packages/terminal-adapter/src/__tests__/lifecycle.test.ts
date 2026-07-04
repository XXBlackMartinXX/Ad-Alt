import { describe, expect, it } from "vitest";
import {
  buildLifecycleEvent,
  findForbiddenFields,
  assertNoForbiddenFields,
  newSessionId,
  LIFECYCLE_EVENT_TYPES,
  FORBIDDEN_FIELDS,
} from "../lifecycle.js";

describe("buildLifecycleEvent", () => {
  it("builds a clean event for every allowed event type", () => {
    for (const eventType of LIFECYCLE_EVENT_TYPES) {
      const event = buildLifecycleEvent({ eventType, adapterId: "manual", sessionId: newSessionId() });
      expect(event.eventType).toBe(eventType);
      expect(findForbiddenFields(event)).toEqual([]);
    }
  });

  it("includes durationMs only when provided", () => {
    const event = buildLifecycleEvent({
      eventType: "wait_state_ended",
      adapterId: "manual",
      sessionId: newSessionId(),
      durationMs: 500,
    });
    expect(event.durationMs).toBe(500);
  });

  it("includes exitCode only when provided", () => {
    const event = buildLifecycleEvent({
      eventType: "adapter_stopped",
      adapterId: "manual",
      sessionId: newSessionId(),
      exitCode: 0,
    });
    expect(event.exitCode).toBe(0);
  });
});

describe("findForbiddenFields / assertNoForbiddenFields", () => {
  it("flags a forbidden field if present", () => {
    const unsafe = { eventType: "adapter_started", adapterId: "manual", commandText: "rm -rf /" };
    const hits = findForbiddenFields(unsafe);
    expect(hits).toContain("commandText");
  });

  it("flags every forbidden field name in the closed list when injected", () => {
    for (const field of FORBIDDEN_FIELDS) {
      const unsafe = { [field]: "sensitive-value" };
      expect(findForbiddenFields(unsafe)).toContain(field);
    }
  });

  it("flags unexpected keys not in the allow-list even if not explicitly forbidden", () => {
    const unexpected = { eventType: "adapter_started", adapterId: "manual", somethingNew: "x" };
    expect(findForbiddenFields(unexpected)).toContain("somethingNew");
  });

  it("throws via assertNoForbiddenFields when a forbidden field is present", () => {
    expect(() => assertNoForbiddenFields({ stdout: "leaked output" })).toThrow();
  });

  it("does not throw for a clean, valid event", () => {
    const event = buildLifecycleEvent({
      eventType: "session_started",
      adapterId: "manual",
      sessionId: newSessionId(),
    });
    expect(() => assertNoForbiddenFields(event)).not.toThrow();
  });
});
