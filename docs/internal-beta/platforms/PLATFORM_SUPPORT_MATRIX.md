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
> `scripts/check-terminal-adapter.js` (`check:terminal-adapter`) verifies
> the real, generic, opt-in `packages/terminal-adapter` package (build,
> typecheck, tests, a fresh synthetic demo run, and static privacy/stdio-
> safety scans) — see `REAL_TERMINAL_ADAPTER_DESIGN.md`,
> `TERMINAL_DESKTOP_CODEX_DEEP_INTEGRATION_AUDIT.md`, and the three
> per-platform decision docs (`CLAUDE_CODE_TERMINAL_INTEGRATION_
> DECISION.md`, `CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md`,
> `CODEX_CLI_IDE_INTEGRATION_DECISION.md`).

| Platform | Surface type | Support status | Adapter exists | Tests exist | Privacy reviewed | Monetization ready | Kill-switch capable | Launch priority | Blocks revenue pilot? | Next action |
|----------|---------------|------------------|-----------------|--------------|---------------------|-----------------------|--------------------------|--------------------|--------------------------|--------------|
| ChatGPT browser | Browser extension (MV3) | **verified** | Yes — `chatgpt.adapter.ts` + selectors/renderer/wait-state | Yes — 42 unit tests + 27 e2e smoke tests | Yes — dedicated privacy test suite + `check:monetization:privacy` | Yes — full pipeline, real ledger writes confirmed | Yes — server-side (event-processor.ts) + client-side (`syncFlagsFromBackend`), both confirmed | 1 (current revenue platform) | **No** | None — maintain |
| Claude browser | Browser extension (MV3) | **beta** — live-wired / fixture-tested / live verification pending | Yes — `claude.adapter.ts` + selectors/renderer/wait-state, wired live into `content/claude.ts` | Yes — 25 unit + 15 privacy tests + 7 e2e smoke tests (`claude-adapter.smoke.spec.ts`) | Yes — dedicated privacy test suite + `check:monetization:privacy` passing | Pipeline wired (same API/ledger path as ChatGPT); disabled for real users pending live-session confirmation | Yes — same two-layer kill-switch as ChatGPT, unit + e2e tested | 2 | No | Live verification intentionally deferred this sprint (user decision) — when resumed: `pnpm -w run live:claude:no-login`, then `CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` if needed |
| Gemini browser | Browser extension (MV3) | **beta** — live-wired / fixture-tested / live verification pending | Yes — `gemini.adapter.ts` + selectors/renderer/wait-state, wired live into `content/gemini.ts` | Yes — 25 unit + 15 privacy tests + 7 e2e smoke tests (`gemini-adapter.smoke.spec.ts`) | Yes — dedicated privacy test suite + `check:monetization:privacy` passing | Pipeline wired (same API/ledger path as ChatGPT); disabled for real users pending live-session confirmation | Yes — same two-layer kill-switch as ChatGPT, unit + e2e tested | 3 | No | Live verification intentionally deferred this sprint (user decision) — when resumed: `pnpm -w run live:gemini:no-login`, then `GEMINI_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` if needed |
| VS Code extension | Native extension | **beta** | Yes — `ai-status-bar.adapter.ts` (real idle-timer heuristic, not a stub) | Yes — 82 unit tests (up from 34 this sprint: adds `ai-status-bar.adapter`, `mock.adapter`, `status-bar`, `api-client`, and `controller` coverage via a hand-written `vscode` module mock); no e2e host-level harness | Yes — 26 dedicated privacy tests plus new privacy assertions inside the controller/adapter tests; no live-session record | Yes — real event queue + API client wired | Yes — flag-cache polling wired; this sprint also fixed a real bug where disabling the extension mid-wait-state could leave a phantom timer that rendered an ad anyway (see `VSCODE_EXTENSION_DEEP_VERIFICATION.md`) | 4 | No | Add `@vscode/test-electron` e2e harness, then a human-operated live session (`VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`) — see `VSCODE_EXTENSION_DEEP_VERIFICATION.md` |
| Claude Code terminal | CLI/terminal | **experimental** (via generic adapter) / **requires separate integration** (Claude-Code-specific, named support) | Yes — `packages/terminal-adapter`'s tool-agnostic `wrap`/`demo` modes can be pointed at a real `claude` invocation by explicit user opt-in; no Claude-Code-specific code exists | Yes — 35 unit tests (kill-switch, lifecycle schema, demo sequence, real-process `wrap` behavior, dedicated privacy suite) | Yes — dedicated `privacy.test.ts` + static scans in `check:terminal-adapter` | No — fully offline, never contacts any API | Yes — two-layer kill-switch (global + per-adapter), unit-tested | 5 | No | Human-operated session wrapping a real `claude` invocation to confirm passthrough fidelity — see `CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md` |
| Codex (CLI/terminal) | CLI/terminal | **experimental** (via generic adapter) / **requires separate integration** (Codex-specific, named support) | Yes — same tool-agnostic `packages/terminal-adapter`, pointed at a `codex` binary instead | Yes — same 35 unit tests (tool-agnostic by construction) | Yes — same privacy suite | No | Yes — same kill-switch | 5 | No | Human-operated session against a real `codex` invocation — see `CODEX_CLI_IDE_INTEGRATION_DECISION.md` |
| Codex (IDE/editor) | Unknown (unresearched product surface) | **requires separate integration** | No | No | No | No | No | 5 | No | External product research needed before any code — see `CODEX_CLI_IDE_INTEGRATION_DECISION.md` |
| Claude Code desktop | Desktop app | **requires separate integration** | No | No | No | No | No | 6 | No | No safe integration point known; screen-scraping/OCR/accessibility-tree-scraping explicitly forbidden — see `CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md` |
| Generic terminal AI tools | CLI/terminal | **experimental** | Yes — `packages/terminal-adapter` (`@ad-alt/terminal-adapter`): local JSON config, two-layer kill-switch, synthetic `demo` mode, real-process `wrap` mode (stdio fully inherited, lifecycle-only observation) | Yes — 35 unit tests | Yes — dedicated privacy suite + `check:terminal-adapter` gate | No — fully offline | Yes | 6 | No | Human-operated verification session against any real long-running CLI tool, to reach `beta` — see `REAL_TERMINAL_ADAPTER_DESIGN.md` §13 |
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
5. Generic terminal lifecycle adapter (`packages/terminal-adapter`) —
   real, tested, `experimental`; reachable by Claude Code terminal or
   Codex CLI via explicit user opt-in, with neither claimed as
   Claude-Code- or Codex-specific "supported" (see
   `CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md`,
   `CODEX_CLI_IDE_INTEGRATION_DECISION.md`).
6. Claude Code desktop / Codex IDE-editor — `requires separate
   integration`; no safe hook/API found in this repo (see
   `CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md`,
   `TERMINAL_DESKTOP_CODEX_DEEP_INTEGRATION_AUDIT.md`).

**What changed this sprint (Safe Real Integration Sprint for Claude Code
Terminal, Claude Code Desktop, and Codex CLI/IDE):**
- Built a genuinely new, real, tested package —
  `packages/terminal-adapter` (`@ad-alt/terminal-adapter`) — a generic,
  tool-agnostic, opt-in, lifecycle-only terminal adapter: a synthetic
  `demo` mode and a real `wrap` mode that spawns an arbitrary
  user-specified command with fully inherited stdio, observing only its
  start/exit/duration, never its command text or output content. 35 unit
  tests, including a dedicated privacy suite and real-process spawn
  tests. See `REAL_TERMINAL_ADAPTER_DESIGN.md`.
- This supersedes nothing — the earlier fixture-only prototype
  (`scripts/lib/terminal-fixture.js`, adapter ID `manual`) remains in
  place, passing, and untouched; the new package is additive.
- Wrote a deep, evidence-grounded audit covering all six terminal/
  desktop/Codex surfaces
  (`TERMINAL_DESKTOP_CODEX_DEEP_INTEGRATION_AUDIT.md`) plus three
  separate per-platform decision docs
  (`CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md`,
  `CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md`,
  `CODEX_CLI_IDE_INTEGRATION_DECISION.md`) — each explicit about what is
  and is not real, and what remains before a stronger label.
- Built `scripts/check-terminal-adapter.js` (`check:terminal-adapter`):
  fresh build/typecheck/test run, a fresh synthetic demo run checked for
  forbidden fields, static stdio-safety and no-network-I/O scans, and an
  honesty scan over the new decision docs.
- Upgraded `check:nonbrowser-platforms`'s overclaim scanner to be
  negation-aware (the same fix already applied to
  `check-final-internal-pilot-readiness.js` in the prior sprint), added
  the five new docs to its required-docs list, and wired
  `check:terminal-adapter` in as a fresh upstream dependency.
- Claude Code desktop and Codex IDE/editor remain `requires separate
  integration` — no safe hook/API was found in this repo for either, and
  none was assumed.

**Nothing in this sprint changed the ChatGPT revenue pilot's scope.** It
remains `browser_chatgpt` only, per
`docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md`.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
