# DRYRUN-001 Issue 002: Launcher verification false-negative after PromptProfit loaded and rendered

**DRYRUN-001 | Issue 002**
**Severity:** S2 (does not block a real tester; blocks trust in the release-automation tooling)
**Priority:** P2
**Area:** area:release-automation, area:dry-run
**Decision impact:** Does not force HOLD by this project's decision rules; HOLD was chosen
deliberately as a matter of release-process discipline -- see
`docs/internal-beta/dry-runs/GO_NO_GO_DECISION_RECORD.md`.
**Status:** fix implemented, pending real-Windows reconfirmation

---

## Description

During the 2026-07-02 real Windows DRYRUN-001 session, `pnpm -w run dryrun:001:launch-chrome`
reported:

```
BLOCKED_EXTENSION_LOAD
```

even though, in the same session:

- PromptProfit was visible and enabled in `chrome://extensions`.
- The internal-beta live dry-run diagnostics panel was present on chatgpt.com and reported
  `extension_loaded: yes`, `demo_mode: yes`, `platform_detected: chatgpt`,
  `adapter_active: yes`, `demo_fallback_rendered: yes`, `ad_decision_received: yes`,
  `banner_render_attempted: yes`, `banner_visible: yes`.
- The demo sponsored banner was directly visible in the bottom-right corner.

This is a release-AUTOMATION defect, not a product defect: the extension genuinely worked.
The launcher's own verification logic produced a false negative.

---

## Root Cause

The launcher's Layers 1-3 (CDP target lookup, profile Preferences lookup, and a
manifest.json resource probe) are all anchored to a single PREDICTED extension ID,
computed by reproducing Chromium's own algorithm for deriving an unpacked extension's ID
from its absolute install path (hash the path, take the first 32 hex characters, map each
nibble to a letter).

That algorithm was implemented and validated only against this repo's Linux dev-container
Chromium, where the hash input is the path's UTF-8 byte encoding -- the same encoding
Chromium's own `base::FilePath` uses on POSIX (`std::string`). On Windows,
`base::FilePath` is backed by `std::wstring` (UTF-16LE), so Chromium hashes a DIFFERENT
byte sequence for the exact same path string. The launcher's prediction, computed only in
UTF-8, therefore predicted the WRONG extension ID on the real Windows machine -- so Layers
1-3 were looking for an ID Chrome never assigned, while the extension itself, under its
real (different) ID, was genuinely loaded and working.

Separately, the launcher had no mechanism to accept the extension's OWN rendered
diagnostics/banner (Layer 4, which only ran AFTER registration was already confirmed) as
proof of load when the id-based checks (Layers 1-3) came back negative -- so even though
Layer 4 would have found the banner/diagnostics on chatgpt.com, it was never given the
chance to run, because the launcher gave up first.

---

## Fix Applied

Both root causes are fixed in `scripts/lib/chrome-launch-utils.js` and
`scripts/dryrun-001-launch-chrome.js` (same branch, after this session's commit):

1. **Multi-encoding ID prediction** (`computeUnpackedExtensionIdCandidates`): on `win32`,
   the launcher now computes BOTH the UTF-8 and UTF-16LE candidate IDs and checks every
   verification layer against all candidates (`parseExtensionTargetsByIds`,
   `evaluatePreferencesEvidenceForIds`) -- a wrong guess on one encoding no longer produces
   a false "not registered". Non-Windows platforms are unaffected (single UTF-8 candidate,
   unchanged behavior).
2. **Layer 4 runtime-rescue override** (`isStrongRuntimeProof`,
   `applyRuntimeRescueOverride`): if Layers 1/2 still find no match for any candidate ID
   after mode A, mode B, AND assisted manual-load all complete, the launcher now runs the
   Layer 4 runtime-DOM check anyway before giving up. If the extension's own rendered
   banner is visible, or its diagnostics panel explicitly reports
   `data-extension-loaded="true"`, that direct evidence OVERRIDES the negative Layer 1/2
   result -- the launcher reports the extension as registered and proceeds to a full PASS,
   printing the override explicitly (never silently).

See `docs/internal-beta/dry-runs/DRYRUN-001_CHROME_EXTENSION_LOAD_FAILURE.md` for the
original investigation and `docs/internal-beta/dry-runs/DRYRUN-001_CHROME_EXTENSION_LOAD_FAILURE.md`-adjacent
commit history for the full fix.

---

## Verification Performed

- Unit tests (`scripts/__tests__/chrome-launch-utils.test.js`) cover: UTF-8 vs UTF-16LE
  candidate generation producing different, deterministic IDs; multi-candidate CDP-target
  and Preferences matching succeeding on the SECOND candidate when the first is wrong (the
  exact reported scenario); `isStrongRuntimeProof`/`applyRuntimeRescueOverride` correctly
  overriding a negative registration result only when the runtime evidence is genuinely
  strong (banner visible, or diagnostics present AND `extension_loaded === 'true'`), and
  correctly NOT overriding on weak/absent evidence.
- A real end-to-end integration test
  (`scripts/__tests__/dryrun-001-pipeline.integration.test.js`) spawns the real launcher
  against a fixture "Chrome" that never exposes any `chrome-extension://` CDP target (so
  Layers 1/2 always fail, reproducing the id-mismatch condition) but whose one page target
  answers the real CDP `Runtime.evaluate` protocol as if the banner/diagnostics ARE
  genuinely rendered -- and confirms the launcher reaches a full `PASS`, not
  `BLOCKED_EXTENSION_LOAD`, with the override explicitly logged.
- **Not yet performed:** reconfirmation against a real Windows Chrome install. The
  UTF-16LE encoding fix is reasoned from Chromium's documented `base::FilePath` platform
  behavior, not measured against a real Windows Chrome's actual assigned ID for a real
  path. The Layer 4 rescue override is platform-independent and does not depend on the ID
  prediction being correct at all, so it should independently prevent this exact false
  negative regardless of whether the encoding fix is fully correct -- but this has not
  been re-run on the real machine that hit the original bug.

---

## Severity Rationale

| Field | Value |
|-------|-------|
| Severity | S2 -- does not represent a defect any real tester would encounter (the product worked); represents a defect in release-verification tooling trustworthiness |
| Priority | P2 |
| Rollback Needed | NO -- no product, privacy, or billing impact |
| Escalation | Normal triage |
| Decision impact | Does not force HOLD under this project's rules; HOLD was chosen anyway as a matter of release-process discipline pending reconfirmation |

---

## Evidence Safety

- [x] No ChatGPT prompt text included
- [x] No ChatGPT response text included
- [x] No screenshot with personal data included
- [x] No API key included
- [x] No .env file included
- [x] No cookies or tokens included

---

## Triage Assignment

| Field | Value |
|-------|-------|
| Assigned To | [OWNER TBD -- Engineering] |
| Status | fix implemented, pending real-Windows reconfirmation |
| GitHub Issue # | [#TBD] |
| Target Fix Date | Fix landed same branch; reconfirmation target [DATE TBD] |

---

## Resolution Criteria

**Resolved (close this issue):** `pnpm -w run dryrun:001:launch-chrome`, re-run on a real
Windows machine, either (a) reaches `PASS` without needing assisted manual-load, or (b) if
it still needs assisted manual-load, does NOT report `BLOCKED_EXTENSION_LOAD` once the
extension is genuinely loaded -- i.e. the Layer 4 rescue (or the corrected id prediction)
demonstrably prevents the exact false negative this issue describes.

**Escalate further (if the fix does not work on real Windows):** If
`BLOCKED_EXTENSION_LOAD` still fires despite the extension genuinely working, capture the
launcher's full printed output (predicted ID candidates, Layer 1-4 results, the rescue
attempt's own result) -- privacy-safe, contains no ChatGPT content -- and file as a new,
distinct issue with that evidence attached, since it would mean a third
scenario neither fix anticipated.

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
