# DRYRUN-001 -- Real ChatGPT Runtime Path Investigation

**Status:** Diagnostics added; real-runtime root cause NOT yet confirmed.
**Branch:** claude/ecstatic-maxwell-h0d8d8
**Scope:** Real ChatGPT runtime diagnostics only. No new platform support. No ChatGPT
login/prompt automation. No page content read.

---

> Privacy reminder: this document records source-code findings and test results only.
> No ChatGPT prompt text, response text, or personal data appears anywhere below.

---

## Summary

The packaged extension's `dryrun:001:selftest` passes: the sponsored banner renders
correctly in a controlled headless-Chromium fixture using internal-beta demo mode, with
no API configuration. A real human tester loading the same packaged artifact on real
chatgpt.com still did not see the banner. This document reviews the real-ChatGPT-specific
runtime path in source, identifies what is confirmed, what is ruled out, what is plausible
but unconfirmed, and what remains genuinely unknown without live diagnostic data from the
next rerun.

**This investigation does not claim to have found "the" root cause.** Its purpose is to
narrow the search space with source evidence and to ship the live diagnostics
(`docs/internal-beta/dry-runs/...`, `src/diagnostics/dryrun-diagnostics.ts`) needed to
resolve the remaining unknowns on the next rerun, rather than guessing further from source
alone.

---

## Investigation Questions (source-backed answers)

### 1. Does the content script match `https://chatgpt.com/*`?

**Yes, confirmed.** `apps/browser-extension/manifest.json`:
```json
"content_scripts": [
  { "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*"],
    "js": ["dist/content/chatgpt.js"], "run_at": "document_idle" }
]
```

### 2. Does it need `https://chat.openai.com/*` too?

**Already present** (see above) -- both hostnames are declared in the manifest and in
`CHATGPT_HOSTNAMES` (`src/adapters/chatgpt/chatgpt.selectors.ts`). No gap found here.

### 3. What code decides platform = ChatGPT?

`ChatGPTAdapter.canActivate()` (`src/adapters/chatgpt/chatgpt.adapter.ts` lines 76-79):
```ts
async canActivate(): Promise<boolean> {
  const hostname = this.getHostname();
  return (CHATGPT_HOSTNAMES as readonly string[]).includes(hostname);
}
```
`getHostname()` defaults to `window.location.hostname`. (A separate, unrelated
`platform-detector.ts` / `detectPlatformFromHostname()` exists but is used only by the
generic `claude.ts`/`gemini.ts` content scripts via `_content-main.ts` -- `chatgpt.ts`
does not import or use it.)

### 4. What code activates the ChatGPT adapter?

`src/content/chatgpt.ts`: `new ChatGPTAdapter()` -> `adapter.canActivate()` -> (as of this
change) diagnostics update -> kill-switch check (`CHECK_ADAPTER_STATUS` message) ->
`adapter.start()`, which calls `ChatGPTWaitStateDetector.start()` to attach a
`MutationObserver`.

### 5. What selector/wait-state condition is used?

`CHATGPT_PROCESSING_SELECTORS` (`chatgpt.selectors.ts`):
```ts
["[data-testid='stop-button']", "button[aria-label='Stop generating']"]
```
`ChatGPTWaitStateDetector` (`chatgpt.wait-state.ts`) observes `document.body` with a
`MutationObserver`, throttled to 150ms, and declares a wait-state start/end based on
`document.querySelector(sel)` presence for either selector. Source comments explicitly
flag `data-testid='stop-button'` as **STABILITY RISK (high)** -- OpenAI can change this
attribute across UI releases without notice.

### 6. What happens if ChatGPT is logged out?

**No code path detects login state.** Privacy rules forbid reading DOM text or page
content beyond the two structural selectors above, and no login-related selector exists
anywhere in the codebase (confirmed by reviewing `chatgpt.selectors.ts` and
`chatgpt.wait-state.ts` in full). If the tester is logged out, the two processing
selectors simply never appear (no generation ever starts on a login/signup screen), so
`wait_state_detected` stays `false` indefinitely. **This is a genuine blind spot**: the
extension (and the new diagnostics) cannot distinguish "logged out" from "logged in but
hasn't sent a prompt yet" or "selector drift." `last_error_code:
"unsupported_logged_out_state"` exists in the new diagnostic type for this reason, but is
intentionally **never auto-set** by the extension -- adding real detection would require
observing additional DOM structure beyond the two privacy-approved selectors, which is out
of scope for this investigation. The tester-facing checklist instead asks the human to
confirm login status directly (see `dryrun-001-live-checklist.js`).

### 7. What happens after SPA navigation / new chat?

**Plausible, not confirmed as a cause.** Chrome injects manifest-declared content scripts
once per full document navigation matching the URL pattern; it does NOT re-inject on
SPA-internal client-side route changes (e.g. clicking "New chat" via `pushState`).
`ChatGPTWaitStateDetector`'s `MutationObserver` is attached to `document.body` for the
lifetime of the loaded document, so it should continue observing regardless of client-side
navigation, and clicking "New chat" does not reload the page. This reasoning is
source-consistent but **cannot be fully confirmed without live telemetry**, since we
cannot inspect chatgpt.com's actual DOM behavior during a route transition from source
alone.

### 8. Does dry-run demo mode initialize in the real loaded extension?

**Yes, conditionally.** `service-worker.ts`'s `chrome.runtime.onInstalled` listener writes
`dryRunDemoMode: true` and `dryRunDiagnosticsEnabled: true` only when `reason === "install"`
AND the build was compiled with `PROMPTPROFIT_BUILD_MODE === "internal-beta"` (confirmed
present in the packaged internal-beta ZIP's service worker; confirmed ABSENT in a minified
production-mode build -- see Verification below).

**Plausible, unconfirmed risk:** `onInstalled` fires with `reason: "install"` only for a
genuinely new extension ID. Unpacked extension IDs are derived from the loaded folder path.
If a tester re-extracts a new ZIP into the SAME folder path used by a previous DRYRUN-001
attempt, Chrome may treat the reload as an "update" rather than an "install", in which case
`dryRunDemoMode`/`dryRunDiagnosticsEnabled` would never be (re)written, silently reproducing
the original "no API config" failure mode even after the fix. This is now directly
observable: the live diagnostics panel's `dry_run_demo_mode` field and the
`missing_api_config` / `"Generation detected; API not configured"` status will surface
this immediately on rerun instead of looking identical to any other failure.
`dryrun-001-live-checklist.js` now explicitly tells the tester to unzip into a NEW folder
to avoid this.

### 9. Does content script request ad decision only after wait-state?

**Yes, confirmed.** In `chatgpt.ts`, the only `GET_AD_DECISION` message send is inside
`adapter.onWaitStateStart(async (event) => { ... })`. No other code path requests it.

### 10. Can banner render be missed if generation is short?

**Plausible, not confirmed -- this is the leading working hypothesis.** The full path from
wait-state start to banner-visible is: MutationObserver fires (150ms throttle) ->
`chrome.runtime.sendMessage("GET_AD_DECISION")` round-trip through the service worker (fast
in demo mode; a real network fetch otherwise) -> `adapter.renderSponsoredMoment()` ->
DOM insertion. For the original approved prompt ("Count slowly from 1 to 10.") on real
ChatGPT, total generation time can plausibly be under one second. If `onWaitStateEnd`
fires (the stop-button disappears) before the async `GET_AD_DECISION` round-trip and render
complete, `adapter.onWaitStateEnd()` unconditionally calls
`adapter.removeSponsoredMoment()` -- so the banner could render and be removed within a
very short window, easily perceived by a human as "no banner appeared." This is exactly
why Phase 5 of this mission adds a **longer recommended prompt**
("Count slowly from 1 to 100, one number per line.") and why the new
`wait_state_duration_ms` diagnostic field exists: the next rerun can directly show whether
the wait-state ended before the banner became visible.

### 11. Can CSS/z-index hide the banner?

**Plausible, not confirmed.** `ChatGPTRenderer` uses `z-index:2147483647` (the maximum
32-bit signed integer) and appends its container directly to `document.body`
(`chatgpt.renderer.ts`). This should out-rank any z-index on chatgpt.com's own elements
under normal stacking rules, UNLESS an ancestor of `document.body` establishes a new CSS
stacking context (e.g. via `transform`, `filter`, `contain`, or `isolation` on `<html>` or
`<body>` itself) that traps the banner inside a lower-priority context. This cannot be
ruled out or confirmed from source alone, since it depends on chatgpt.com's live computed
styles, which this investigation does not (and per privacy rules, should not) inspect
directly. This is precisely why the new diagnostics separate `banner_rendered` ("in the
DOM") from `banner_visible` (`getBoundingClientRect()` has non-zero width/height) --
the next rerun's panel will show if this is happening.

### 12. Is a previous close/dismiss state stored and suppressing the banner?

**Ruled out, confirmed.** `ChatGPTRenderer`'s close button handler
(`chatgpt.renderer.ts`) only calls `this.remove()` (and, as of this change, an `onClose`
callback for diagnostics) -- it never writes to `chrome.storage.local`. No code anywhere
in the adapter, renderer, or service worker reads or writes a persisted "previously
dismissed" flag. Each new wait-state start renders a fresh banner regardless of whether a
previous one was closed.

### 13. Can kill-switch still suppress banner?

**Yes, confirmed as a real (if unlikely) contributing possibility.** `chatgpt.ts` checks
`CHECK_ADAPTER_STATUS` before starting the adapter; if `killSwitchEnabled` is `true` for
`browser_chatgpt` (or globally), the content script returns before `adapter.start()` is
ever called -- no wait-state detection, no banner, ever. The `onInstalled` fix (from
commit 682276f) writes safe defaults (`killSwitchEnabled: false`) only on a fresh
`"install"` -- the same "reused folder = treated as update" risk noted in Q8 applies here
too. Confirmed via source and via the existing E2E test `disabled adapter (kill-switch)
shows no banner` plus the new `kill-switch active updates kill_switch_active and
suppresses the banner` fixture test. The live diagnostics panel's `kill_switch_active`
field and `"Kill-switch active -- banner suppressed"` status make this immediately visible
on rerun instead of looking identical to any other failure.

---

## Additional Finding (not one of the 13 questions, found during this review)

**`docs/internal-beta/TESTER_QUICK_START_CHECKLIST.md`, Track B (Engineer), Step 8**
previously instructed engineers testing from a local repo checkout to:
> "Click 'Load unpacked' -> select `apps/browser-extension/dist/`"

This is **the same class of bug as the previously-fixed RC-1** (wrong load folder), but in
a different document and for a different tester track. `apps/browser-extension/dist/` does
NOT contain `manifest.json` (confirmed: `ls apps/browser-extension/dist/manifest.json` ->
No such file); `manifest.json` lives at `apps/browser-extension/manifest.json`, one level
up, with `dist/` as a relative subfolder it references. Loading `dist/` directly would
fail in Chrome with "manifest.json is missing." This has been fixed in this change (see
Phase 8 doc updates below). There is no evidence a Track B (engineer) tester was actually
used for the failed DRYRUN-001 rerun described in this mission (the packaged-ZIP selftest
result implies Track A), so this is filed as a **secondary, independently-confirmed bug**,
not the primary cause of the reported failure.

---

## What Was Ruled Out (confirmed by source + selftest)

| Hypothesis | Status |
|------------|--------|
| Wrong "Load unpacked" folder (ZIP) | Ruled out -- `check:browser:load-folder` passes |
| Kill-switch defaults to ON on fresh install | Ruled out for a genuine fresh install -- `onInstalled` fix verified by selftest |
| Missing `apiBaseUrl` / no API configured | Ruled out as a hard blocker -- demo mode removes this dependency; selftest runs with NO `apiBaseUrl` and still renders the banner |
| Extension fails to load / manifest invalid | Ruled out -- selftest loads the same packaged artifact successfully |
| Persisted "previously dismissed" state suppressing banner | Ruled out -- no such storage write exists anywhere in the codebase |
| Content script missing `chat.openai.com` match | Ruled out -- both hostnames present in manifest and selectors |

## What Remains Plausible But NOT Confirmed

| Hypothesis | Why it's plausible | How the next rerun will confirm/refute it |
|------------|--------------------|--------------------------------------------|
| Very short generation causes banner to render-then-remove almost instantly | Async round-trip (150ms throttle + GET_AD_DECISION) vs. a possibly sub-second real ChatGPT response to a 10-count prompt | `wait_state_duration_ms` + longer recommended prompt (Phase 5) |
| Wait-state selector (`stop-button` / `Stop generating`) has drifted on live ChatGPT | Source comments explicitly flag this as STABILITY RISK (high); cannot be verified without live DOM access | Diagnostics panel stuck at "Waiting for generation state" after a prompt is sent |
| `dryRunDemoMode`/kill-switch defaults not written because Chrome treated a reload as "update" not "install" | Reusing an extraction folder path across attempts is a realistic tester behavior | `dry_run_demo_mode` field directly visible in panel; status "Generation detected; API not configured" |
| CSS/stacking-context conflict hides a DOM-present banner | `z-index:2147483647` should win under normal rules, but ancestor stacking contexts could still trap it | `banner_rendered: true` + `banner_visible: false` distinguishes this precisely |

## What Remains Genuinely Unknown

- Whether real chatgpt.com's DOM structure during SPA "New chat" navigation ever
  temporarily detaches/reattaches `document.body` in a way that could disconnect the
  `MutationObserver`. Source review cannot confirm or refute this without live inspection.
- Whether the tester's specific browser/OS/Chrome version has any extension-loading
  quirk not covered by the existing checklist.
- Whether the tester was, in fact, logged in (per Q6, the extension cannot detect this
  itself by design; the human must confirm it, which `dryrun-001-live-checklist.js` now
  makes an explicit, separate checklist item).

---

## Tests Added

- `apps/browser-extension/src/__tests__/dryrun-diagnostics.test.ts` -- 31 unit tests:
  default state, `update()` behavior, privacy-safety (no forbidden field names),
  `computeStatusLabel()` for every documented state transition, `getBuildMode()` safety
  outside a bundled context.
- `apps/browser-extension/e2e/dryrun-diagnostics.smoke.spec.ts` -- 8 fixture E2E tests:
  panel visibility gating, adapter/wait-state/ad-decision/banner state transitions,
  close-button tracking, kill-switch suppression, panel-disabled-by-default behavior,
  and a DOM-level scan for forbidden attribute names.
- `apps/browser-extension/src/adapters/chatgpt/__tests__/chatgpt.adapter.test.ts` --
  added a test proving `renderSponsoredMoment` forwards an `onClose` callback to the
  renderer (needed for `banner_closed` tracking) and fixed a pre-existing test whose
  expected call signature was stale after this change.
- `scripts/audit-browser-extension-zip.js` Check 3b -- decompresses the actual shipped
  JS in a packaged ZIP and fails a public-release build if any internal-beta-only string
  (`dryRunDemoMode`, `DEMO_AD_DECISION`, `dryRunDiagnosticsEnabled`, the diagnostics panel
  ID, or the literal `"internal-beta"`) is found.

## Next Rerun Criteria

Before scheduling another human DRYRUN-001 attempt:

- [ ] `pnpm -w run dryrun:001:selftest` passes (packaged artifact banner-render gate)
- [ ] `pnpm -w run dryrun:001:live-checklist` has been read by the owner and shared with the tester
- [ ] Tester unzips into a NEW folder (not reused from a previous attempt)
- [ ] Tester confirmed logged into chatgpt.com before starting
- [ ] Tester uses the recommended longer prompt: "Count slowly from 1 to 100, one number per line."
- [ ] If the banner does not appear: the diagnostic panel's exact status line and
      `last_error_code` are recorded verbatim in the result log -- not a guess

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
