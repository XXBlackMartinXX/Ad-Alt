# Gemini Browser — Verification Record

**Phase:** Complete Multi-Platform Support Before Pilot Execution
**Date:** 2026-07-03
**Current support label: `beta`**

> This document is the evidence record required by
> `PLATFORM_ADAPTER_CONTRACT.md` §9 (privacy) and §10 (fixture) before
> Gemini can move past `placeholder`. It does NOT satisfy §11
> (verification) — that requires a human-operated real-session record,
> which does not yet exist. **Do not describe Gemini browser as
> "verified" anywhere until §11 evidence is added below.**

---

## 1. What changed this sprint

Unlike Claude (which had an isolated, unwired adapter skeleton from a
prior sprint), Gemini had **no adapter code at all** before this sprint —
only a hostname reservation (`gemini.google.com` in `manifest.json`), a
2-line content-script bootstrapper, and a guessed selector entry in the
generic `PROCESSING_SELECTORS` map. This sprint built Gemini from
scratch, using Claude's now-proven adapter pattern as the direct template
(per `NEXT_PLATFORM_EXPANSION_PLAN.md`'s stated intent to build Claude
first, then reuse the same pattern for Gemini):

1. Added `apps/browser-extension/src/adapters/gemini/{gemini.adapter,
   gemini.renderer,gemini.selectors,gemini.wait-state}.ts` — structurally
   identical to Claude's equivalents, with `adapterId: "browser_gemini"`
   (already present in `packages/shared`'s `ALLOWED_ADAPTER_IDS` /
   `BROWSER_ADAPTER_IDS` from a prior sprint, so no schema changes were
   needed).
2. Wired `GeminiAdapter` into `apps/browser-extension/src/content/
   gemini.ts` (previously a 2-line bootstrapper), mirroring `claude.ts`'s
   simplified handshake (no ChatGPT-only DRYRUN-001 fallback).
3. Added `apps/browser-extension/e2e/fixtures/gemini-wait-state.html` — a
   synthetic fixture page exposing a hidden sentinel button matching
   `aria-label="Stop generating"`, the selector already guessed in the
   generic map (carried into `gemini.selectors.ts`, still unverified
   against the real platform).
4. Extended the shared E2E fixture content script (`fixture-test.ts`,
   generalized in the same change that added Claude support) to also
   select `GeminiAdapter` when the fixture page's filename contains
   "gemini".
5. Added `apps/browser-extension/e2e/gemini-adapter.smoke.spec.ts` (7
   Playwright tests) and `apps/browser-extension/src/adapters/gemini/
   __tests__/{gemini.adapter.test.ts,gemini.privacy.test.ts}` (25 + 15
   unit tests).
6. Added `scripts/smoke:gemini:fixture` (both root and package-level).

## 2. Fixture evidence

`pnpm -w run smoke:gemini:fixture` — 7/7 passing:

- extension loads on Gemini fixture page without errors
- sponsored banner appears when wait-state is triggered
- banner disappears when wait-state ends
- disabled adapter (global kill-switch) shows no banner
- disabling only `browser_gemini` via `disabledAdapters` shows no banner (proves per-adapter kill-switch granularity)
- missing api url shows no banner
- ad-decision request and captured events for Gemini contain no forbidden fields, and `adapterName` is correctly `browser_gemini` (never `browser_chatgpt`/`browser_claude`)

Also confirmed via the full suite (`playwright test`, 41 tests, 2 workers):
Gemini's fixture tests run in parallel alongside ChatGPT's and Claude's
with zero interference — proving Gemini does not affect ChatGPT or Claude
behavior (mission requirement).

## 3. Unit evidence

`pnpm --filter @ad-alt/browser-extension test:unit`:

- `gemini.adapter.test.ts` — 25 tests (identity, `canActivate` on/off
  hostname including cross-platform rejection on chatgpt.com and
  claude.ai, wait-state start/end/dispose, second-start no-op, health,
  rendering, viewability).
- `gemini.privacy.test.ts` — 15 tests (clean event accepted; 11 forbidden
  fields each individually rejected; `TelemetryEventSchema` accepts
  `browser_gemini`, strips/rejects `pageUrl`, rejects unknown adapter IDs).

## 4. Privacy evidence

- `pnpm -w run check:monetization:privacy` — PASS. Its recursive scan of
  `apps/browser-extension/src` automatically covers the new
  `adapters/gemini/` directory with no code change to the scan script.
- `gemini.selectors.ts` and `gemini.wait-state.ts` only ever call
  `document.querySelector()` for presence/absence — never `.textContent`,
  `.innerText`, `.value`, or any attribute read beyond the selector match
  itself.
- `gemini.ts` (the live content script) never reads `document.title`,
  `window.location.href` beyond `hostname`, cookies, or storage beyond the
  extension's own `chrome.storage.local` keys.
- The embedded forbidden-fields check in `gemini-adapter.smoke.spec.ts`
  proves this end-to-end against the compiled, running extension.

## 5. Manual live verification steps (NOT YET PERFORMED)

Identical procedure to Claude's (see `CLAUDE_BROWSER_VERIFICATION.md` §5),
adapted for Gemini. **No part of this may be automated** (CANARY 8):

1. A human operator manually logs into gemini.google.com in a real Chrome
   profile with the unpacked extension loaded.
2. The operator manually sends a real prompt and observes, without
   automation, whether `button[aria-label='Stop generating']` (or its
   real current equivalent) appears while Gemini is generating, whether
   the banner renders during that window, and whether it disappears when
   generation ends.
3. The operator records the exact working selector (updating
   `gemini.selectors.ts`'s "UNVERIFIED" doc comment if the guess was
   wrong), a written (non-screenshot) description of the observed
   behavior, and a pass/fail verdict.
4. The result is logged in a new dated file following
   `DRYRUN-001_RESULT_LOG.md`'s format, and `PLATFORM_SUPPORT_MATRIX.md` /
   `check-platform-support-readiness.js`'s exemption list is updated only
   after that log exists.

## 6. Current support label and remaining blockers

**Support label: `beta`** — fixture-tested, unit-tested, privacy-reviewed,
pipeline fully wired and kill-switch-capable. Not `verified`: no
human-operated live-session record exists. Not `experimental`: all of
§9-10 of the adapter contract are satisfied.

**Remaining blockers to `verified`:**
1. §5's manual live-session checklist has not been performed.
2. `GEMINI_PROCESSING_SELECTORS` (`button[aria-label='Stop generating']`)
   is an unverified guess and may not match real gemini.google.com's
   current DOM.
3. Gemini must remain kill-switch-disabled-but-inactive for real users
   until the above is resolved.

**This platform does not block the ChatGPT revenue pilot** — Gemini is
additive, isolated, and the pilot's scope
(`docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md`)
remains `browser_chatgpt` only.

---

**Privacy warning: Do not add real Gemini prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
