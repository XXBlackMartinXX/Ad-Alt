import type { AllowedAdapterId } from "./adapter-ids.js";

/**
 * Feature flags contract returned by the /v1/flags endpoint.
 *
 * Adapters must poll this on startup and before each wait-state to
 * check whether they are kill-switched. Adapters must fail closed
 * (no ads shown) if they cannot reach the flags endpoint.
 */
export interface FeatureFlags {
  /** Global kill switch — when true, ALL adapters on ALL platforms suppress ads. */
  killSwitchEnabled: boolean;
  /**
   * List of adapter IDs that are currently disabled.
   * Any adapter whose ID appears here must not show ads.
   */
  disabledAdapters: string[];
  /** Raw flag map for forward-compatible flag access. */
  flags: Record<string, boolean>;
}

/**
 * Returns true iff an adapter should suppress ads given the current flags.
 * Adapters MUST call this before rendering any sponsored moment.
 */
export function isAdapterDisabled(
  adapterId: AllowedAdapterId,
  flags: FeatureFlags,
): boolean {
  if (flags.killSwitchEnabled) return true;
  if (flags.disabledAdapters.includes(adapterId)) return true;
  // Check the kill_switch_{adapterId} flag by name
  if (flags.flags[`kill_switch_${adapterId}`] === true) return true;
  return false;
}

/** Fallback flags returned when the flags endpoint is unreachable. Fails closed. */
export const FALLBACK_FLAGS_DISABLED: FeatureFlags = {
  killSwitchEnabled: true,
  disabledAdapters: [],
  flags: {},
};

/** Default flags used in tests (ads enabled, nothing disabled). */
export const DEFAULT_FLAGS_ENABLED: FeatureFlags = {
  killSwitchEnabled: false,
  disabledAdapters: [],
  flags: {},
};
