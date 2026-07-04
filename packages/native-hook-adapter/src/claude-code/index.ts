/**
 * Claude Code-specific entry point. Thin wrapper around the shared
 * handler -- carries no Claude-Code-specific logic beyond the platform
 * tag and event-name allowlist already defined in ../types.ts.
 */
import { handleHookInvocation } from "../handler.js";
import type { NormalizedHookEvent } from "../types.js";

const ADAPTER_VERSION = "0.0.1";

export function handleClaudeCodeHook(rawText: string, repoCommit?: string): NormalizedHookEvent {
  return handleHookInvocation({
    platform: "claude_code",
    rawText,
    adapterVersion: ADAPTER_VERSION,
    ...(repoCommit !== undefined ? { repoCommit } : {}),
  });
}
