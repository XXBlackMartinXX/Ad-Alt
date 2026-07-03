# Final Platform Status Freeze

**Phase:** Final Internal Pilot Release-Readiness Consolidation
**Date:** 2026-07-03

> This is the frozen, final label for every platform as of this sprint.
> "Frozen" means: do not change any label below without new evidence in
> this repo (a passing test suite, a completed human-verification result
> log, etc.) — never on request alone. Mechanically enforced by
> `scripts/check-platform-support-readiness.js`,
> `scripts/check-platform-certification.js`,
> `scripts/check-nonbrowser-platform-readiness.js`, and
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

- **Support label:** `fixture-only` (architecture prototype) / `requires separate integration` (real product)
- **Evidence:** `scripts/lib/terminal-fixture.js` — tool-agnostic, hardcoded synthetic timestamps/durations only, statically proven to never `require('child_process')`/`http`/`https`/`net`
- **Test coverage:** 14 unit tests (privacy + kill-switch), all against the prototype only
- **Privacy status:** Sound — the prototype has no real process/command/output access to violate privacy with
- **Monetization status:** N/A — prototype never contacts a real API
- **Blocker:** No real CLI wrapper exists; explicitly decided not to build one this sprint (unattempted stdio-passthrough engineering, no confirmed target tool — see `TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` §6)
- **Next action:** None scheduled
- **Blocks controlled pilot:** **No**

## Claude Code desktop

- **Support label:** `requires separate integration`
- **Evidence:** None — no code exists
- **Test coverage:** None
- **Privacy status:** N/A (nothing built); any future implementation must avoid screen-scraping/OCR/accessibility-tree text reading (see `DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md`)
- **Monetization status:** N/A
- **Blocker:** No safe, confirmed integration point (extension/plugin API) is known to exist
- **Next action:** External product research only
- **Blocks controlled pilot:** **No**

## Codex CLI

- **Support label:** `requires separate integration`
- **Evidence:** None — no code exists; covered generically by the same fixture-only prototype as Claude Code terminal, which never names or detects any specific tool
- **Test coverage:** None specific to Codex (the generic prototype's 14 tests apply equally)
- **Privacy status:** N/A
- **Monetization status:** N/A
- **Blocker:** Same reasoning as Claude Code terminal (§ above)
- **Next action:** None scheduled
- **Blocks controlled pilot:** **No**

## Codex IDE/editor

- **Support label:** `requires separate integration`
- **Evidence:** None — unresearched product surface
- **Test coverage:** None
- **Privacy status:** N/A
- **Monetization status:** N/A
- **Blocker:** Not confirmed what IDE(s), if any, Codex integrates with
- **Next action:** External product research only
- **Blocks controlled pilot:** **No**

## Generic terminal AI tools

- **Support label:** `fixture-only` (prototype) / `experimental` (product concept)
- **Evidence:** Same tool-agnostic prototype as Claude Code terminal
- **Test coverage:** Same 14 tests
- **Privacy status:** Sound, same reasoning as Claude Code terminal
- **Monetization status:** N/A
- **Blocker:** Same as Claude Code terminal
- **Next action:** None scheduled
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
