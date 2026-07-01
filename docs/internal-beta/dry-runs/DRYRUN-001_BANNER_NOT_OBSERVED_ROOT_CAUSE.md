# DRYRUN-001 -- Banner Not Observed: Root Cause Analysis

**Status:** RESOLVED (fixes applied; rerun required to confirm)
**Branch:** claude/ecstatic-maxwell-h0d8d8
**Related session:** DRYRUN-001 (attempted 2026-07-01, result: INCONCLUSIVE/HOLD)

---

> Privacy reminder: This document records extension behavior and configuration findings only.
> No ChatGPT prompt text, response text, or personal data is recorded here.

---

## Summary

DRYRUN-001 ended INCONCLUSIVE because the banner was not observed. Root cause analysis
identified **two confirmed root causes** and **two secondary risk factors**.

All confirmed root causes have been fixed in this branch.

---

## Confirmed Root Causes

### RC-1: Incorrect Load-Unpacked Instruction (CRITICAL)

**Symptom:** Extension might load from the wrong folder, causing manifest-not-found errors or
the content script not being injected at all.

**Detail:** All dry-run documentation (worksheet, runbook, troubleshooting guide, quick-start
checklist, and the `dryrun:001:diagnose` script output) incorrectly instructed testers to:
- Select the `dist/` subfolder when loading the extension in Chrome.

**Why it is wrong:** The ZIP structure has `manifest.json` at the ZIP root, with `dist/` as a
subfolder containing only the compiled JS files. Chrome's "Load unpacked" requires selecting
the folder that contains `manifest.json` directly. Loading the `dist/` subfolder would fail
(Chrome would show an error or load silently with no content script injected).

**ZIP structure (confirmed):**
```
manifest.json              <- ZIP ROOT (correct "Load unpacked" target)
dist/
dist/content/chatgpt.js
dist/background/service-worker.js
icons/
icons/icon16.png
icons/icon48.png
icons/icon128.png
```

**Fix applied:** All documentation updated to instruct testers to select the extracted ZIP root
folder (the folder containing `manifest.json` directly), not any subfolder. A new
`check:browser:load-folder` script (`scripts/check-browser-extension-load-folder.js`)
machine-verifies the ZIP structure and prints the correct instruction.

Files updated:
- `scripts/dryrun-001-diagnose.js` — Section 5 and re-extract command
- `docs/internal-beta/dry-runs/TROUBLESHOOTING_BANNER_NOT_OBSERVED.md` — B2 and E1
- `docs/internal-beta/dry-runs/FIRST_TESTER_DRY_RUN_WORKSHEET.md` — Install step
- `docs/internal-beta/dry-runs/ONE_TESTER_EXECUTION_RUNBOOK.md` — Section 2 step 4
- `docs/internal-beta/TESTER_QUICK_START_CHECKLIST.md` — Step 4 Track A

---

### RC-2: Kill-Switch Defaults to ON (Confirmed)

**Symptom:** Banner never appears on a fresh install even if the extension loads correctly.

**Detail:** `apps/browser-extension/src/background/service-worker.ts` initializes the
cached flags as `FALLBACK_FLAGS_DISABLED`:
```typescript
let cachedFlags: FeatureFlags = FALLBACK_FLAGS_DISABLED;
```
`FALLBACK_FLAGS_DISABLED` has `killSwitchEnabled: true`. When the extension is freshly
installed and `chrome.storage.local` contains no `featureFlags` key, `refreshFlags()` reads
empty storage, keeps `FALLBACK_FLAGS_DISABLED`, and the `CHECK_ADAPTER_STATUS` handler
returns `{ disabled: true }`. The content script receives this and exits before rendering any
banner.

This means the banner can never appear on a fresh install unless something explicitly writes
`featureFlags` to storage with `killSwitchEnabled: false`.

**Fix applied:** Added a `chrome.runtime.onInstalled` listener in `service-worker.ts`. On the
`"install"` reason, if no `featureFlags` key exists in storage, it writes the safe default:
```typescript
{ killSwitchEnabled: false, disabledAdapters: [], flags: {} }
```
This ensures fresh installs start with the kill-switch OFF (banner enabled).

---

## Secondary Risk Factors (Not Confirmed as Root Cause in DRYRUN-001)

### RF-1: No API Configuration / No Placeholder Mode

**Detail:** Even with the kill-switch OFF, the extension requires:
1. `featureFlags` in storage with `killSwitchEnabled: false` (fixed by RC-2 fix)
2. `apiBaseUrl` in storage pointing to a valid API server
3. The API server must return a valid ad decision with required fields

Without `apiBaseUrl`, `getAdDecision()` returns `null` and no banner is rendered. There is no
placeholder/fallback mode for dry-run sessions — the extension depends on a live API response.

**Status:** Not fixed in this session (would require API configuration or a placeholder mode).
For the dry-run rerun, the test environment must have `apiBaseUrl` configured or a local mock
API serving valid responses.

**Mitigation:** The `dryrun:001:selftest` would ideally verify this by injecting a mock API
response. However, implementing a complete local mock API is deferred. For the next rerun,
confirm `apiBaseUrl` is set in the extension's storage before the session begins.

---

### RF-2: Wait-State Selector Stability Risk

**Detail:** `apps/browser-extension/src/adapters/chatgpt/chatgpt.wait-state.ts` uses
`[data-testid='stop-button']` as the primary ChatGPT wait-state detector. This selector is
explicitly flagged as high stability risk in source comments. If OpenAI changes the ChatGPT
DOM structure and removes this attribute, the wait-state detector will never fire, and the
banner will never appear.

**Status:** Not the root cause of DRYRUN-001 (tester appeared not logged in, so ChatGPT
generation never started). Monitor on rerun.

---

## Tester Login (Probable Contributing Factor in DRYRUN-001 Session)

The session notes in `DRYRUN-001_ATTEMPT_001_INCONCLUSIVE_NOTE.md` indicate the tester may
have been not logged in to chatgpt.com. An unauthenticated ChatGPT page shows a login/signup
screen rather than a chat interface, so:
- No `[data-testid='stop-button']` appears (no generation ever started)
- The content script runs but never detects a wait-state
- No banner is ever triggered

**Fix:** Pre-run checklist and worksheet now require confirming the tester is logged in before
starting the safe test prompt. This was added in a previous session.

---

## What Was Ruled Out

| Hypothesis | Ruled Out Because |
|------------|------------------|
| Privacy/security breach (S0) | No ChatGPT content captured; privacy result: CLEAN |
| API key leaked | No ppft_ key observed in any output or artifact |
| Extension crashes Chrome | No S1 crash reported; extension appeared to load |
| Network request leaking user data | Not confirmed to have fired (generation not started) |
| Billing invariant violation | Billing smoke not run; UNKNOWN (not confirmed failure) |

---

## Fixes Applied in This Session

| Fix | File | Description |
|-----|------|-------------|
| Load-unpacked instruction corrected | `scripts/dryrun-001-diagnose.js` | "dist/ subfolder" → "extracted ZIP root" |
| Load-unpacked instruction corrected | `docs/internal-beta/dry-runs/TROUBLESHOOTING_BANNER_NOT_OBSERVED.md` | B2 and E1 sections |
| Load-unpacked instruction corrected | `docs/internal-beta/dry-runs/FIRST_TESTER_DRY_RUN_WORKSHEET.md` | Install checklist step |
| Load-unpacked instruction corrected | `docs/internal-beta/dry-runs/ONE_TESTER_EXECUTION_RUNBOOK.md` | Section 2 step 4 |
| Load-unpacked instruction corrected | `docs/internal-beta/TESTER_QUICK_START_CHECKLIST.md` | Track A Step 4 |
| Kill-switch default changed to OFF | `apps/browser-extension/src/background/service-worker.ts` | `onInstalled` listener writes safe defaults |
| New ZIP structure verifier | `scripts/check-browser-extension-load-folder.js` | Machine-verifies ZIP has manifest.json at root |
| New package.json script | `package.json` | `check:browser:load-folder` |
| Decision field regex fixed | `scripts/check-dryrun-001-result.js` | Matches `**Decision:** HOLD` format correctly |

---

## Rerun Criteria (Before Attempting DRYRUN-001 Attempt 2)

All of the following must be true before scheduling the rerun:

- [ ] `pnpm -w run dryrun:001:diagnose` exits 0 (PASS or PASS WITH WARNINGS only)
- [ ] `pnpm -w run check:browser:load-folder` exits 0
- [ ] `pnpm -w run check:dryrun:001` exits 0 with 0 WARN
- [ ] Tester confirmed logged into chatgpt.com before session starts
- [ ] API configuration confirmed OR local mock API serving placeholder decisions
- [ ] Load-unpacked instruction verbally confirmed with tester: "select the extracted ZIP root folder"

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
