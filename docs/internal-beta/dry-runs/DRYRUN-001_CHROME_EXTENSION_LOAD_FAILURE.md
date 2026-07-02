# DRYRUN-001 -- Chrome Extension Load Verification Failure Investigation

**Status:** Root cause identified and fixed for the verification-side bug.
**Does NOT claim:** DRYRUN-001 passed, public release readiness, or production readiness.

## Reported symptom

`pnpm -w run dryrun:001:launch-chrome` built and verified a fresh package
correctly (build-info commit matched HEAD, buildMode=internal-beta,
forced-fallback marker present), launched Chrome, and confirmed CDP was
reachable -- but then reported:

```
Mode A failed
Mode B failed
Extension registration verified: NO
Blocked reason: extension-service-worker-not-found
CDP targets seen: {"background_page":1,"page":1,"service_worker":1}
```

with `chrome://extensions` visibly showing no PromptProfit entry.

## Root cause

The previous launcher's ONLY registration check was: does a CDP
`service_worker`-type target exist whose URL ends in the manifest's
declared `background.service_worker` path
(`dist/background/service-worker.js`), matched via
`parseExtensionServiceWorkerTargets`.

This has two independent failure modes, both of which the reported CDP
target counts are consistent with:

1. **MV3 service workers go idle.** Chrome terminates an inactive MV3
   service worker (commonly within seconds to ~30s of no activity) to save
   resources. A terminated worker's CDP target disappears from
   `GET /json/list` entirely until an event wakes it again. A single
   snapshot poll can therefore see zero `service_worker` targets for an
   extension that loaded correctly and registered its worker moments
   earlier -- the worker just isn't *currently* alive when polled.
2. **The reported target counts include `background_page:1`.** This
   extension's `manifest.json` declares an MV3 `background.service_worker`,
   not an MV2 `background_page` -- a `background_page` target in that
   report is not PromptProfit's own background context at all. It is
   consistent with one of Chrome's own built-in component extensions (the
   PDF Viewer and similar ship with Chrome and register their own
   background/service-worker targets in every fresh profile). The old
   suffix-matching logic had no way to distinguish "our worker, currently
   idle" from "a different extension's worker/page entirely" -- it only
   matched on URL *suffix*, not on *which extension* the target actually
   belongs to.

In short: **CDP service-worker-target matching alone is not sufficient
proof of load or non-load.** A real, correctly-loaded extension can show
zero matching targets at the moment of polling; an unrelated extension can
show target types superficially similar to what the old code was scanning
for.

## Fix: deterministic extension ID + multi-layer verification

Chromium computes the ID for an *unpacked* extension deterministically from
its absolute install path: SHA-256 the path string (UTF-8, OS-native
separators, no trailing slash), take the first 32 hex characters, map each
hex nibble (0-15) to a letter (`a`-`p`).

This was verified empirically against real Chrome (141.0.7390.37) output
for multiple extraction paths in this session -- not assumed from
documentation:

| Extraction path (abbreviated) | Predicted ID (`computeUnpackedExtensionId`) | Chrome's actual assigned ID |
|---|---|---|
| `.../promptprofit-dryrun-extract-...-3347` | `knjjfhgannogeempolgkbfgfikofofco` | `knjjfhgannogeempolgkbfgfikofofco` (match) |
| `.../promptprofit-dryrun-extract-...-13353` | `ednifkadnmfakingpajgggecpipibhda` | `ednifkadnmfakingpajgggecpipibhda` (match) |
| `.../promptprofit-dryrun-extract-...-10214` | `pdehlfikginlbllelieofpccagjaoieg` | `pdehlfikginlbllelieofpccagjaoieg` (match) |

Knowing the exact ID in advance means every verification layer can look for
*our* extension specifically, instead of guessing from target-type/URL
shape which of several similar-looking targets is ours. `scripts/dryrun-001-launch-chrome.js`
now proves load through four independent layers:

- **Layer 1 -- CDP targets by predicted ID** (`parseExtensionTargetsById`):
  any target (service worker, background page, or an extension-owned page)
  at `chrome-extension://<predicted-id>/...`. Not required to be a live
  service worker.
- **Layer 2 -- profile Preferences** (`extractPromptProfitPreferencesEntry`
  / `evaluatePreferencesEvidence`): reads *only*
  `extensions.settings[<predicted-id>]` from `<profile>/Default/Preferences`
  -- never history/cookies/sessions/tokens, which live in entirely separate
  files this script never opens. This persists on disk independent of
  whether any CDP target is currently alive, so it is immune to the MV3
  idle-worker gap Layer 1 alone has.

  **Empirical correction made during this session:** the initial
  implementation assumed Preferences embeds a `manifest.name` field per
  extension entry (as several older Chrome/community references suggest).
  Verified against a real Chrome 141 profile after `--load-extension`, the
  actual entry has **no `manifest` key at all** -- only `path`, `location`,
  `state`, `creation_flags`, etc. `evaluatePreferencesEvidence` was
  corrected to treat `manifest.name` as optional evidence (checked only
  when present) and rely on the `path` field -- already uniquely tied to
  the predicted ID via the SHA-256 algorithm above -- as the primary,
  sufficient identification signal. Both the "manifest present" and
  "manifest absent, real-world" shapes are covered by dedicated unit tests.
- **Layer 3 -- manifest resource probe** (`probeExtensionManifestResource`):
  opens a throwaway tab at `chrome-extension://<id>/manifest.json` via the
  CDP HTTP `PUT /json/new` endpoint and confirms its content parses as JSON
  with `name === "PromptProfit"` (an invalid/unregistered ID instead serves
  Chrome's error page, whose body is not valid JSON). Additional
  confirmation only -- never gates registration on its own.
- **Layer 4 -- runtime DOM on chatgpt.com** (`verifyRuntimeOnChatGpt`):
  once registered, reads *only* the two extension-owned elements
  (`#promptprofit-sponsored-banner`, `#promptprofit-dryrun-diagnostics`)
  and their own `data-*` attributes via a real CDP `Runtime.evaluate` call
  against the chatgpt.com tab -- never the page's title, URL, or any other
  DOM. `findPageTargetExcludingExtensions` picks that tab structurally
  (`type === "page"` and not a `chrome-extension://` URL) without ever
  reading its title or full URL.

`registered = Layer 1 OR Layer 2` (deliberately redundant, so a transient
gap in either alone does not produce a false BLOCKED). The final state is a
pure decision table (`classifyLaunchOutcome`): `PASS` only when registered
**and** Layer 4 confirms the runtime; `BLOCKED_EXTENSION_LOAD` when not
registered; `BLOCKED_RUNTIME` when registered but Layer 4 never confirms;
`BLOCKED_POLICY` when not registered and a Windows policy signal (below)
was detected.

## Assisted manual-load mode

If mode A (`--disable-extensions-except` + `--load-extension`) and mode B
(`--load-extension` alone) both fail Layer 1/2 registration, the launcher
no longer just prints a generic failure. It automatically:

1. Opens `chrome://extensions` in the **same** already-running Chrome
   window (via the CDP HTTP `PUT /json/new?chrome://extensions/`
   endpoint).
2. Opens a file browser at the exact extracted extension folder
   (`explorer.exe` on Windows, `open` on macOS, `xdg-open` on Linux --
   best-effort, non-fatal if unavailable).
3. Copies that exact folder path to the clipboard (`clip`/`pbcopy`/
   `xclip`/`xsel` -- best-effort, non-fatal).
4. Polls the same Layer 1/2 registration check every 2 seconds for up to 2
   minutes, printing progress dots, and continues automatically the moment
   registration is detected -- the human never has to tell the script they
   are done, and never has to locate a ZIP or folder themselves.
5. Times out cleanly with `BLOCKED_EXTENSION_LOAD` and the same exact-path
   remediation if the human doesn't complete the manual load in time.

## Windows policy detection

`checkWindowsExtensionPolicy()` is a Windows-only, best-effort check (a
silent no-op on every other platform) that reads a small, specific set of
`reg query` value names known to control unpacked/developer-mode extension
loading, under:

- `HKLM\Software\Policies\Google\Chrome`
- `HKCU\Software\Policies\Google\Chrome`
- `HKLM\Software\Policies\Chromium`
- `HKCU\Software\Policies\Chromium`

It reads only `DeveloperToolsAvailability`, `ExtensionDeveloperModeSettings`,
and `BlockExternalExtensions` -- never any other policy or any browsing
data. If a value matching a known-blocking setting is found and the
extension never registers, the final state is reported as
`BLOCKED_POLICY` with the exact value(s) found, instead of a generic
extension-load failure that would send a tester down the wrong remediation
path.

## Validated in this session

- **Real end-to-end runs** against the bundled Chromium in this dev
  container: `dryrun:001:launch-chrome` correctly built a fresh package,
  computed the predicted extension ID, launched Chrome, and (via Layer 1 +
  Layer 3) confirmed registration with a real extension ID and a
  JSON-confirmed manifest probe.
- **Layer 4 mechanics validated independently of chatgpt.com.** This
  sandboxed dev container's outbound network policy blocks `chatgpt.com`
  entirely (its HTTPS proxy returns `403 Forbidden` for that host --
  confirmed via `curl -v https://chatgpt.com/`), so the live launcher runs
  in this environment correctly and honestly report `BLOCKED_RUNTIME`
  (extension registered, but the banner/diagnostics never appeared, because
  the tab never successfully loaded chatgpt.com at all). To verify Layer
  4's actual CDP-probing code is correct independent of that network
  restriction, `scripts/__tests__/dryrun-001-runtime-verification.integration.test.js`
  launches real Chrome pointed at a local static HTML fixture containing
  the exact extension-owned elements/attributes a real content script would
  produce, and confirms the probe correctly reports `bannerVisible: true`
  and reads the diagnostics `data-*` fields when they exist, and correctly
  reports `ok: false` when neither element is present. **This does not
  itself prove the real content script renders correctly on real
  chatgpt.com** -- that is already covered separately by the existing
  27/27 `pnpm -w run smoke:chatgpt:fixture` suite -- it proves this
  session's new CDP-reading code reads what's actually there correctly.
- **Preferences schema corrected against real output**, not assumed (see
  Layer 2 above).

## What this does NOT prove

- This does not prove PromptProfit loads or renders correctly on a real
  Windows machine with a real Chrome install and real internet access --
  only that the verification logic itself is now evidence-based across
  four independent signals instead of one fragile one, and has been
  validated against real Chrome behavior everywhere this sandboxed
  container's own constraints (no display, root user, blocked outbound
  network to chatgpt.com) allow.
- A human tester session on a real machine is still required to close
  DRYRUN-001. This document records why the launcher's own verification
  was unreliable and what was fixed -- it is not itself a dry-run result.
