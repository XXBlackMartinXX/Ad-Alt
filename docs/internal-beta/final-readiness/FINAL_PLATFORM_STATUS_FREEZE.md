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
> `scripts/check-terminal-adapter.js`, and
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

- **Support label:** `experimental` (via the new generic lifecycle adapter) / `requires separate integration` (Claude-Code-specific, named support)
- **Evidence:** `packages/terminal-adapter` (`@ad-alt/terminal-adapter`, built this sprint) — a real, tool-agnostic, opt-in `wrap`/`demo` CLI; `wrap` mode spawns an arbitrary user-specified command with fully inherited stdio, observing only start/exit/duration. The older fixture-only prototype (`scripts/lib/terminal-fixture.js`) remains in place, unchanged, and passing.
- **Test coverage:** 35 unit tests (kill-switch, lifecycle schema, demo sequence, real-process `wrap` behavior including a real spawned child process, dedicated privacy suite)
- **Privacy status:** Sound — `check:terminal-adapter` statically confirms `stdio: 'inherit'` (never `'pipe'`), no `child.stdout`/`child.stderr` reads, no network I/O, and no forbidden field in any emitted event
- **Monetization status:** N/A — package never contacts any API, mock or real
- **Blocker:** No Claude-Code-specific hook/API found in this repo (re-confirmed this sprint); a human-operated session wrapping a real `claude` invocation is required before `beta`
- **Next action:** See `CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md`
- **Blocks controlled pilot:** **No**

## Claude Code desktop

- **Support label:** `requires separate integration`
- **Evidence:** None — no code exists; re-confirmed this sprint via `TERMINAL_DESKTOP_CODEX_DEEP_INTEGRATION_AUDIT.md` and `CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md`
- **Test coverage:** None
- **Privacy status:** N/A (nothing built); any future implementation must avoid screen-scraping/OCR/accessibility-tree text reading/clipboard monitoring (hard restrictions re-affirmed this sprint)
- **Monetization status:** N/A
- **Blocker:** No safe, confirmed integration point (extension/plugin API) is known to exist
- **Next action:** External product research only
- **Blocks controlled pilot:** **No**

## Codex CLI

- **Support label:** `experimental` (via the new generic lifecycle adapter) / `requires separate integration` (Codex-specific, named support)
- **Evidence:** Same tool-agnostic `packages/terminal-adapter` as Claude Code terminal, pointed at a `codex` binary instead — no Codex-specific code exists or is needed
- **Test coverage:** Same 35 tests (tool-agnostic by construction)
- **Privacy status:** Same as Claude Code terminal
- **Monetization status:** N/A
- **Blocker:** Same reasoning as Claude Code terminal (§ above)
- **Next action:** See `CODEX_CLI_IDE_INTEGRATION_DECISION.md`
- **Blocks controlled pilot:** **No**

## Codex IDE/editor

- **Support label:** `requires separate integration`
- **Evidence:** None — unresearched product surface (re-confirmed this sprint)
- **Test coverage:** None
- **Privacy status:** N/A
- **Monetization status:** N/A
- **Blocker:** Not confirmed what IDE(s), if any, Codex integrates with
- **Next action:** External product research only
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
