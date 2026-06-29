/**
 * Canonical adapter ID allowlist and related types.
 *
 * SOURCE OF TRUTH: This file is the canonical source for adapter IDs used
 * throughout the PromptProfit monorepo. Other packages that need adapter IDs
 * (platform-core, API routes, etc.) import from here.
 *
 * RULES:
 * - Every adapter that sends telemetry events MUST use an ID from this list.
 * - The API rejects events whose adapterName is not in ALLOWED_ADAPTER_IDS.
 * - "unknown_disabled" is a sentinel value — events bearing it are always rejected.
 * - Add new adapter IDs to the relevant group array below, not inline.
 */

/** VS Code extension adapters */
export const VSCODE_ADAPTER_IDS = [
  "ai_status_bar",  // Primary VS Code idle-detection adapter
  "copilot_status", // VS Code Copilot status bar adapter (planned)
] as const;

/** Browser extension adapters */
export const BROWSER_ADAPTER_IDS = [
  "browser_chatgpt", // ChatGPT.com — structural DOM wait-state detection
  "browser_claude",  // Claude.ai — structural DOM wait-state detection (planned)
  "browser_gemini",  // Gemini.google.com — structural DOM wait-state detection (planned)
  "browser_mock",    // Browser extension mock adapter for local testing
] as const;

/** Desktop application adapters (planned — not yet implemented) */
export const DESKTOP_ADAPTER_IDS = [
  "desktop_chatgpt", // ChatGPT desktop app
  "desktop_claude",  // Claude desktop app
  "antigravity",     // Antigravity AI
] as const;

/** Test/development adapters */
export const DEV_ADAPTER_IDS = [
  "mock",   // VS Code mock adapter (test-only)
  "manual", // Manual trigger (developer tooling only)
] as const;

/** Sentinel — events from this adapter are unconditionally rejected */
export const DISABLED_ADAPTER_ID = "unknown_disabled" as const;

/** All adapter IDs the API will accept (excludes the disabled sentinel) */
export const ALLOWED_ADAPTER_IDS = [
  ...VSCODE_ADAPTER_IDS,
  ...BROWSER_ADAPTER_IDS,
  ...DESKTOP_ADAPTER_IDS,
  ...DEV_ADAPTER_IDS,
] as const;

export type AllowedAdapterId = (typeof ALLOWED_ADAPTER_IDS)[number];
export type AdapterId = AllowedAdapterId | typeof DISABLED_ADAPTER_ID;

/** Broad platform category derived from adapter ID. */
export type PlatformCategory = "vscode" | "browser" | "desktop" | "dev" | "unknown";

/** Maps an adapter ID string to its broad platform category. */
export function getPlatformCategory(adapterId: string): PlatformCategory {
  if ((VSCODE_ADAPTER_IDS as readonly string[]).includes(adapterId)) return "vscode";
  if ((BROWSER_ADAPTER_IDS as readonly string[]).includes(adapterId)) return "browser";
  if ((DESKTOP_ADAPTER_IDS as readonly string[]).includes(adapterId)) return "desktop";
  if ((DEV_ADAPTER_IDS as readonly string[]).includes(adapterId)) return "dev";
  return "unknown";
}

/** Returns true iff the adapter ID is in the allowed list. */
export function isAllowedAdapter(adapterId: string): adapterId is AllowedAdapterId {
  return (ALLOWED_ADAPTER_IDS as readonly string[]).includes(adapterId);
}

/**
 * Mutable tuple of all allowed adapter IDs typed for direct use with z.enum().
 * Derived from ALLOWED_ADAPTER_IDS at module load — update that array, not this.
 */
export const ADAPTER_ENUM_VALUES = [...ALLOWED_ADAPTER_IDS] as [
  AllowedAdapterId,
  ...AllowedAdapterId[]
];
