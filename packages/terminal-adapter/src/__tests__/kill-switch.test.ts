import { describe, expect, it } from "vitest";
import { isAdapterDisabled, DEFAULT_FLAGS_ENABLED, DEFAULT_FLAGS_DISABLED } from "../kill-switch.js";

describe("isAdapterDisabled", () => {
  it("is not disabled when all flags are clear", () => {
    expect(isAdapterDisabled("manual", DEFAULT_FLAGS_ENABLED)).toBe(false);
  });

  it("is disabled when the global kill switch is enabled", () => {
    expect(isAdapterDisabled("manual", DEFAULT_FLAGS_DISABLED)).toBe(true);
  });

  it("is disabled when the adapter is in disabledAdapters", () => {
    expect(
      isAdapterDisabled("manual", {
        killSwitchEnabled: false,
        disabledAdapters: ["manual"],
        flags: {},
      }),
    ).toBe(true);
  });

  it("is disabled when the per-adapter kill_switch_<id> flag is true", () => {
    expect(
      isAdapterDisabled("manual", {
        killSwitchEnabled: false,
        disabledAdapters: [],
        flags: { kill_switch_manual: true },
      }),
    ).toBe(true);
  });

  it("is not disabled by an unrelated adapter's per-adapter flag", () => {
    expect(
      isAdapterDisabled("manual", {
        killSwitchEnabled: false,
        disabledAdapters: ["other_adapter"],
        flags: { kill_switch_other_adapter: true },
      }),
    ).toBe(false);
  });
});
