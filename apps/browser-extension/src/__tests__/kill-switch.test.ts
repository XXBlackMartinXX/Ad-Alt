import { describe, it, expect } from "vitest";
import { isAdapterDisabled, FALLBACK_FLAGS_DISABLED, DEFAULT_FLAGS_ENABLED } from "@ad-alt/platform-core";
import type { FeatureFlags } from "@ad-alt/platform-core";

describe("kill-switch enforcement in browser extension", () => {
  it("disables all adapters when killSwitchEnabled is true", () => {
    expect(isAdapterDisabled("browser_chatgpt", FALLBACK_FLAGS_DISABLED)).toBe(true);
    expect(isAdapterDisabled("browser_claude", FALLBACK_FLAGS_DISABLED)).toBe(true);
    expect(isAdapterDisabled("browser_gemini", FALLBACK_FLAGS_DISABLED)).toBe(true);
  });

  it("allows all adapters when no flags are set", () => {
    expect(isAdapterDisabled("browser_chatgpt", DEFAULT_FLAGS_ENABLED)).toBe(false);
    expect(isAdapterDisabled("browser_claude", DEFAULT_FLAGS_ENABLED)).toBe(false);
  });

  it("disables a specific adapter via disabledAdapters list", () => {
    const flags: FeatureFlags = {
      killSwitchEnabled: false,
      disabledAdapters: ["browser_chatgpt"],
      flags: {},
    };
    expect(isAdapterDisabled("browser_chatgpt", flags)).toBe(true);
    expect(isAdapterDisabled("browser_claude", flags)).toBe(false);
  });

  it("disables an adapter via kill_switch_{name} flag", () => {
    const flags: FeatureFlags = {
      killSwitchEnabled: false,
      disabledAdapters: [],
      flags: { kill_switch_browser_gemini: true },
    };
    expect(isAdapterDisabled("browser_gemini", flags)).toBe(true);
    expect(isAdapterDisabled("browser_claude", flags)).toBe(false);
  });

  it("FALLBACK_FLAGS_DISABLED is fail-closed (all adapters disabled)", () => {
    expect(FALLBACK_FLAGS_DISABLED.killSwitchEnabled).toBe(true);
  });

  it("DEFAULT_FLAGS_ENABLED is fail-open (no adapters disabled)", () => {
    expect(DEFAULT_FLAGS_ENABLED.killSwitchEnabled).toBe(false);
    expect(DEFAULT_FLAGS_ENABLED.disabledAdapters).toHaveLength(0);
  });
});
