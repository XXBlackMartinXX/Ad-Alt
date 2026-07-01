# DRYRUN-001 Issue 001: Banner not observed on real ChatGPT despite packaged selftest passing

**DRYRUN-001 | Issue 001**
**Severity:** S1 (Beta blocker)
**Priority:** P1 (Fix before next beta dry-run)
**Area:** area:browser-extension, area:chatgpt-adapter, area:dry-run
**Decision impact:** GO blocked
**Status:** accepted / needs diagnosis

---

> This issue was previously misclassified. See "Triage Correction" below.

---

## Description

After commit 682276f (which added internal-beta demo mode and the automated
`dryrun:001:selftest` gate), DRYRUN-001 was rerun.

- `pnpm -w run dryrun:001:selftest` **PASSED** before the human session. This
  confirms the packaged artifact's banner-rendering code path works correctly
  in a controlled headless-Chromium environment using `dryRunDemoMode: true`
  (no API configuration required).
- A real human tester then loaded the same packaged artifact and ran the
  approved safe test prompt on real chatgpt.com.
- **The PromptProfit banner still did NOT appear.**

This is a materially different situation from the first DRYRUN-001 attempt
(which was plausibly explained by tester setup: wrong load folder, not
logged in, or kill-switch defaulting on). Those causes have since been fixed
and are verified by automated checks:

- `check:browser:load-folder` -- confirms `manifest.json` is at ZIP root (fixed)
- Kill-switch defaults to OFF via `onInstalled` (fixed)
- `dryRunDemoMode` removes the API-configuration dependency entirely (fixed)
- `dryrun:001:selftest` proves the banner renders in the packaged artifact (passing)

Because the packaged selftest passes but the real ChatGPT session still shows
no banner, **setup/environment can no longer explain this failure on its
own**. This is accepted as a real-runtime defect requiring diagnosis, not a
tester-error hypothesis to rule out.

---

## Triage Correction

An earlier pass at classifying this issue incorrectly recorded it at a low
severity/priority (S4/P3). That classification is **incorrect and has been
reverted**:

- "Banner not observed on real ChatGPT despite packaged selftest passing"
  blocks the DRYRUN-001 GO decision by definition -- the core feature under
  test (the sponsored banner) does not work for a real tester, and the
  automated pre-check that was supposed to catch this class of failure did
  not catch it. That is a beta blocker, not a low-priority cleanup item.
- `scripts/dryrun-001-finalize.js` now enforces a hard floor: any issue whose
  title matches the banner failure, filed in a session where
  "banner appeared" was answered "no", cannot be recorded below S1/P1. The
  script auto-files this exact issue at S1/P1 if the tester does not.

---

## Observed Behavior

- `dryrun:001:selftest`: banner renders correctly in demo mode (headless Chromium, synthetic fixture). PASS.
- Real ChatGPT session: tester submitted the approved safe test prompt on real chatgpt.com.
- ChatGPT responded normally.
- No PromptProfit banner/overlay appeared in the bottom-right corner.

## Expected Behavior

While ChatGPT is generating a response, a small overlay banner should appear in the bottom-right
corner of the browser window showing placeholder content (headline, description, display URL, X button) --
exactly as demonstrated by the passing packaged selftest.

---

## What This Rules Out (confirmed by prior fixes + passing selftest)

| Hypothesis | Status |
|------------|--------|
| Wrong "Load unpacked" folder selected | Ruled out -- `check:browser:load-folder` passes; ZIP root confirmed correct |
| Kill-switch defaults to ON on fresh install | Ruled out -- `onInstalled` fix verified; selftest exercises this path |
| Missing `apiBaseUrl` / no API configured | Ruled out -- demo mode removes this dependency entirely; selftest runs with NO `apiBaseUrl` and still renders the banner |
| Extension fails to load / manifest invalid | Ruled out -- selftest loads the same packaged artifact successfully |

---

## Root Cause Hypotheses (in priority order, real-ChatGPT-specific)

1. **Wait-state selector drift**: `CHATGPT_PROCESSING_SELECTORS`
   (`[data-testid='stop-button']`, `button[aria-label='Stop generating']`)
   may no longer match the live chatgpt.com DOM. This selector is explicitly
   flagged as HIGH stability risk in source comments
   (`chatgpt.selectors.ts`). The selftest fixture synthesizes this selector
   directly, so it cannot detect real-DOM drift.
2. **Content-script injection timing on a real SPA**: chatgpt.com is a
   single-page app. If the tester already had a chatgpt.com tab open before
   installing/reloading the extension, or navigated via client-side routing
   rather than a full page load, `document_idle` content scripts may never
   inject. The selftest fixture always does a fresh `page.goto()`, so this
   would not be caught there.
3. **`dryRunDemoMode` not persisting across real install/update flow**:
   `chrome.runtime.onInstalled` only writes `dryRunDemoMode: true` on
   `reason === "install"`. If the tester's browser treated the load as an
   "update" (e.g. reloading an extension ID that previously existed), the
   demo flag would never be written, and `getAdDecision()` would fall through
   to the (unset) `apiBaseUrl` path and return `null`.
4. **Real generation timing vs. MutationObserver throttle**: the 150ms
   throttle interacting with a real, possibly bursty streaming response may
   behave differently than the fixture's synchronous DOM mutation.
5. Actual defect in the overlay rendering/mount logic under real page CSS or
   security policies (e.g. CSP) present on chatgpt.com but not on the
   synthetic fixture page.

---

## Reproduction Steps (for real-runtime diagnosis)

1. Owner runs: `pnpm -w run dryrun:001:selftest` -- confirm it still PASSES (packaged artifact is sound).
2. Tester confirms logged into chatgpt.com (chat interface visible, not "Log in" / "Sign up").
3. Tester loads the extension: chrome://extensions -> Developer Mode ON -> Load unpacked -> select the
   **extracted ZIP root folder** (the folder containing `manifest.json` directly, NOT the `dist/` subfolder).
4. Confirm in `chrome://extensions` that this is a fresh install (not a reload of a previously-loaded ID),
   so `onInstalled` fires with `reason === "install"`.
5. Open a NEW chat.
6. Submit: `Count slowly from 1 to 10.`
7. Watch the bottom-right corner during ChatGPT generation.
8. If no banner: inspect the service worker console (chrome://extensions -> service worker "Inspect")
   for `GET_AD_DECISION` handling and confirm `dryRunDemoMode` is `true` in `chrome.storage.local`.

---

## Environment

- Branch: claude/ecstatic-maxwell-h0d8d8
- Fix commit under test: 682276f (demo mode + selftest)
- Prior attempt: see DRYRUN-001_ATTEMPT_001_INCONCLUSIVE_NOTE.md (different, setup-related failure mode)
- Tester: non-engineer (Track A)

---

## Severity Rationale

| Field | Value |
|-------|-------|
| Severity | S1 (Beta blocker) |
| Priority | P1 (Fix before next beta dry-run) |
| Rollback Needed | NO (no evidence of data exposure; extension can remain installed for diagnosis) |
| Decision impact | GO blocked until root cause is diagnosed and fixed |
| Escalation | QA Owner same business day; Engineering Owner for real-runtime diagnostics |
| Downgrade policy | MUST NOT be downgraded below S1/P1 while it blocks a GO decision (see `dryrun-001-finalize.js` enforcement) |

---

## Evidence Safety

- [x] No ChatGPT prompt text included
- [x] No ChatGPT response text included
- [x] No screenshot with personal data included
- [x] No API key included
- [x] No .env file included
- [x] No cookies or tokens included

---

## Resolution Criteria

**Resolved (downgrade permitted):** Real-runtime diagnostics are added (privacy-safe, no page content),
the exact failure point on real chatgpt.com is identified and fixed, `dryrun:001:selftest` is extended to
cover the identified gap (e.g. real-DOM selector check, install-vs-update path), and a subsequent real
tester session confirms the banner appears on real chatgpt.com.

**Remains S1/P1 until then.** Do not schedule DRYRUN-002 wider distribution while this is open.

---

## Triage Assignment

| Field | Value |
|-------|-------|
| Assigned To | [OWNER TBD -- Engineering + QA Owner] |
| Status | accepted / needs diagnosis |
| GitHub Issue # | [Internal tracking only until resolved] |
| Target Fix Date | [DATE TBD -- before next beta dry-run] |

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
