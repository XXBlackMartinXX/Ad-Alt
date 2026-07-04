import crypto from "node:crypto";

/**
 * The complete, closed set of lifecycle-only event types this adapter may
 * ever emit. No other string is a valid eventType. Adding a new value here
 * requires a privacy review -- it is not a place to casually extend.
 */
export const LIFECYCLE_EVENT_TYPES = [
  "adapter_started",
  "adapter_stopped",
  "session_started",
  "wait_state_started",
  "wait_state_ended",
  "banner_rendered",
  "banner_closed",
  "kill_switch_active",
  "error_safe_code_only",
] as const;

export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number];

/**
 * Fixed, closed enum of safe error codes. Never a free-text error message --
 * a raw message could echo back fragments of a command line or path.
 */
export const SAFE_ERROR_CODES = [
  "spawn_enoent",
  "spawn_eacces",
  "config_unreadable",
  "unknown_safe_error",
] as const;

export type SafeErrorCode = (typeof SAFE_ERROR_CODES)[number];

export interface LifecycleEvent {
  eventType: LifecycleEventType;
  adapterId: string;
  timestamp: string;
  sessionId: string;
  durationMs?: number;
  exitCode?: number;
  errorCode?: SafeErrorCode;
}

/**
 * Every field name that must never appear as a JSON key in any event this
 * package produces or logs. Mirrors scripts/lib/terminal-fixture.js's
 * FORBIDDEN_FIELDS plus the full non-negotiable privacy list for this
 * sprint (terminal command text, terminal output text, prompt/response
 * text, file/working-directory contents, clipboard, screenshots, etc.).
 */
export const FORBIDDEN_FIELDS = [
  "commandText",
  "commandArgs",
  "stdout",
  "stderr",
  "terminalBuffer",
  "promptText",
  "aiResponse",
  "responseText",
  "chatHistory",
  "conversationId",
  "pageUrl",
  "pageTitle",
  "domText",
  "cookies",
  "authToken",
  "sessionCookie",
  "clipboardContent",
  "screenshotData",
  "videoData",
  "traceData",
  "ocrText",
  "sourceCode",
  "fileContent",
  "environmentVariables",
  "workingDirectory",
  "shellHistory",
  "windowText",
  "accountId",
  "paymentCredential",
] as const;

const ALLOWED_KEYS = new Set([
  "eventType",
  "adapterId",
  "timestamp",
  "sessionId",
  "durationMs",
  "exitCode",
  "errorCode",
]);

/**
 * Returns the list of forbidden field names present as JSON keys anywhere
 * in the given event (empty array = clean). Also flags any key not in the
 * explicit allow-list above, so a future accidental field addition fails
 * loudly rather than silently passing because it wasn't yet on the
 * forbidden list.
 */
export function findForbiddenFields(event: unknown): string[] {
  const json = JSON.stringify(event);
  const forbiddenHits = FORBIDDEN_FIELDS.filter((f) => json.includes(`"${f}"`));
  const unexpectedKeys =
    event && typeof event === "object"
      ? Object.keys(event as Record<string, unknown>).filter((k) => !ALLOWED_KEYS.has(k))
      : [];
  return [...new Set([...forbiddenHits, ...unexpectedKeys])];
}

/** Throws if the event contains any forbidden or unexpected field. */
export function assertNoForbiddenFields(event: unknown): void {
  const hits = findForbiddenFields(event);
  if (hits.length > 0) {
    throw new Error(`terminal-adapter: refusing to emit unsafe event fields: ${hits.join(", ")}`);
  }
}

export interface BuildEventInput {
  eventType: LifecycleEventType;
  adapterId: string;
  sessionId: string;
  durationMs?: number;
  exitCode?: number;
  errorCode?: SafeErrorCode;
}

/** Builds and validates a lifecycle event. Always privacy-checked before return. */
export function buildLifecycleEvent(input: BuildEventInput): LifecycleEvent {
  const event: LifecycleEvent = {
    eventType: input.eventType,
    adapterId: input.adapterId,
    timestamp: new Date().toISOString(),
    sessionId: input.sessionId,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
    ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
  };
  assertNoForbiddenFields(event);
  return event;
}

/** Generates a new random session ID, unrelated to any real AI session ID. */
export function newSessionId(): string {
  return crypto.randomUUID();
}
