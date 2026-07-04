# Claude Code Native Hook Integration

**Phase:** Native Claude Code / Codex Integration Completion Sprint
**Date:** 2026-07-04

---

## What was implemented

- `packages/native-hook-adapter` (shared core, tool-agnostic where
  possible; see `NATIVE_HOOK_PRIVACY_CONTRACT.md`).
- `scripts/claude-code-hook.js` — the actual `command`-type hook script
  a user wires into a Claude Code `settings.json`. Reads stdin, calls
  `handleClaudeCodeHook()` from the shared package, prints only the
  sanitized event to stdout (and, optionally, appends it to a `--log`
  file), and **always exits 0**.
- `docs/internal-beta/platforms/examples/claude-code-hooks.example.json` —
  a real, schema-valid example wiring `SessionStart`, `Stop`, and
  `SessionEnd` to the script.
- `scripts/__tests__/claude-code-hook.test.js` — 5 fixture tests,
  including hostile payloads (fake `tool_input`/`tool_response`/prompt/
  private-path content), run as real child processes against the real
  script (not a mock), asserting the sanitized stdout/log never contains
  the injected content.

## Whether real integration was implemented

**Yes**, in the sense the mission asks for: this uses Claude Code's own,
official, documented hook mechanism (confirmed via
`code.claude.com/docs/en/hooks` and cross-validated against strings in
the actual installed `@anthropic-ai/claude-code@2.1.42` binary on this
machine — see `NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md` §1) — not
a generic process-lifecycle heuristic. The hook script is real, tested
code that produces a real, schema-compliant (from Claude Code's side)
sanitized event.

## Whether it is generic lifecycle-only or Claude-Code-specific

Both, deliberately: the **shared normalizer** in
`packages/native-hook-adapter` is generic (an allowlist that works
regardless of which platform's raw JSON it receives). The **event-name
allowlist** it validates against (`CLAUDE_CODE_HOOK_EVENTS`) and the
**hook script itself** (`scripts/claude-code-hook.js`) are
Claude-Code-specific, because they encode Claude Code's own documented
event vocabulary and are wired via Claude Code's own settings.json
schema — there is no way to be "generic" about which events a specific
tool's hook system exposes.

## Whether it integrates with actual Claude Code hooks

**Yes.** It is wired via the real `hooks` key in a Claude Code
`settings.json` file (`.claude/settings.json` /
`.claude/settings.local.json` / `~/.claude/settings.json`), using the
real `command` handler type, the real `${CLAUDE_PROJECT_DIR}` path
placeholder, and the real per-event array-of-`{matcher, hooks}` schema —
all confirmed from the official docs (§1 of the audit doc), not
invented.

## What remains before `beta` (already reached) or `verified`

This sprint reaches `beta` for Claude Code terminal/CLI native hooks
(see label rules in the mission and
`CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md`'s update): real hook
integration exists, fixture tests pass (5/5, including hostile-content
canaries), and a dry-run installer exists (`scripts/install-claude-code-hooks.js`,
Phase 8). `verified` requires a human to actually wire the example
config into a **disposable test project** (never their real global
`~/.claude/settings.json` without deliberately choosing to), run
`claude` normally, and confirm — using only the sanitized hook output/log,
never raw transcript inspection — that the hook fired as expected. See
`CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`.

## Privacy review

- The hook script never reads any file except stdin, its own optional
  `--log` target, and (via the shared package) its own config file.
- It never spawns a child process, never makes a network request, and
  never invokes `git` or any other external tool.
- Every hostile-payload fixture test (5/5) confirms injected
  `tool_input`/`tool_response`/prompt/path content never appears in the
  script's stdout or log file.
- On any internal failure (package not built, unexpected exception),
  the script falls back to a fixed, safe, no-content error event rather
  than crashing or leaking a stack trace that might reference file
  paths.
- The script always exits 0 and never emits any of Claude Code's own
  recognized hook-control fields (`decision`, `hookSpecificOutput`,
  `continue`, `stopReason`, `suppressOutput`, `systemMessage`,
  `terminalSequence`) — it cannot block, redirect, or otherwise alter a
  real Claude Code session's behavior, satisfying requirement 8 of this
  sprint's Phase 4 (a deliberate design choice, not an accidental
  omission).

## Install instructions (summary — see `scripts/install-claude-code-hooks.js` and its runbook for the full flow)

1. Build the shared package once: `pnpm --filter @ad-alt/native-hook-adapter build`.
2. Run `pnpm -w run install:claude-code-hooks:dry-run` to see exactly
   what would be written and where, without writing anything.
3. Only if you want to actually enable it, re-run with `--write`
   pointed at a **disposable test project's** `.claude/settings.local.json`
   — never the installer's default target is your real global config;
   you must explicitly choose a path.
4. To remove: delete the `hooks` entries the installer added (it prints
   a diff-shaped summary and creates a `.bak` backup of the file it
   modified, so reverting is a simple restore).

This integration is never auto-installed into `~/.claude` or any real
project config by anything in this sprint — the installer defaults to
dry-run and requires an explicit `--write` flag pointed at a path the
operator chooses.

## Support label

**`beta`** for the generic Claude Code CLI/terminal hook integration.
Not `verified` — no human manual-verification result exists yet.

---

**Privacy warning: Do not add real Claude Code prompt/response text,
real tool-call arguments or outputs, real file contents, real account
data, real API keys, or real payment credentials to this document.**
