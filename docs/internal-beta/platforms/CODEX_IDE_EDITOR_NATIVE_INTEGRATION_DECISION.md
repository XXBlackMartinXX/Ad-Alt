# Codex IDE/Editor — Native Integration Decision

**Phase:** Native Claude Code / Codex Integration Completion Sprint
**Date:** 2026-07-04

---

## Investigation summary

Three candidate integration paths were investigated per this sprint's
Phase 6 instructions:

1. **Official Codex IDE extension hooks/config** — investigated and
   confirmed to exist.
2. **VS Code extension APIs** (a bridge built by this repo, analogous to
   `apps/extension`'s `AiStatusBarAdapter`) — considered, but not needed
   (see below).
3. **Existing repo VS Code extension** (`apps/extension`) — reused only
   as a precedent for the "shared engine" reasoning, not as new code.
4. **Local lifecycle-only bridge** — not needed, for the same reason.

## Key finding

Per `NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md` §6 (evidence:
web-search-corroborated summaries of `developers.openai.com/codex/ide`
and `/codex/ide/settings`, cross-referenced across multiple independent
sources): **"The Codex IDE extension uses the Codex CLI"** underneath,
and **"The CLI and IDE extension share the same configuration layers"**
— including `~/.codex/config.toml`, the `[hooks]`/`hooks.json`
mechanism, and MCP server config. This means the Codex IDE extension is
**not** a separate hook surface requiring its own bridge — it is the
same engine, same config, same hooks, running inside VS Code/JetBrains
instead of a terminal window.

## Decision

**Outcome 1 from the mission's allowed list: beta via [a] bridge, if
implemented and tested safely — except no separate bridge was
implemented, because none is architecturally required.** The
integration built for Codex CLI in
`CODEX_CLI_NATIVE_HOOK_INTEGRATION.md` (`scripts/codex-hook.js`,
`packages/native-hook-adapter/src/codex/`) directly applies to the IDE
extension, using the exact same hooks config and the exact same script
— the only difference is the `--ide` flag, which tags emitted events
`codex_ide` instead of `codex_cli` for accurate labeling, purely
cosmetic to the event's `sourcePlatform` field.

**This is not "requires separate integration"** — that would misstate
the evidence. It is `experimental`, the same label and for the same
reasons as Codex CLI (§`CODEX_CLI_NATIVE_HOOK_INTEGRATION.md`): real
code, fixture tests pass, a dry-run installer exists, but no local IDE
extension is installed in this sandboxed environment to cross-validate,
and the exact runtime hook payload schema is inferred (from the config
schema) rather than confirmed from an accessible official source.

## Compliance with this sprint's implementation gate for an IDE bridge

The mission requires, if an IDE bridge is implemented: it must not read
file/code contents, must not read prompts/responses, must have tests,
must have explicit operator opt-in, must have a kill-switch, and must be
honestly labeled. Since no separate bridge was built (the CLI
integration is reused as-is), all of these are inherited directly:

- Does not read file/code contents: confirmed — the shared normalizer
  is allowlist-based (`NATIVE_HOOK_PRIVACY_CONTRACT.md`).
- Does not read prompts/responses: confirmed — same normalizer;
  `notify`'s content-bearing payload is explicitly not used (see
  `CODEX_CLI_NATIVE_HOOK_INTEGRATION.md`).
- Has tests: 5 fixture tests in `scripts/__tests__/codex-hook.test.js`,
  including a `--ide`-tagging test.
- Has explicit operator opt-in: the local config's `enabled` field
  defaults to `false`; the installer defaults to dry-run.
- Has a kill-switch: the same two-layer kill-switch as every other
  integration in this repo (`packages/native-hook-adapter/src/kill-switch.ts`).
- Honestly labeled: `experimental`, documented here and in
  `PLATFORM_SUPPORT_MATRIX.md`, never `beta` or `verified` without
  further evidence.

## What remains before `beta`

A human with the Codex IDE extension actually installed (in VS Code,
Cursor, Windsurf, or a JetBrains IDE) confirms, via the sanitized hook
log only, that a hook wired via the shared `~/.codex/config.toml` fires
identically whether Codex is invoked from the IDE extension or the bare
CLI. This is tracked as an explicit additional step in
`CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`, not a separate runbook,
since it is verifying the same integration in a second context, not a
different integration.

## Support label

**`experimental`** (via the same Codex CLI hooks integration, tagged
`codex_ide`). Not `requires separate integration` — no separate
integration is architecturally necessary, per the evidence above. Not
`beta`/`verified` — no human verification yet, in either the CLI or IDE
context.

---

**Privacy warning: Do not add real Codex prompt/response text, real
tool-call arguments or outputs, real file contents, real account data,
real API keys, or real payment credentials to this document.**
