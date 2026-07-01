# DRYRUN-001 -- Definitive Internal-Beta Banner Fix

**Status:** Implemented; human rerun required to confirm.
**Branch:** claude/ecstatic-maxwell-h0d8d8
**Scope:** Internal-beta dry-run only. No production behavior change. No new platform support.

---

> Privacy reminder: this document records source-code and architecture decisions only.
> No ChatGPT prompt text, response text, or personal data appears anywhere below.

---

## Why the Previous (Diagnostics-Only) Fix Was Insufficient

Commit 39a4577 added a live diagnostics panel and root-cause investigation, but it did
**not** change what makes the banner appear. Confirmed by re-reading the runtime path
before this change:

`chatgpt.ts`'s only path to `renderSponsoredMoment()` was:

```
adapter.canActivate()           -- hostname check
  -> adapter.start()            -- attaches MutationObserver
    -> onWaitStateStart fires   -- REQUIRES CHATGPT_PROCESSING_SELECTORS to match live DOM
      -> GET_AD_DECISION        -- service-worker round-trip (fast in demo mode, but still gated
                                    behind wait-state firing at all)
        -> renderSponsoredMoment()
```

Every diagnostic field added previously (`wait_state_detected`, `ad_decision_received`,
`banner_rendered`, etc.) could tell a tester **where** this chain stopped, but the chain
itself was never changed. If ChatGPT's live DOM selector
(`[data-testid='stop-button']` / `button[aria-label='Stop generating']`) didn't match, or
generation was too fast, or `onWaitStateEnd` fired before the async round-trip completed
(see `DRYRUN-001_REAL_CHATGPT_RUNTIME_INVESTIGATION.md`, Q10), the banner still would not
appear on real ChatGPT -- diagnostics could only report the failure, not prevent it. This
matches exactly what was observed: the packaged selftest (a synthetic fixture where the
selector always matches predictably) passed, while real ChatGPT (where none of those
assumptions are guaranteed) did not.

## The Runtime Path Now Implemented

A second, independent path was added to `chatgpt.ts` / `fixture-test.ts`, running
immediately after `adapter.start()` and entirely in parallel with the wait-state-driven
path described above:

```
PROMPTPROFIT_BUILD_MODE === "internal-beta"
  AND dryRunDemoMode === true (chrome.storage.local, read directly -- no round-trip)
  AND kill-switch check already confirmed OFF (existing CHECK_ADAPTER_STATUS message)
  AND canActivate() already confirmed true (existing hostname check)
    -> render a hardcoded local SponsoredMoment via ChatGPTRenderer, IMMEDIATELY
    -> no wait-state detection required
    -> no GET_AD_DECISION message sent (content local, not fetched)
    -> no apiBaseUrl read or required
    -> stays up >= 12 seconds unless the user closes it (FORCED_FALLBACK_MIN_DISPLAY_MS)
    -> a single boolean (forcedFallbackActive) prevents the normal wait-state path from
       rendering a duplicate banner while this one is showing, AND prevents a real (possibly
       fleeting) wait-state-end event from tearing it down before its minimum window elapses
```

## Why This Is Deterministic

The forced fallback's only dependencies are:
1. A build-time constant (`PROMPTPROFIT_BUILD_MODE`), fixed at package time.
2. Two storage booleans (`dryRunDemoMode`, kill-switch), read directly by the content
   script with no network call.
3. `document.body` existing (guarded by `waitForDocumentBody()`, a defensive retry loop).

None of these depend on ChatGPT's DOM structure, generation speed, or any network
round-trip succeeding. This eliminates every fragile dependency the mission asked to
remove: wait-state selector reliability, generation timing, prompt length, local API
config, ad-decision API availability, and live UI selectors.

## Why This Is Privacy-Safe

- The rendered content (`FORCED_DEMO_MOMENT`) is a hardcoded object literal in the content
  script source -- never derived from page content, DOM text, prompt text, or response text.
- No new DOM reads were added. `isElementVisible()` (already existing) only reads the
  *banner's own* `getBoundingClientRect()`, never ChatGPT's DOM.
- No telemetry is sent for the forced fallback: `sendImpressionRequested` /
  `sendImpressionRendered` / `sendViewabilityThresholdMet` are never called from this code
  path (verified by `e2e/dryrun-diagnostics.smoke.spec.ts`, "forced demo fallback does not
  send billing/event telemetry" -- 0 captured events at the mock API server after render).
- The only message sent to the service worker is the pre-existing `CHECK_ADAPTER_STATUS`
  kill-switch check, which was already required and already privacy-reviewed.

## Why This Is Internal-Beta Only

Every gate uses the literal `PROMPTPROFIT_BUILD_MODE === "internal-beta"` comparison
directly at each call site (not through a function call -- see the code comment history:
an earlier version of this file routed the check through `getBuildMode()`, which broke
esbuild's dead-code elimination because the function call could not be constant-folded).
The forced-fallback object itself (`const diagnostics: DryRunDiagnosticsPanel | null = ...
? new DryRunDiagnosticsPanel() : null`) is only ever constructed inside that same gate.

## Why Production Is Unaffected

Three independent, verified layers:

1. **Dead-code elimination**: `scripts/bundle.mjs` minifies production builds
   (`minify: buildMode === "production"`). esbuild constant-folds
   `"production" === "internal-beta"` to `false` and removes the entire branch, including
   the forced-fallback source text. Verified empirically: `grep` for `demo_fallback_active`,
   `FORCED_DEMO_MOMENT`, `demo-forced-`, `dryRunDemoMode`, `ensureDryRunDefaults`, etc.
   against a production-mode build of `dist/content/chatgpt.js` and
   `dist/background/service-worker.js` returns 0 matches.
2. **Hard release gate**: `scripts/audit-browser-extension-zip.js` Check 3b decompresses
   the actual shipped JS from a packaged ZIP and **fails** `--mode public-release` if any
   of these strings are found -- this is enforcement, not a claim. Confirmed: a
   public-release package built via `pnpm -w run package:browser:public` passes Check 3b
   cleanly; an internal-beta package correctly WARNs (expected there).
3. **Behavioral gate**: even if source text somehow survived, the runtime literal
   comparison means the code path is unreachable unless `PROMPTPROFIT_BUILD_MODE` was
   compiled as `"internal-beta"` at build time -- something only `--build-mode
   internal-beta` (used by `package:browser:beta` and `bundle-test.mjs`) ever sets.

## Answers to Phase 1 Investigation Questions

1. **Guaranteed on chatgpt.com / www.chatgpt.com / chat.openai.com?** `chatgpt.com` and
   `chat.openai.com` were already matched (manifest.json, `CHATGPT_HOSTNAMES`).
   `www.chatgpt.com` has been added to both defensively -- OpenAI does not currently serve
   ChatGPT there, but matching it costs nothing if never visited, and protects against
   future use or an intermediate redirect.
2. **`run_at` correct?** `document_idle` is correct and unchanged -- this is the standard,
   safe choice for MV3 content scripts that need a populated DOM.
3. **Injected on SPA navigation/new-chat routes?** Chrome injects manifest-declared content
   scripts once per matching full-document navigation; it does not re-inject on
   client-side route changes, but it also doesn't need to -- the script (and its
   `MutationObserver`) keeps running for the page's lifetime. Confirmed not a regression
   risk by the new "no duplicate banners...after SPA-like route changes" E2E test, which
   simulates a wait-state cycle firing after the forced fallback is already up.
4. **Can the content script silently exit before the diagnostics panel renders?** This was
   already fixed in the diagnostics-only commit (panel mounts before the `canActivate()`
   early return) and remains correct. Newly hardened further: a `waitForDocumentBody()`
   guard now runs before anything else, so a (rare) not-yet-attached `document.body` no
   longer causes a silent, unrecorded failure.
5. **Can adapter activation fail before fallback banner rendering?** No longer relevant to
   the fallback -- the fallback renders after the SAME `canActivate()`/kill-switch checks
   the normal path already requires, but does not depend on `adapter.start()`'s wait-state
   detector ever firing.
6. **Can `dryRunDemoMode` fail to initialize on install/update?** This was a real gap
   (Phase 5): `onInstalled` previously only handled `reason === "install"`. Fixed: now
   handles both `"install"` and `"update"`, and additionally repairs on every
   service-worker startup -- each write is conditional on the key being genuinely absent
   (`typeof stored[key] !== "boolean"`), never overriding a tester's deliberate choice.
7. **Can previous close/dismiss state suppress the demo banner?** No persistent
   "dismissed" flag exists anywhere in this codebase (confirmed in the prior investigation
   doc). The forced fallback's own dismiss state (`forcedFallbackActive`) is in-memory only,
   scoped to the current page load -- it does not permanently suppress future attempts.
8. **Can the renderer fail because `document.body` is not ready?** Addressed by
   `waitForDocumentBody()` (5 s timeout, 50 ms poll) at the very top of the content script.
9. **Can CSS/z-index hide the banner?** Unchanged from the prior investigation: `z-index:
   2147483647` (max) should out-rank host-page content under normal stacking rules; a
   stacking-context conflict on `<html>`/`<body>` cannot be ruled out from source alone.
   `isElementVisible()` (bounding-rect check) remains the mechanism that would surface this
   on a live rerun via `banner_rendered: true, banner_visible: false`.
10. **Can production dead-code elimination still be verified?** Yes -- see "Why Production
    Is Unaffected" above; verified empirically after every code change in this session, not
    assumed.

## Rerun Criteria

Before scheduling the next human DRYRUN-001 attempt:

- [ ] `pnpm -w run dryrun:001:selftest` passes, specifically reporting
      "PASS: forced internal-beta demo fallback banner rendered"
- [ ] `pnpm -w run dryrun:001:live-checklist` has been read and shared with the tester
- [ ] Tester unzips into a NEW folder (not reused from a previous attempt)
- [ ] Tester confirms the banner appears within seconds of the page loading (NOT only
      during a ChatGPT generation -- this is the key behavior change to communicate)
- [ ] If the banner still does not appear: the diagnostics panel's exact status line
      (top-left corner) and `last_error_code` are recorded verbatim -- this would now
      indicate a genuine extension-load or content-script-injection failure, since the
      wait-state dependency has been eliminated

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
