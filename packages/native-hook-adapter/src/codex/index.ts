/**
 * Codex-specific entry point. Thin wrapper around the shared handler --
 * carries no Codex-specific logic beyond the platform tag and
 * event-name allowlist already defined in ../types.ts. Accepts an
 * explicit `ide` flag so the same code path serves both Codex CLI and
 * the Codex IDE extension, since both share the same underlying config/
 * hooks engine (see NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md §6).
 */
import { handleHookInvocation } from "../handler.js";
import type { NormalizedHookEvent } from "../types.js";

const ADAPTER_VERSION = "0.0.1";

export function handleCodexHook(
  rawText: string,
  options?: { ide?: boolean; repoCommit?: string },
): NormalizedHookEvent {
  return handleHookInvocation({
    platform: options?.ide ? "codex_ide" : "codex_cli",
    rawText,
    adapterVersion: ADAPTER_VERSION,
    ...(options?.repoCommit !== undefined ? { repoCommit: options.repoCommit } : {}),
  });
}
