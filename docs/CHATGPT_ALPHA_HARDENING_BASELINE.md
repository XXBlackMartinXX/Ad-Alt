# ChatGPT Alpha Hardening — Baseline

**Date:** 2026-06-30
**Branch:** `claude/ecstatic-maxwell-h0d8d8`
**Status:** alpha hardening improved

This document records the verified baseline after the alpha hardening pass on
the ChatGPT browser adapter. It supersedes `LIVE_CHATGPT_SMOKE_BASELINE.md`
for post-hardening tracking.

---

## Test Suite Results

| Suite | Count | Skipped | Failed |
|-------|-------|---------|--------|
| Fixture E2E (`test:e2e`) | **13 passed** | 0 | 0 |
| Unit tests (`test:unit`) | **105 passed** | 0 | 0 |
| TypeScript | 0 errors | — | — |
| Lint | 0 errors | — | — |
| Build (`dist/`) | clean | — | — |
| Build (`dist-test/`) | clean | — | — |

Run commands:

```
pnpm --filter @ad-alt/browser-extension test:e2e
pnpm --filter @ad-alt/browser-extension test:unit
pnpm --filter @ad-alt/browser-extension typecheck
pnpm --filter @ad-alt/browser-extension lint
pnpm --filter @ad-alt/browser-extension build
pnpm --filter @ad-alt/browser-extension build:test
```

---

## Fixture E2E Test Inventory

| # | Test | File |
|---|------|------|
| 1 | extension loads on fixture page without errors | chatgpt-adapter.smoke.spec.ts |
| 2 | fixture page reports idle state initially | chatgpt-adapter.smoke.spec.ts |
| 3 | sponsored banner appears when wait-state is triggered | chatgpt-adapter.smoke.spec.ts |
| 4 | banner has required sponsorship label | chatgpt-adapter.smoke.spec.ts |
| 5 | banner has close button | chatgpt-adapter.smoke.spec.ts |
| 6 | banner disappears when close button is clicked | chatgpt-adapter.smoke.spec.ts |
| 7 | banner disappears when wait-state ends | chatgpt-adapter.smoke.spec.ts |
| 8 | disabled adapter (kill-switch) shows no banner | chatgpt-adapter.smoke.spec.ts |
| 9 | missing api url shows no banner | chatgpt-adapter.smoke.spec.ts |
| 10 | **viewability_threshold_met fires after test threshold** | chatgpt-adapter.smoke.spec.ts |
| 11 | ad decision request contains no forbidden fields | privacy.smoke.spec.ts |
| 12 | captured events contain no forbidden fields | privacy.smoke.spec.ts |
| 13 | no page content sent for any DOM interaction | privacy.smoke.spec.ts |

Test 10 is new in this hardening pass: uses a 200 ms test-only viewability
threshold written to `chrome.storage.local` and read exclusively by
`fixture-test.ts`. Production `chatgpt.ts` is never affected.

---

## Hardening Improvements (This Pass)

### Phase 3 — Debug Panel Diagnostic Fields

`DebugPanelState` and `DebugPanel` gained three new fields:

| Field | Type | Default | Data attribute |
|-------|------|---------|----------------|
| `adDecisionRequested` | `boolean` | `false` | `data-decision-requested` |
| `adDecisionReceived` | `boolean` | `false` | `data-decision-received` |
| `lastErrorCode` | `string \| null` | `null` | `data-last-error` |

Allowed `lastErrorCode` values (internal-only, no page content):
- `"service_worker_unreachable"`
- `"kill_switch_active"`
- `"no_decision"`
- `"banner_render_failed"`
- `null` (cleared on success)

Both `chatgpt.ts` (production) and `fixture-test.ts` (test) update these
fields at each lifecycle stage so failures can be diagnosed from the debug
panel's data attributes without reading any page content.

### Phase 4 — Deterministic Viewability E2E

Added `testViewabilityThresholdMs` storage key (test-only):
- Written by `configureExtensionStorage()` in `extension-context.ts`
- Read only by `fixture-test.ts` at startup
- **Never read by `chatgpt.ts`** — production threshold is always
  `VIEWABILITY_THRESHOLDS.BILLABLE_DURATION_MS` (5 000 ms)
- When set, `fixture-test.ts` bypasses `IntersectionObserver` (which does
  not fire reliably in `--headless=new` without an explicit viewport) and
  uses a direct `setTimeout` instead

`ViewabilityObserver.observe()` accepts an optional `billableThresholdMs`
parameter for the threshold override; the bypass is in `fixture-test.ts`
rather than the observer so production semantics are untouched.

---

## Privacy Invariants

The following privacy invariants are asserted by automated tests and have
been verified against the source:

1. No event payload contains `pageUrl`, `pageTitle`, `domText`, `promptText`,
   `aiResponse`, `chatHistory`, `cookies`, `authToken`, or `sessionCookie`.
2. `DebugPanelState` exposes no forbidden field names as keys.
3. The `lastErrorCode` field is restricted to a whitelist of internal codes
   with no page content.
4. `window.location.hostname` is used only for adapter activation gating
   (canActivate); the full URL path/query is never read.
5. `document.body` is used only as the `MutationObserver` root in the wait-
   state detector; `textContent`, `innerHTML`, or attribute values are never
   read.
6. The renderer writes only extension-controlled text (`PromptProfit · Sponsored`,
   `moment.headline`, `moment.body`, `moment.displayUrl`) from the API response.
   It never reads page DOM content.

---

## Live Smoke Status

Previous session: **alpha live-smoke verified** (user ran
`pnpm smoke:chatgpt:live` manually; test completed in ~20.4 s; ChatGPT
adapter detected wait-state, banner appeared, impression events fired).

The live smoke test requires a logged-in ChatGPT session. It is not run in
CI. Use `pnpm smoke:chatgpt:live` to re-run manually when needed.

---

## Known Limitations

- `IntersectionObserver` does not fire reliably in `--headless=new` when
  `launchPersistentContext` has no explicit viewport. The production
  `ViewabilityObserver` is correct; only the E2E test path uses a bypass.
- Live smoke is INCONCLUSIVE on timeout (90 s buffer before spec timeout).
  A timeout means the ChatGPT wait-state was not triggered, not that the
  adapter failed.
- No production API key is seeded locally. See `LOCAL_REAL_API_SMOKE_MODE.md`
  for the blockers.
- Not production-ready. Alpha status only.
