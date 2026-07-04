import { describe, expect, it } from "vitest";
import { runDemo } from "../demo.js";
import { findForbiddenFields } from "../lifecycle.js";
import { DEFAULT_FLAGS_ENABLED, DEFAULT_FLAGS_DISABLED } from "../kill-switch.js";

const instantSleep = () => Promise.resolve();

describe("runDemo", () => {
  it("emits the full synthetic lifecycle sequence when enabled", async () => {
    const events = await runDemo({
      adapterId: "manual",
      flags: DEFAULT_FLAGS_ENABLED,
      durationMs: 10,
      sleep: instantSleep,
    });

    expect(events.map((e) => e.eventType)).toEqual([
      "adapter_started",
      "session_started",
      "wait_state_started",
      "wait_state_ended",
      "banner_rendered",
      "banner_closed",
      "adapter_stopped",
    ]);
  });

  it("uses the same sessionId across the whole sequence", async () => {
    const events = await runDemo({
      adapterId: "manual",
      flags: DEFAULT_FLAGS_ENABLED,
      durationMs: 10,
      sleep: instantSleep,
    });
    const sessionIds = new Set(events.map((e) => e.sessionId));
    expect(sessionIds.size).toBe(1);
  });

  it("emits only kill_switch_active when disabled", async () => {
    const events = await runDemo({
      adapterId: "manual",
      flags: DEFAULT_FLAGS_DISABLED,
      durationMs: 10,
      sleep: instantSleep,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("kill_switch_active");
  });

  it("never produces a forbidden field across the whole sequence", async () => {
    const events = await runDemo({
      adapterId: "manual",
      flags: DEFAULT_FLAGS_ENABLED,
      durationMs: 10,
      sleep: instantSleep,
    });
    for (const event of events) {
      expect(findForbiddenFields(event)).toEqual([]);
    }
  });
});
