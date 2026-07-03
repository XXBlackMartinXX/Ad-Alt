# Claude Browser — Verification Record

**Phase:** Complete Multi-Platform Support Before Pilot Execution
**Date:** 2026-07-03
**Current support label: `beta`**

> This document is the evidence record required by
> `PLATFORM_ADAPTER_CONTRACT.md` §9 (privacy) and §10 (fixture) before
> Claude can move past `placeholder`. It does NOT satisfy §11
> (verification) — that requires a human-operated real-session record,
> which does not yet exist. **Do not describe Claude browser as
> "verified" anywhere until §11 evidence is added below.**

---

## 1. What changed this sprint

Claude's adapter code (`claude.adapter.ts` / `.renderer.ts` / `.selectors.ts`
/ `.wait-state.ts`) already existed from the prior sprint but was
**deliberately not wired into the live content script** — it was tested,
isolated code with zero effect on the shipped extension. This sprint:

1. Wired `ClaudeAdapter` into `apps/browser-extension/src/content/claude.ts`
   (previously a 2-line bootstrapper importing only the generic
   `_content-main.js`). The new `claude.ts` mirrors `chatgpt.ts`'s core
   handshake (canActivate → kill-switch check → start → wait-state →
   ad-decision → render → viewability → events) but deliberately
   **excludes** the ChatGPT-only internal-beta DRYRUN-001 forced demo
   fallback, which exists solely to make the ChatGPT revenue pilot's dry
   run deterministic and has no reason to exist for Claude.
2. Added `apps/browser-extension/e2e/fixtures/claude-wait-state.html` — a
   synthetic fixture page (explicitly disclaimed as not real claude.ai
   content) exposing a hidden sentinel button matching the same
   `aria-label="Stop Response"` selector `claude.selectors.ts` watches for.
3. Generalized the shared E2E test content script
   (`src/content/fixture-test.ts`) to select `ChatGPTAdapter`,
   `ClaudeAdapter`, or `GeminiAdapter` based on the fixture page's
   filename (a local test-routing decision, not page content) — so
   Claude's full pipeline can be exercised against the fixture without
   touching real claude.ai.
4. Added `apps/browser-extension/e2e/claude-adapter.smoke.spec.ts` (7
   Playwright tests).
5. Added `scripts/smoke:claude:fixture` (both root and package-level).

## 2. Fixture evidence

`pnpm -w run smoke:claude:fixture` — 7/7 passing:

- extension loads on Claude fixture page without errors
- sponsored banner appears when wait-state is triggered
- banner disappears when wait-state ends
- disabled adapter (global kill-switch) shows no banner
- disabling only `browser_claude` via `disabledAdapters` shows no banner (proves per-adapter kill-switch granularity, not just the global one)
- missing api url shows no banner
- ad-decision request and captured events for Claude contain no forbidden fields, and `adapterName` is correctly `browser_claude` (never `browser_chatgpt`/`browser_gemini`)

Also confirmed via the full suite (`playwright test`, 41 tests, 2 workers):
Claude's fixture tests run in parallel alongside ChatGPT's and Gemini's
with zero interference — proving Claude does not affect ChatGPT behavior
(mission requirement).

## 3. Unit evidence

`pnpm --filter @ad-alt/browser-extension test:unit`:

- `claude.adapter.test.ts` — 25 tests (identity, `canActivate` on/off
  hostname including cross-platform rejection on chatgpt.com and
  gemini.google.com, wait-state start/end/dispose, second-start no-op,
  health, rendering, viewability).
- `claude.privacy.test.ts` — 15 tests (clean event accepted; 11 forbidden
  fields each individually rejected; `TelemetryEventSchema` accepts
  `browser_claude`, strips/rejects `pageUrl`, rejects unknown adapter IDs).

## 4. Privacy evidence

- `pnpm -w run check:monetization:privacy` — PASS. Its scan of
  `apps/browser-extension/src` already recursively covers
  `adapters/claude/` with no code change required.
- `claude.selectors.ts` and `claude.wait-state.ts` only ever call
  `document.querySelector()` for presence/absence — never `.textContent`,
  `.innerText`, `.value`, or any attribute read beyond the selector match
  itself.
- `claude.ts` (the live content script) never reads `document.title`,
  `window.location.href` beyond `hostname`, cookies, or storage beyond the
  extension's own `chrome.storage.local` keys.
- The embedded forbidden-fields check in `claude-adapter.smoke.spec.ts`
  proves this end-to-end against the compiled, running extension — not
  just against source code.

## 5. Manual live verification steps (NOT YET PERFORMED)

The following is the exact checklist a human operator must follow to move
Claude from `beta` to `verified`, mirroring
`docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md`'s evidentiary
standard. **No part of this may be automated** (CANARY 8 — no automated
real Claude login, no automated real prompt entry):

1. A human operator manually logs into claude.ai in a real Chrome profile
   with the unpacked extension loaded (`pnpm build` → load `dist/` as an
   unpacked extension).
2. The operator manually sends a real prompt to Claude and observes,
   without automation, whether:
   - `button[aria-label='Stop Response']` (or its real current equivalent
     — Anthropic's UI may have changed since this selector was guessed)
     actually appears while Claude is generating.
   - The PromptProfit sponsored banner renders during that window.
   - The banner disappears when generation ends.
3. The operator records: the exact selector that worked (updating
   `claude.selectors.ts` and its "UNVERIFIED" doc comment if the guess was
   wrong), a screenshot-free written description of what was observed (no
   screenshots of a real Claude conversation may be attached — that would
   itself violate the non-negotiable privacy rules), and a pass/fail
   verdict.
4. The result is logged in a new dated file following
   `DRYRUN-001_RESULT_LOG.md`'s format, and `PLATFORM_SUPPORT_MATRIX.md` /
   `check-platform-support-readiness.js`'s exemption list is updated only
   after that log exists.

## 6. Current support label and remaining blockers

**Support label: `beta`** — fixture-tested, unit-tested, privacy-reviewed,
pipeline fully wired and kill-switch-capable. Not `verified`: no
human-operated live-session record exists (§5 above is the exact,
un-started blocker). Not `experimental`: all of §9-10 of the adapter
contract are satisfied, which is strictly more than `experimental`
requires.

**Remaining blockers to `verified`:**
1. §5's manual live-session checklist has not been performed.
2. `CLAUDE_PROCESSING_SELECTORS` (`button[aria-label='Stop Response']`) is
   an unverified guess and may not match real claude.ai's current DOM.
3. Claude defaults to kill-switch-disabled-but-inactive rollout posture
   (see `PLATFORM_SUPPORT_MATRIX.md`) until the above is resolved — it
   must not be enabled for real users before `verified`.

**This platform does not block the ChatGPT revenue pilot** — Claude is
additive, isolated, and the pilot's scope
(`docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md`)
remains `browser_chatgpt` only.

---

**Privacy warning: Do not add real Claude prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
