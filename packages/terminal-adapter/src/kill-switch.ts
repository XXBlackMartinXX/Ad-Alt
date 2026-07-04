/**
 * Self-contained kill-switch logic. Deliberately does NOT import
 * @ad-alt/platform-core -- this package has zero runtime dependency on the
 * rest of the monorepo so it can be reasoned about, and audited, in
 * complete isolation. Semantics intentionally mirror
 * packages/platform-core/src/feature-flags.ts's isAdapterDisabled exactly.
 */
export interface TerminalAdapterFlags {
  killSwitchEnabled: boolean;
  disabledAdapters: string[];
  flags: Record<string, boolean>;
}

export const DEFAULT_FLAGS_DISABLED: TerminalAdapterFlags = {
  killSwitchEnabled: true,
  disabledAdapters: [],
  flags: {},
};

export const DEFAULT_FLAGS_ENABLED: TerminalAdapterFlags = {
  killSwitchEnabled: false,
  disabledAdapters: [],
  flags: {},
};

export function isAdapterDisabled(adapterId: string, flags: TerminalAdapterFlags): boolean {
  if (flags.killSwitchEnabled) return true;
  if (flags.disabledAdapters.includes(adapterId)) return true;
  if (flags.flags[`kill_switch_${adapterId}`] === true) return true;
  return false;
}
