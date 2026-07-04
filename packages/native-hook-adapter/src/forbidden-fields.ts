/**
 * Denylist of field names that must never appear in a normalized event
 * or anywhere this package writes to disk/stdout. The normalizer itself
 * is allowlist-based (see normalizer.ts) -- this denylist is
 * defense-in-depth, used by tests to scan raw hostile fixtures and
 * confirm none of these ever survive normalization.
 *
 * Mirrors NATIVE_HOOK_PRIVACY_CONTRACT.md §2, which itself is a superset
 * of packages/terminal-adapter's FORBIDDEN_FIELDS.
 */
export const FORBIDDEN_FIELDS = [
  "prompt",
  "response",
  "command",
  "output",
  "stdout",
  "stderr",
  "filePath",
  "fileContent",
  "toolInput",
  "toolOutput",
  "tool_input",
  "tool_response",
  "chatHistory",
  "conversationId",
  "accountEmail",
  "token",
  "cookie",
  "secret",
  "clipboard",
  "screenshot",
  "trace",
  "promptText",
  "aiResponse",
  "commandText",
  "commandArgs",
  "terminalBuffer",
  "environmentVariables",
  "workingDirectory",
  "sessionCookie",
  "authToken",
  "sourceCode",
  "screenshotData",
  "videoData",
  "ocrText",
  "windowText",
  "paymentCredential",
  "input-messages",
  "last-assistant-message",
] as const;

/** Returns the list of forbidden field names present as JSON keys anywhere in the given value. */
export function findForbiddenFields(value: unknown): string[] {
  const json = JSON.stringify(value);
  if (json === undefined) return [];
  return FORBIDDEN_FIELDS.filter((f) => json.includes(`"${f}"`));
}
