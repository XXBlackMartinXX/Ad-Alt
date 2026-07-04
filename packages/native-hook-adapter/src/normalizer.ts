/**
 * The core no-content normalizer. This is an ALLOWLIST, not a denylist:
 * it extracts only the ten fields in NormalizedHookEvent and never
 * copies any other key from the raw input, regardless of what the raw
 * input contains. This makes it safe even against hook payload fields
 * this package's authors did not anticipate.
 *
 * Raw hook input is parsed by the caller (parseRawHookInput below) and
 * passed in already-parsed (or null, on parse failure). This function
 * never writes anything to disk or stdout itself -- callers (the
 * platform-specific scripts) decide what to do with the returned
 * NormalizedHookEvent.
 */
import {
  CLAUDE_CODE_HOOK_EVENTS,
  CODEX_HOOK_EVENTS,
  type NormalizedHookEvent,
  type Platform,
} from "./types.js";

const UNRECOGNIZED_EVENT = "unrecognized_event";

/** Parses raw JSON text into a plain object, or null on any parse failure. Never throws. */
export function parseRawHookInput(rawText: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function knownEventNamesFor(platform: Platform): readonly string[] {
  if (platform === "claude_code") return CLAUDE_CODE_HOOK_EVENTS;
  if (platform === "codex_cli" || platform === "codex_ide") return CODEX_HOOK_EVENTS;
  return [];
}

/**
 * Extracts only hook_event_name (or hookEventName) from raw input, and
 * only if it is one of the platform's own documented event names --
 * otherwise returns the fixed "unrecognized_event" sentinel. This is
 * the ONLY field ever read from the raw payload; every other raw key
 * (tool_input, tool_response, prompt text, command text, file content,
 * etc.) is never inspected, copied, or referenced anywhere in this
 * function.
 */
function extractHookEventType(raw: Record<string, unknown> | null, platform: Platform): string {
  if (!raw) return UNRECOGNIZED_EVENT;
  const candidate = raw.hook_event_name ?? raw.hookEventName;
  if (typeof candidate !== "string") return UNRECOGNIZED_EVENT;
  const known = knownEventNamesFor(platform);
  return known.includes(candidate) ? candidate : UNRECOGNIZED_EVENT;
}

export interface NormalizeInput {
  platform: Platform;
  rawText: string;
  adapterVersion: string;
  repoCommit: string;
  killSwitchActive: boolean;
  dryRun: boolean;
}

/** Normalizes one raw hook invocation into the fixed, ten-field, no-content event shape. */
export function normalizeHookEvent(input: NormalizeInput): NormalizedHookEvent {
  const raw = parseRawHookInput(input.rawText);
  const parseFailed = raw === null;

  const base: NormalizedHookEvent = {
    sourcePlatform: input.platform,
    integrationType: "native_hook",
    hookEventType: extractHookEventType(raw, input.platform),
    hookReceivedAt: new Date().toISOString(),
    adapterVersion: input.adapterVersion,
    repoCommit: input.repoCommit,
    killSwitchActive: input.killSwitchActive,
    dryRun: input.dryRun,
    sanitizedResult: "ok",
  };

  if (input.killSwitchActive) {
    return { ...base, sanitizedResult: "kill_switch_active" };
  }
  if (parseFailed) {
    return { ...base, sanitizedResult: "error", errorCodeSafeOnly: "parse_error" };
  }
  if (base.hookEventType === UNRECOGNIZED_EVENT) {
    return { ...base, sanitizedResult: "error", errorCodeSafeOnly: "unrecognized_event" };
  }
  return base;
}
