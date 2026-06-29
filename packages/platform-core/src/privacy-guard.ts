/**
 * Privacy constants and guards for the PromptProfit adapter layer.
 *
 * These are the canonical definitions — shared by the VS Code extension,
 * browser extension, and API validation layer.
 *
 * IMPORTANT: Any new telemetry field must be checked against this list
 * before it is added to any event schema. If the field name or its value
 * could carry private user data, it must not be added.
 */

/**
 * Field names that must NEVER appear in any telemetry payload sent to the backend.
 * The privacy test suite in packages/shared/src/__tests__/telemetry-privacy.test.ts
 * asserts that none of these appear in any Zod schema.
 */
export const TELEMETRY_FORBIDDEN_FIELDS = [
  "sourceCode",
  "fileContent",
  "filePath",
  "fileName",
  "projectPath",
  "promptText",
  "aiResponse",
  "chatHistory",
  "terminalContent",
  "projectStructure",
  "workspacePath",
  "gitRemote",
  "envVariables",
  "apiKey",
  "secret",
  "password",
  "token",
  // Additional fields for browser/desktop adapters
  "pageTitle",
  "pageUrl",
  "pageContent",
  "domText",
  "clipboardContent",
  "screenshotData",
  "cookieData",
  "authToken",
  "sessionCookie",
] as const;

export type ForbiddenField = (typeof TELEMETRY_FORBIDDEN_FIELDS)[number];

/**
 * Checks whether an event object contains any forbidden field names.
 * This is a defense-in-depth check — primary enforcement is via closed Zod schemas.
 *
 * @returns Array of forbidden field names found (empty = clean).
 */
export function findForbiddenFields(event: Record<string, unknown>): ForbiddenField[] {
  return TELEMETRY_FORBIDDEN_FIELDS.filter((field) => field in event);
}

/**
 * Returns true iff the event contains no forbidden fields.
 */
export function isPrivacySafe(event: Record<string, unknown>): boolean {
  return findForbiddenFields(event).length === 0;
}
