# Final Platform Status Freeze

**Phase:** Final Internal Pilot Release-Readiness Consolidation
**Date:** 2026-07-03

> This is the frozen, final label for every platform as of this sprint.
> "Frozen" means: do not change any label below without new evidence in
> this repo (a passing test suite, a completed human-verification result
> log, etc.) — never on request alone. Mechanically enforced by
> `scripts/check-platform-support-readiness.js`,
> `scripts/check-platform-certification.js`,
> `scripts/check-nonbrowser-platform-readiness.js`,
> `scripts/check-terminal-adapter.js`,
> `scripts/check-native-hooks.js`,
> `scripts/check-claude-code-native-hooks.js`,
> `scripts/check-codex-native-hooks.js`,
> `scripts/check-native-hook-installation.js`, and
> `scripts/check-final-internal-pilot-readiness.js`.

---

## ChatGPT browser

- **Support label:** `verified`
- **Evidence:** `chatgpt.adapter.ts` + selectors/renderer/wait-state, wired live; real ledger writes confirmed end-to-end
- **Test coverage:** 42 unit tests + 27 e2e smoke tests
- **Privacy status:** Dedicated privacy test suite + `check:monetization:privacy` passing; no forbidden field ever observed in a captured event
- **Monetization status:** Full pipeline live — real ad-decision requests, real billable event writes, real ledger math
- **Blocker:** None
- **Next action:** Maintain; do not regress
- **Blocks controlled pilot:** **No** — this IS the controlled pilot's platform

## Claude browser

- **Support label:** `beta`
- **Evidence:** `claude.adapter.ts` + selectors/renderer/wait-state, wired live into `content/claude.ts`
- **Test coverage:** 25 unit + 15 privacy tests + 7 e2e smoke tests (`claude-adapter.smoke.spec.ts`)
- **Privacy status:** Dedicated privacy test suite + `check:monetization:privacy` passing
- **Monetization status:** Pipeline wired (identical API/ledger path to ChatGPT), kill-switch-capable — but not enabled for real users
- **Blocker:** No human-operated live session against real claude.ai (intentionally deferred, not attempted, not a technical failure)
- **Next action:** `pnpm -w run live:claude:no-login`, then `CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` if/when resumed
- **Blocks controlled pilot:** **No** — entirely out of this pilot's scope

## Gemini browser

- **Support label:** `beta`
- **Evidence:** `gemini.adapter.ts` + selectors/renderer/wait-state, wired live into `content/gemini.ts`
- **Test coverage:** 25 unit + 15 privacy tests + 7 e2e smoke tests (`gemini-adapter.smoke.spec.ts`)
- **Privacy status:** Dedicated privacy test suite + `check:monetization:privacy` passing
- **Monetization status:** Same as Claude — pipeline wired, not enabled for real users
- **Blocker:** Same as Claude — live session intentionally deferred
- **Next action:** `pnpm -w run live:gemini:no-login`, then `GEMINI_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` if/when resumed
- **Blocks controlled pilot:** **No**

## VS Code extension

- **Support label:** `beta`
- **Evidence:** `ai-status-bar.adapter.ts` (real idle-timer heuristic — never reads document/selection/terminal content); real `ApiClient`/`EventQueue`/`AdStatusBar`
- **Test coverage:** 82 unit tests (up from 34) via a hand-written `vscode` module test mock — activation, wait-state timing, status-bar rendering, API request shape, and kill-switch/disable behavior, including a real bug this coverage caught and fixed (a phantom timer that could render an ad after `disable()`)
- **Privacy status:** 26 dedicated privacy tests plus new privacy assertions inside the controller/adapter tests; sound-by-construction idle-timer design (reacts to event *firing*, never event *payload*)
- **Monetization status:** Real event queue + API client wired; not part of this pilot's scope
- **Blocker:** No real `@vscode/test-electron`-class e2e harness; no human-operated live session
- **Next action:** Build an e2e harness, then run `VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`
- **Blocks controlled pilot:** **No**

## Claude Code terminal

- **Support label:** `beta` (native official hooks, this sprint) — also reachable via `experimental` generic lifecycle adapter (prior sprint)
- **Evidence:** `scripts/claude-code-hook.js` + `packages/native-hook-adapter`, wired via Claude Code's own official `settings.json` `hooks` mechanism — confirmed via official docs (`code.claude.com/docs/en/hooks`) AND cross-validated against strings in the actual installed `@anthropic-ai/claude-code@2.1.42` binary on this machine (`hook_event_name`, `tool_input`, `tool_response`, `session_id`, `matcher`, `"hooks":`, `.claude/settings.json`, etc. all confirmed present). Also still reachable via `packages/terminal-adapter`'s generic `wrap`/`demo` modes (unchanged, prior sprint).
- **Test coverage:** 5 native-hook fixture tests (hostile `tool_input`/`tool_response`/prompt canaries, real child-process invocation of the actual script) + 76 shared-package (`native-hook-adapter`) unit tests + 35 generic-adapter tests (unchanged)
- **Privacy status:** Sound — `check:native-hooks`/`check:claude-code-native-hooks` confirm the allowlist normalizer discards all forbidden fields even under hostile payloads; the hook script always exits 0 and never emits any Claude-Code-recognized control field, so it cannot alter real session behavior
- **Monetization status:** N/A — fully offline, never contacts any API
- **Blocker:** Human-operated manual verification (`CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`) is required before `verified`
- **Next action:** See `CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md`
- **Blocks controlled pilot:** **No**

## Claude Code desktop

- **Support label:** `experimental` (revised this sprint, up from `requires separate integration`)
- **Evidence:** Official docs (`code.claude.com/docs/en/overview`) confirm Desktop shares the exact same underlying engine/settings/hooks as the CLI — no separate integration is architecturally required, and no OCR/scraping was ever the right model for this specific product. A credible, unofficial community bug report (not confirmed by Anthropic) describes hooks not firing in some Desktop modes on Windows — this keeps the label at `experimental` rather than `beta`.
- **Test coverage:** Same as Claude Code terminal (no Desktop-specific code was written — the same hook script and settings wiring apply)
- **Privacy status:** Same as Claude Code terminal
- **Monetization status:** N/A
- **Blocker:** A human confirming, via a real Desktop App installation, that the hook actually fires (addresses the documented firing-reliability gap)
- **Next action:** See `CLAUDE_CODE_DESKTOP_NATIVE_INTEGRATION_DECISION.md`
- **Blocks controlled pilot:** **No**

## Codex CLI

- **Support label:** `experimental` (native hooks via `scripts/codex-hook.js`, this sprint) — also reachable via `experimental` generic lifecycle adapter (prior sprint)
- **Evidence:** `scripts/codex-hook.js` + `packages/native-hook-adapter`, wired via Codex's own official `hooks.json`/`config.toml` `[hooks]` mechanism — confirmed via a **primary source** (`openai/codex`'s own `config.schema.json`, fetched live this sprint). `codex` is not installed on this machine, so the runtime hook-payload schema is inferred (from the config schema), not directly confirmed — this evidence gap is why this stays `experimental` rather than reaching `beta` like Claude Code.
- **Test coverage:** 5 native-hook fixture tests (including a `notify`-shaped `input-messages`/`last-assistant-message` hostile canary) + same 76 shared-package tests + same 35 generic-adapter tests
- **Privacy status:** Sound — same allowlist normalizer; deliberately does not wire Codex's separate `notify` mechanism, which is confirmed to carry real prompt/response content
- **Monetization status:** N/A
- **Blocker:** Human-operated manual verification with a real `codex` installation (resolves the runtime-schema evidence gap) — see `CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`
- **Next action:** See `CODEX_CLI_NATIVE_HOOK_INTEGRATION.md`
- **Blocks controlled pilot:** **No**

## Codex IDE/editor

- **Support label:** `experimental` (revised this sprint, up from `requires separate integration`)
- **Evidence:** Official-docs-corroborated research confirms the Codex IDE extension (VS Code/Cursor/Windsurf/JetBrains) uses the Codex CLI underneath and shares the same config/hooks/MCP layers — no separate bridge is architecturally required. The same `scripts/codex-hook.js --ide` flag tags events accordingly.
- **Test coverage:** Same as Codex CLI, plus an explicit `--ide` tagging test
- **Privacy status:** Same as Codex CLI
- **Monetization status:** N/A
- **Blocker:** Same evidence gap as Codex CLI, plus a human confirming hooks fire identically inside the IDE extension
- **Next action:** See `CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md`
- **Blocks controlled pilot:** **No**

## Generic terminal AI tools

- **Support label:** `experimental`
- **Evidence:** `packages/terminal-adapter` (`@ad-alt/terminal-adapter`) — real package, local JSON config, two-layer kill-switch, synthetic `demo` mode, real-process `wrap` mode
- **Test coverage:** 35 unit tests, including a dedicated privacy suite
- **Privacy status:** Sound, verified by `check:terminal-adapter`
- **Monetization status:** N/A — fully offline
- **Blocker:** Human-operated verification session against a real long-running CLI tool, to reach `beta`
- **Next action:** See `REAL_TERMINAL_ADAPTER_DESIGN.md` §13
- **Blocks controlled pilot:** **No**

---

## Summary

Only ChatGPT browser blocks (or rather, *is*) the controlled pilot.
Every other platform's status is explicitly **out of scope** for pilot
execution and is neither a blocker nor a dependency. No platform above
is claimed as more supported than its evidence justifies.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
