/** Which native tool's hook fired. */
export const PLATFORMS = ["claude_code", "codex_cli", "codex_ide", "unknown"] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * Every Claude Code hook event name, per the official docs
 * (https://code.claude.com/docs/en/hooks) and cross-confirmed against
 * strings present in the installed @anthropic-ai/claude-code@2.1.42
 * binary on this machine. See NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md
 * for the evidence trail.
 */
export const CLAUDE_CODE_HOOK_EVENTS = [
  "SessionStart", "Setup", "UserPromptSubmit", "UserPromptExpansion",
  "PreToolUse", "PermissionRequest", "PermissionDenied", "PostToolUse",
  "PostToolUseFailure", "PostToolBatch", "Notification", "MessageDisplay",
  "SubagentStart", "SubagentStop", "TaskCreated", "TaskCompleted", "Stop",
  "StopFailure", "TeammateIdle", "InstructionsLoaded", "ConfigChange",
  "CwdChanged", "FileChanged", "WorktreeCreate", "WorktreeRemove",
  "PreCompact", "PostCompact", "Elicitation", "ElicitationResult", "SessionEnd",
] as const;
export type ClaudeCodeHookEvent = (typeof CLAUDE_CODE_HOOK_EVENTS)[number];

/**
 * Every Codex hook event name confirmed in the primary-source
 * codex-rs/core/config.schema.json (openai/codex repo). See
 * NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md §4.
 */
export const CODEX_HOOK_EVENTS = [
  "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PreCompact", "PostCompact", "PermissionRequest", "SubagentStart",
  "SubagentStop", "Stop",
] as const;
export type CodexHookEvent = (typeof CODEX_HOOK_EVENTS)[number];

export const SANITIZED_RESULTS = ["ok", "kill_switch_active", "error"] as const;
export type SanitizedResult = (typeof SANITIZED_RESULTS)[number];

export const SAFE_ERROR_CODES = [
  "parse_error", "unrecognized_event", "config_unreadable", "unknown_safe_error",
] as const;
export type SafeErrorCode = (typeof SAFE_ERROR_CODES)[number];

/**
 * The ONLY shape a normalized event may ever take. Exactly these ten
 * fields -- see NATIVE_HOOK_PRIVACY_CONTRACT.md §1. TypeScript's
 * excess-property checking on object literals rejects any additional
 * field at every construction call site.
 */
export interface NormalizedHookEvent {
  sourcePlatform: Platform;
  integrationType: "native_hook";
  hookEventType: string;
  hookReceivedAt: string;
  adapterVersion: string;
  repoCommit: string;
  killSwitchActive: boolean;
  dryRun: boolean;
  sanitizedResult: SanitizedResult;
  errorCodeSafeOnly?: SafeErrorCode;
}

/** Two-layer kill-switch flags, self-contained (mirrors packages/terminal-adapter). */
export interface NativeHookFlags {
  killSwitchEnabled: boolean;
  disabledAdapters: string[];
  flags: Record<string, boolean>;
}
