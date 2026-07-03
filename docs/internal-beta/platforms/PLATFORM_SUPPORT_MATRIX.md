# PromptProfit — Platform Support Matrix

**Phase:** Complete Multi-Platform Support Before Pilot Execution
**Date:** 2026-07-03

> Machine-checkable summary. `scripts/check-platform-support-readiness.js`
> (`check:platforms`) verifies ChatGPT remains `verified` and that no
> other platform is mislabeled `verified` without evidence.
> `scripts/check-platform-certification.js` (`check:platform-certification`)
> additionally verifies that Claude/Gemini have real smoke+privacy test
> evidence behind their `beta` label, that desktop/terminal/Codex are
> correctly NOT claimed as tested/verified, and that no doc in this
> directory overclaims support.
> `scripts/check-platform-live-readiness.js` (`check:platform-live-readiness`)
> tracks the separate no-login-smoke / assisted-manual-session evidence
> trail for Claude and Gemini specifically — see
> `LIVE_VERIFICATION_SAFETY_POLICY.md` for the full workflow. Its current
> result is `HOLD`: the workflow is ready, no human evidence has been
> recorded yet.
> `scripts/check-vscode-extension-readiness.js` (`check:vscode-extension`)
> and `scripts/check-nonbrowser-platform-readiness.js`
> (`check:nonbrowser-platforms`) cover VS Code and the terminal/Claude
> Code/Codex surfaces — see `VSCODE_EXTENSION_DEEP_VERIFICATION.md` and
> `TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md`.

| Platform | Surface type | Support status | Adapter exists | Tests exist | Privacy reviewed | Monetization ready | Kill-switch capable | Launch priority | Blocks revenue pilot? | Next action |
|----------|---------------|------------------|-----------------|--------------|---------------------|-----------------------|--------------------------|--------------------|--------------------------|--------------|
| ChatGPT browser | Browser extension (MV3) | **verified** | Yes — `chatgpt.adapter.ts` + selectors/renderer/wait-state | Yes — 42 unit tests + 27 e2e smoke tests | Yes — dedicated privacy test suite + `check:monetization:privacy` | Yes — full pipeline, real ledger writes confirmed | Yes — server-side (event-processor.ts) + client-side (`syncFlagsFromBackend`), both confirmed | 1 (current revenue platform) | **No** | None — maintain |
| Claude browser | Browser extension (MV3) | **beta** — live-wired / fixture-tested / live verification pending | Yes — `claude.adapter.ts` + selectors/renderer/wait-state, wired live into `content/claude.ts` | Yes — 25 unit + 15 privacy tests + 7 e2e smoke tests (`claude-adapter.smoke.spec.ts`) | Yes — dedicated privacy test suite + `check:monetization:privacy` passing | Pipeline wired (same API/ledger path as ChatGPT); disabled for real users pending live-session confirmation | Yes — same two-layer kill-switch as ChatGPT, unit + e2e tested | 2 | No | Live verification intentionally deferred this sprint (user decision) — when resumed: `pnpm -w run live:claude:no-login`, then `CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` if needed |
| Gemini browser | Browser extension (MV3) | **beta** — live-wired / fixture-tested / live verification pending | Yes — `gemini.adapter.ts` + selectors/renderer/wait-state, wired live into `content/gemini.ts` | Yes — 25 unit + 15 privacy tests + 7 e2e smoke tests (`gemini-adapter.smoke.spec.ts`) | Yes — dedicated privacy test suite + `check:monetization:privacy` passing | Pipeline wired (same API/ledger path as ChatGPT); disabled for real users pending live-session confirmation | Yes — same two-layer kill-switch as ChatGPT, unit + e2e tested | 3 | No | Live verification intentionally deferred this sprint (user decision) — when resumed: `pnpm -w run live:gemini:no-login`, then `GEMINI_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` if needed |
| VS Code extension | Native extension | **beta** | Yes — `ai-status-bar.adapter.ts` (real idle-timer heuristic, not a stub) | Yes — 82 unit tests (up from 34 this sprint: adds `ai-status-bar.adapter`, `mock.adapter`, `status-bar`, `api-client`, and `controller` coverage via a hand-written `vscode` module mock); no e2e host-level harness | Yes — 26 dedicated privacy tests plus new privacy assertions inside the controller/adapter tests; no live-session record | Yes — real event queue + API client wired | Yes — flag-cache polling wired; this sprint also fixed a real bug where disabling the extension mid-wait-state could leave a phantom timer that rendered an ad anyway (see `VSCODE_EXTENSION_DEEP_VERIFICATION.md`) | 4 | No | Add `@vscode/test-electron` e2e harness, then a human-operated live session (`VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`) — see `VSCODE_EXTENSION_DEEP_VERIFICATION.md` |
| Claude Code terminal | CLI/terminal | **fixture-only** (prototype) / **requires separate integration** (real product) | No real adapter; a tool-agnostic fixture-only prototype exists (`scripts/lib/terminal-fixture.js`) | Yes, for the prototype only — 14 unit tests (privacy + kill-switch) | Yes, for the prototype only | No — prototype never contacts a real API | N/A for the prototype (kill-switch logic tested in isolation) | 5 | No | Build a real CLI wrapper — see `CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md` |
| Codex (CLI/terminal) | CLI/terminal | **requires separate integration** | No | No | No | No | No | 5 | No | Research complete; no safe implementation attempted this sprint — see `CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md` |
| Codex (IDE/editor) | Unknown (unresearched product surface) | **requires separate integration** | No | No | No | No | No | 5 | No | External product research needed before any code — see `CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md` |
| Claude Code desktop | Desktop app | **requires separate integration** | No | No | No | No | No | 6 | No | No safe integration point known; screen-scraping/OCR explicitly forbidden — see `CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md` |
| Generic terminal AI tools | CLI/terminal | **fixture-only** (prototype) / **experimental** (product concept) | No real adapter; covered by the same tool-agnostic fixture-only prototype as Claude Code terminal | Yes, for the prototype only — same 14 unit tests | Yes, for the prototype only | No | N/A for the prototype | 6 | No | Same as Claude Code terminal |
| `browser_mock` | Test fixture (not a real platform) | **verified (fixture only)** | Yes | Yes — 10 tests | Yes | Yes (synthetic) | Yes (synthetic) | N/A | No | None — this is test infrastructure, never describe it as a real platform |
| `antigravity` | Desktop (reserved ID only) | **placeholder** | No | No | No | No | No | Not prioritized | No | Not confirmed to correspond to any specific researched product this sprint |
| `copilot_status` | VS Code (reserved ID only) | **placeholder** | No | No | No | No | No | Not prioritized | No | None this sprint |

---

**Business priority order (confirmed unchanged by this sprint's audit):**

1. ChatGPT browser — keep verified, protect the revenue pilot.
2. Claude browser — beta; live verification intentionally deferred this
   sprint (explicit user decision, not a technical blocker).
3. Gemini browser — beta; same deferral as Claude.
4. VS Code — beta; needs an e2e harness + a human-operated live session
   to reach verified (`VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`).
5. Claude Code terminal / Codex / desktop — separate integration
   decision finalized this sprint
   (`TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md`); a
   tool-agnostic fixture-only prototype exists for the terminal case,
   proving the safe architecture without a real integration. No real
   integration is scheduled.

**What changed this sprint:** Per an explicit user decision, Claude/
Gemini live verification was intentionally deferred (not attempted, not
blocked on anything technical) — both remain `beta` exactly as before.
Focus shifted to the next nonbrowser platform-completion points:
- VS Code got a deep-verification audit
  (`VSCODE_EXTENSION_DEEP_VERIFICATION.md`), a hand-written `vscode`
  module test mock, and 48 new unit tests (34 → 82) covering the
  previously-untested adapter/controller/status-bar/API-client code —
  which caught and fixed a real bug (disabling the extension mid-wait-
  state could leave a phantom timer that rendered an ad anyway). VS Code
  remains `beta`: unit coverage is now strong, but a real e2e host
  harness and a human-operated live session are still outstanding.
- The terminal/Claude Code/Codex research from the prior sprint was
  consolidated into one feasibility decision doc
  (`TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md`), which also
  makes an explicit decision NOT to build a new CLI wrapper this sprint
  (the existing fixture-only prototype already satisfies every safe-MVP
  requirement; building a real wrapper would require unattempted,
  unestimated engineering work against no confirmed target tool).
- A new `check:nonbrowser-platforms` gate cross-checks all of the above
  plus re-validates that ChatGPT stays verified and Claude/Gemini/
  terminal/Claude Code/Codex are never overclaimed.

**Nothing in this sprint changed the ChatGPT revenue pilot's scope.** It
remains `browser_chatgpt` only, per
`docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md`.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
