/**
 * Browser-extension privacy guard.
 *
 * Re-exports the shared privacy guard and adds browser-specific checks.
 * Called before any telemetry event is dispatched to ensure no private
 * data is included.
 *
 * PRIVACY RULE: Never transmit page title, page URL path/query, DOM text,
 * page content, clipboard content, screenshots, cookies, or auth tokens.
 */

export { findForbiddenFields, isPrivacySafe } from "@ad-alt/platform-core";

/**
 * Validates that a telemetry event contains only allowed fields.
 * Returns an error message if any forbidden field is present, null otherwise.
 */
export function validateBrowserEvent(event: Record<string, unknown>): string | null {
  const forbidden = [
    "pageTitle",
    "pageUrl",
    "pageContent",
    "domText",
    "clipboardContent",
    "screenshotData",
    "cookieData",
    "authToken",
    "sessionCookie",
    "referrer",
    "userAgent",
  ];

  for (const field of forbidden) {
    if (field in event) {
      return `Forbidden field in browser telemetry event: ${field}`;
    }
  }
  return null;
}
