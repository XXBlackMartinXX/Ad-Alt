/**
 * Self-contained kill-switch logic. Deliberately does NOT import
 * @ad-alt/platform-core or @ad-alt/terminal-adapter -- this package has
 * zero runtime dependency on the rest of the monorepo so it can be
 * reasoned about, and audited, in complete isolation. Semantics
 * intentionally mirror packages/terminal-adapter/src/kill-switch.ts
 * exactly.
 */
import type { NativeHookFlags } from "./types.js";

export const DEFAULT_FLAGS_DISABLED: NativeHookFlags = {
  killSwitchEnabled: true,
  disabledAdapters: [],
  flags: {},
};

export const DEFAULT_FLAGS_ENABLED: NativeHookFlags = {
  killSwitchEnabled: false,
  disabledAdapters: [],
  flags: {},
};

export function isAdapterDisabled(adapterId: string, flags: NativeHookFlags): boolean {
  if (flags.killSwitchEnabled) return true;
  if (flags.disabledAdapters.includes(adapterId)) return true;
  if (flags.flags[`kill_switch_${adapterId}`] === true) return true;
  return false;
}
