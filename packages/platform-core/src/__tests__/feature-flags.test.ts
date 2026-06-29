import { describe, it, expect } from "vitest";
import {
  isAdapterDisabled,
  FALLBACK_FLAGS_DISABLED,
  DEFAULT_FLAGS_ENABLED,
  type FeatureFlags,
} from "../feature-flags.js";

describe("isAdapterDisabled", () => {
  it("returns false when kill switch off and adapter not disabled", () => {
    expect(isAdapterDisabled("ai_status_bar", DEFAULT_FLAGS_ENABLED)).toBe(false);
    expect(isAdapterDisabled("browser_chatgpt", DEFAULT_FLAGS_ENABLED)).toBe(false);
  });

  it("returns true when global kill switch is on", () => {
    const flags: FeatureFlags = { killSwitchEnabled: true, disabledAdapters: [], flags: {} };
    expect(isAdapterDisabled("ai_status_bar", flags)).toBe(true);
    expect(isAdapterDisabled("browser_chatgpt", flags)).toBe(true);
  });

  it("returns true when adapter is in the disabledAdapters list", () => {
    const flags: FeatureFlags = {
      killSwitchEnabled: false,
      disabledAdapters: ["browser_chatgpt"],
      flags: {},
    };
    expect(isAdapterDisabled("browser_chatgpt", flags)).toBe(true);
    expect(isAdapterDisabled("browser_claude", flags)).toBe(false);
    expect(isAdapterDisabled("ai_status_bar", flags)).toBe(false);
  });

  it("returns true when kill_switch_{adapterId} flag is true", () => {
    const flags: FeatureFlags = {
      killSwitchEnabled: false,
      disabledAdapters: [],
      flags: { kill_switch_browser_claude: true },
    };
    expect(isAdapterDisabled("browser_claude", flags)).toBe(true);
    expect(isAdapterDisabled("browser_chatgpt", flags)).toBe(false);
  });

  it("FALLBACK_FLAGS_DISABLED kills all adapters (fail-closed behaviour)", () => {
    expect(isAdapterDisabled("ai_status_bar", FALLBACK_FLAGS_DISABLED)).toBe(true);
    expect(isAdapterDisabled("browser_chatgpt", FALLBACK_FLAGS_DISABLED)).toBe(true);
    expect(isAdapterDisabled("mock", FALLBACK_FLAGS_DISABLED)).toBe(true);
  });
});
