/**
 * Ties config + kill-switch + normalizer together. Platform-specific
 * entry points (claude-code/index.ts, codex/index.ts) are thin wrappers
 * around this shared function.
 */
import { loadConfig } from "./config.js";
import { isAdapterDisabled } from "./kill-switch.js";
import { normalizeHookEvent } from "./normalizer.js";
import type { NormalizedHookEvent, Platform } from "./types.js";

export interface HandleHookInvocationInput {
  platform: Platform;
  rawText: string;
  adapterVersion: string;
  repoCommit?: string;
  /** Overrides config-file dry-run for testability; otherwise inert. */
  forceDryRun?: boolean;
}

/**
 * Processes one raw hook invocation end to end: loads local config
 * (fail-closed if missing/unparsable), checks the two-layer kill-switch,
 * and normalizes the raw input into the fixed no-content event shape.
 * Never writes to disk or stdout itself -- the caller (a platform hook
 * script) decides what to do with the returned event.
 */
export function handleHookInvocation(input: HandleHookInvocationInput): NormalizedHookEvent {
  const config = loadConfig();
  const killSwitchActive = isAdapterDisabled(config.adapterId, config);
  const dryRun = input.forceDryRun ?? !config.enabled;

  return normalizeHookEvent({
    platform: input.platform,
    rawText: input.rawText,
    adapterVersion: input.adapterVersion,
    repoCommit: input.repoCommit ?? "unknown",
    killSwitchActive,
    dryRun,
  });
}
