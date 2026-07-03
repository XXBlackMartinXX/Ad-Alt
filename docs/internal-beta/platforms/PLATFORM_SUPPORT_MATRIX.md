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

| Platform | Surface type | Support status | Adapter exists | Tests exist | Privacy reviewed | Monetization ready | Kill-switch capable | Launch priority | Blocks revenue pilot? | Next action |
|----------|---------------|------------------|-----------------|--------------|---------------------|-----------------------|--------------------------|--------------------|--------------------------|--------------|
| ChatGPT browser | Browser extension (MV3) | **verified** | Yes — `chatgpt.adapter.ts` + selectors/renderer/wait-state | Yes — 42 unit tests + 27 e2e smoke tests | Yes — dedicated privacy test suite + `check:monetization:privacy` | Yes — full pipeline, real ledger writes confirmed | Yes — server-side (event-processor.ts) + client-side (`syncFlagsFromBackend`), both confirmed | 1 (current revenue platform) | **No** | None — maintain |
| Claude browser | Browser extension (MV3) | **beta** — live-wired / fixture-tested / no-login live-smoke pending | Yes — `claude.adapter.ts` + selectors/renderer/wait-state, wired live into `content/claude.ts` | Yes — 25 unit + 15 privacy tests + 7 e2e smoke tests (`claude-adapter.smoke.spec.ts`) | Yes — dedicated privacy test suite + `check:monetization:privacy` passing | Pipeline wired (same API/ledger path as ChatGPT); disabled for real users pending live-session confirmation | Yes — same two-layer kill-switch as ChatGPT, unit + e2e tested | 2 | No | Run `pnpm -w run live:claude:no-login` (no-login live smoke), then if wait-state requires login, `CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` — see `CLAUDE_BROWSER_VERIFICATION.md` §5 |
| Gemini browser | Browser extension (MV3) | **beta** — live-wired / fixture-tested / no-login live-smoke pending | Yes — `gemini.adapter.ts` + selectors/renderer/wait-state, wired live into `content/gemini.ts` | Yes — 25 unit + 15 privacy tests + 7 e2e smoke tests (`gemini-adapter.smoke.spec.ts`) | Yes — dedicated privacy test suite + `check:monetization:privacy` passing | Pipeline wired (same API/ledger path as ChatGPT); disabled for real users pending live-session confirmation | Yes — same two-layer kill-switch as ChatGPT, unit + e2e tested | 3 | No | Run `pnpm -w run live:gemini:no-login` (no-login live smoke), then if wait-state requires login, `GEMINI_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` — see `GEMINI_BROWSER_VERIFICATION.md` §5 |
| VS Code extension | Native extension | **beta** | Yes — `ai-status-bar.adapter.ts` (real idle-timer heuristic, not a stub) | Yes — 34 unit tests (event-queue, privacy); no e2e host-level harness | Yes — 26 unit privacy tests; no live-session record | Yes — real event queue + API client wired | Yes — flag-cache polling wired, not separately re-confirmed this sprint | 4 | No | Add `@vscode/test-electron` e2e harness, then a live session — see `VSCODE_EXTENSION_VERIFICATION.md` |
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
2. Claude browser — beta; needs a human-operated live session to reach verified.
3. Gemini browser — beta; needs a human-operated live session to reach verified.
4. VS Code — beta; needs an e2e harness + live session to reach verified.
5. Claude Code terminal / Codex / desktop — separate integration research
   complete (`CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md`); a tool-agnostic
   fixture-only prototype exists for the terminal case, proving the safe
   architecture without a real integration. No real integration is
   scheduled this sprint.

**What changed this sprint:** A safe, staged live-verification workflow
was added for Claude and Gemini (no-login live smoke first, assisted
manual logged-in verification only if needed) — see
`LIVE_VERIFICATION_SAFETY_POLICY.md`, the four runbooks, and
`check:platform-live-readiness`. No human has run this workflow yet, so
its result is correctly `HOLD` (runbooks ready, evidence pending), and
both platforms remain `beta`, exactly as before this sprint. No login
automation, no prompt automation, and no DOM/page/chat scraping were
added anywhere in this workflow.

**Nothing in this sprint changed the ChatGPT revenue pilot's scope.** It
remains `browser_chatgpt` only, per
`docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md`.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
