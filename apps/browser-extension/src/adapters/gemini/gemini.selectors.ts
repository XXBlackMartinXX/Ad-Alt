/**
 * Gemini (gemini.google.com) DOM selectors used by the wait-state detector.
 *
 * PRIVACY RULE: No selector reads text content, input values, response content,
 * or any user-derived data. Only structural presence/absence is detected.
 *
 * STABILITY RULE: All selectors use aria-label attributes where possible. If a
 * selector stops matching, detection fails closed — no sponsored moment shown.
 *
 * VERIFICATION STATUS: UNVERIFIED. The selector below is carried over from
 * the existing generic PROCESSING_SELECTORS map in
 * apps/browser-extension/src/content/wait-state-detector.ts (added as a
 * guess, never confirmed against real gemini.google.com). It has NOT been
 * tested against the real live platform. Per
 * docs/internal-beta/platforms/PLATFORM_ADAPTER_CONTRACT.md §3, this
 * platform stays at `experimental`/`beta` support status until a
 * human-operated real-session confirms this selector actually matches. See
 * docs/internal-beta/platforms/GEMINI_BROWSER_VERIFICATION.md.
 */

/**
 * Selectors that indicate "AI is generating" on Gemini.
 * Presence of any one of these = wait state is active.
 *
 * UNVERIFIED — see file header. Do not treat this as confirmed working.
 */
export const GEMINI_PROCESSING_SELECTORS = [
  "button[aria-label='Stop generating']",
] as const;

/**
 * Hostnames where the Gemini adapter should activate.
 * Only exact hostname matches are accepted — no subdomain wildcards.
 */
export const GEMINI_HOSTNAMES = ["gemini.google.com"] as const;

export type GeminiHostname = (typeof GEMINI_HOSTNAMES)[number];
