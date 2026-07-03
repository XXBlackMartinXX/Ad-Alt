# PromptProfit — Platform Support Audit

**Phase:** Multi-Platform Professional Completeness Sprint
**Date:** 2026-07-03
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Baseline commit:** 19945ec

> Grounded in direct source inspection this session — no guessing. Builds
> on the existing `docs/CROSS_PLATFORM_STRATEGY.md` (an earlier planning
> document whose per-platform status labels — "Skeleton only", "Research
> only" — predate the extensive ChatGPT adapter work verified in
> DRYRUN-001, and are therefore stale for ChatGPT specifically; still
> accurate for Claude/Gemini/Desktop).

---

## 1. ChatGPT browser

**Classification: VERIFIED**

| Field | Detail |
|-------|--------|
| Current files | `apps/browser-extension/src/adapters/chatgpt/chatgpt.adapter.ts`, `chatgpt.renderer.ts`, `chatgpt.selectors.ts`, `chatgpt.wait-state.ts`; content-script entry `apps/browser-extension/src/content/chatgpt.ts` (dedicated, not the generic bootstrapper) |
| Manifest entries | `manifest.json` registers a dedicated content script for `chatgpt.com`/`chat.openai.com` |
| Current tests | `chatgpt.adapter.test.ts` (27 tests), `chatgpt.privacy.test.ts` (15 tests), plus 27 fixture-based e2e smoke tests (`chatgpt-adapter.smoke.spec.ts`, `dryrun-diagnostics.smoke.spec.ts`, `dryrun-selftest.smoke.spec.ts`, `privacy.smoke.spec.ts`) |
| Current privacy status | Verified — dedicated privacy test suite plus `check:monetization:privacy` scan; DRYRUN-001 confirmed no forbidden fields sent from a real session |
| Current monetization support | Full pipeline wired: wait-state detection → `GET_AD_DECISION` → render → `impression_requested`/`impression_rendered`/`viewability_threshold_met`/`click` events → real ledger writes (verified in `LEDGER_CONFIDENCE_REPORT.md`, `BILLING_RECONCILIATION_REPORT.md`) |
| Missing work | DRYRUN-001 launcher automation reconfirmation on real Windows (unrelated to product code — see `docs/internal-beta/dry-runs/DRYRUN-001-ISSUE-002.md`) |
| Recommended next step | None required for the controlled revenue pilot; keep as-is |
| Blocks revenue pilot? | No — this IS the revenue pilot platform |

---

## 2. Claude browser

**Classification: PLACEHOLDER**

| Field | Detail |
|-------|--------|
| Current files | `apps/browser-extension/src/content/claude.ts` — a 2-line stub (`import "./_content-main.js"`); no dedicated adapter directory exists (`apps/browser-extension/src/adapters/claude/` does not exist) |
| Manifest entries | Registered for `claude.ai` in `manifest.json` (confirmed content script mapping exists) |
| Current tests | None specific to Claude. `platform-detector.test.ts` covers hostname→adapterId mapping generically (includes a Claude case), but no Claude-specific adapter, wait-state, or rendering test exists |
| Current privacy status | Not reviewed — no Claude-specific privacy test exists |
| Current monetization support | **None wired.** The generic bootstrapper (`_content-main.ts`) sends `WAIT_STATE_START`/`WAIT_STATE_END` messages to the service worker, but `apps/browser-extension/src/background/service-worker.ts` has **no handler for either message type** (confirmed by direct grep — zero matches) — these messages currently go nowhere. There is no `GET_AD_DECISION` call, no rendering, no billing event for Claude today |
| Missing work | A dedicated `ClaudeAdapter` (mirroring `ChatGPTAdapter`'s structure), verified selectors against real claude.ai DOM, wiring `_content-main.ts`'s wait-state signal through to an actual ad-decision/render/event pipeline, a dedicated test suite, and a real-session privacy/functional verification (DRYRUN-001-equivalent) |
| Recommended next step | See `NEXT_PLATFORM_EXPANSION_PLAN.md` |
| Blocks revenue pilot? | No |

**Important detail:** `wait-state-detector.ts`'s `PROCESSING_SELECTORS` map already contains a guessed selector for Claude
(`button[aria-label='Stop Response']`) but this has **never been verified against real claude.ai** — it is an unconfirmed guess, not evidence of working detection.

---

## 3. Gemini browser

**Classification: PLACEHOLDER**

Identical situation to Claude browser — same generic bootstrapper, same
unwired `WAIT_STATE_START`/`WAIT_STATE_END` messages, same lack of a
dedicated adapter, tests, or privacy review.

| Field | Detail |
|-------|--------|
| Current files | `apps/browser-extension/src/content/gemini.ts` — 2-line stub |
| Manifest entries | Registered for `gemini.google.com` |
| Current tests | None Gemini-specific |
| Current privacy status | Not reviewed |
| Current monetization support | None wired (same gap as Claude) |
| Missing work | Same as Claude, plus its own selector verification — `button[aria-label='Stop generating']` in `wait-state-detector.ts` is unverified against real gemini.google.com |
| Recommended next step | Second expansion target, after Claude |
| Blocks revenue pilot? | No |

---

## 4. VS Code extension

**Classification: PARTIAL**

| Field | Detail |
|-------|--------|
| Current files | `apps/extension/src/adapters/ai-status-bar.adapter.ts`, `mock.adapter.ts`, `types.ts`, plus `controller.ts`, `api-client.ts`, `device-id.ts`, `event-queue.ts`, `extension.ts`, `status-bar.ts` |
| Manifest entries | `apps/extension/package.json` declares the VS Code extension manifest (`contributes`, `activationEvents`) |
| Current tests | `event-queue.test.ts` (8 tests), `privacy.test.ts` (26 tests) — 34/34 passing this session. No adapter-activation or wait-state-specific test file exists (unlike ChatGPT's dedicated adapter test suite) |
| Current privacy status | A dedicated `privacy.test.ts` exists and passes, but no live-session privacy verification equivalent to DRYRUN-001 has been recorded for VS Code in this repo's dry-run docs |
| Current monetization support | Implemented (`ai_status_bar` adapter, real event queue, API client) — referenced throughout as "MVP shipped" in `docs/CROSS_PLATFORM_STRATEGY.md` §2, but this repo's dry-run verification effort (DRYRUN-001 and its successors) was scoped to the ChatGPT browser adapter only, not VS Code |
| Missing work | A DRYRUN-001-equivalent real-session verification record for VS Code specifically |
| Recommended next step | Run an equivalent live verification session for VS Code and record it, separate from this sprint's scope |
| Blocks revenue pilot? | No — the revenue pilot is scoped to `browser_chatgpt` only |

---

## 5. Codex

**Classification: NOT IMPLEMENTED**

No adapter ID, file, manifest entry, or test exists anywhere in this
repository. `grep -rli "codex"` across all `.ts`/`.js`/`.md` files finds
exactly one match, in `docs/00-reference-analysis-and-clean-room-spec.md`
(a reference/analysis document, not implementation). No adapter ID for
Codex exists in the canonical allowlist
(`packages/shared/src/schemas/adapters.ts`).

- Blocks revenue pilot? No.
- Recommended next step: none this sprint — requires separate integration
  research (CANARY 10). See `FAST_PLATFORM_EXPANSION_TRIAGE.md`.

## 6. Claude Code desktop

**Classification: NOT IMPLEMENTED / REQUIRES SEPARATE INTEGRATION**

No adapter ID, file, or manifest entry exists. No desktop-app integration
mechanism exists anywhere in this codebase — the `DESKTOP_ADAPTER_IDS`
list in `packages/shared/src/schemas/adapters.ts` contains only
`desktop_chatgpt`, `desktop_claude`, and `antigravity`, explicitly
commented "planned — not yet implemented." No desktop-specific detection
code exists at all (no screen-reading, no OS-level hook, nothing).

- Blocks revenue pilot? No.
- Recommended next step: research only, per CANARY 10 — a desktop app has
  a fundamentally different integration surface than a browser extension
  or VS Code extension (no DOM, no extension API) and must not be
  assumed from existing browser-extension code.

## 7. Claude Code terminal

**Classification: NOT IMPLEMENTED / REQUIRES SEPARATE INTEGRATION**

No adapter ID, file, or reference exists anywhere in this codebase beyond
a single forbidden-data-field mention (`packages/platform-core/src/adapter.types.ts`
lists "terminal content" in its list of data that must NEVER be
collected — a privacy guard, not an integration). No terminal adapter,
detection mechanism, or CLI hook exists.

- Blocks revenue pilot? No.
- Recommended next step: research only. A terminal integration would need
  an entirely separate detection model (e.g. a CLI wrapper or shell
  hook) — explicitly out of scope for this sprint per CANARY 10.

## 8. Generic terminal AI tools

**Classification: NOT IMPLEMENTED / REQUIRES SEPARATE INTEGRATION**

Same finding as Claude Code terminal — no generic terminal integration
exists or is referenced as implementation anywhere in this repo.

## 9. Other AI web apps referenced in repo

**Classification: mixed — see below**

- `browser_mock` — a real, implemented, tested mock adapter
  (`apps/browser-extension/src/adapters/browser-mock.adapter.ts`,
  `browser-mock-adapter.test.ts`, 10 tests) used for local/fixture
  testing only. **Classification: VERIFIED (as a test fixture, not a
  real platform)** — it does not represent a real external AI platform
  and must never be described as one.
- `antigravity` — an adapter ID exists in
  `packages/shared/src/schemas/adapters.ts` (`DESKTOP_ADAPTER_IDS`),
  commented "planned — not yet implemented." No files, tests, or logic
  reference it beyond the ID string itself.
  **Classification: PLACEHOLDER (ID reserved only).**
- `copilot_status` — a VS Code adapter ID exists
  (`VSCODE_ADAPTER_IDS`), commented "(planned)". No implementation files
  found beyond the ID string.
  **Classification: PLACEHOLDER (ID reserved only).**

---

## Summary table

| Platform | Classification | Blocks revenue pilot? |
|----------|-----------------|--------------------------|
| ChatGPT browser | VERIFIED | No (this is the pilot platform) |
| Claude browser | PLACEHOLDER | No |
| Gemini browser | PLACEHOLDER | No |
| VS Code extension | PARTIAL | No |
| Codex | NOT IMPLEMENTED | No |
| Claude Code desktop | NOT IMPLEMENTED / REQUIRES SEPARATE INTEGRATION | No |
| Claude Code terminal | NOT IMPLEMENTED / REQUIRES SEPARATE INTEGRATION | No |
| Generic terminal AI tools | NOT IMPLEMENTED / REQUIRES SEPARATE INTEGRATION | No |
| `browser_mock` | VERIFIED (test fixture only, not a real platform) | No |
| `antigravity` | PLACEHOLDER (ID reserved only) | No |
| `copilot_status` | PLACEHOLDER (ID reserved only) | No |

**No platform other than ChatGPT browser may be described as "supported"
or "verified" in any external-facing communication.** This audit is the
evidence trail for that constraint.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
