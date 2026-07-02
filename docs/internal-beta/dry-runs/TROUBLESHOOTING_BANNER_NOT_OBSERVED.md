# Troubleshooting: PromptProfit Banner Not Observed

**Use this guide when the PromptProfit overlay banner does not appear during the DRYRUN-001 safe test.**
**Branch:** claude/ecstatic-maxwell-h0d8d8 | **Internal beta only.**

---

> Privacy reminder: Do NOT record ChatGPT prompt text, response text, or any personal data
> while diagnosing. Record only extension behavior and error messages.

---

## Before You Start

Run the repo-side diagnostic first:

```bash
pnpm -w run dryrun:001:diagnose
```

This checks: branch, commit, dist/ contents, manifest, expected JS files, ZIP artifact.
Fix any FAIL items before proceeding with the checklist below.

Then run the live checklist, which prints the exact folder to load, the recommended
prompt, and what each diagnostic panel state means:

```bash
pnpm -w run dryrun:001:live-checklist
```

Best option: use the verified launcher, which builds a fresh package, validates it is
genuinely current before extracting, and only opens Chrome if every check passes:

```bash
pnpm -w run dryrun:001:launch-chrome
```

---

## STEP 0 (Check This FIRST): Is PromptProfit Even Visible in chrome://extensions?

**This is a different problem from "the banner did not render" and must be ruled out
before anything else.** If the extension itself never loaded, no diagnostics panel and no
banner can ever appear -- there is nothing to diagnose about wait-state or demo-mode
behavior yet.

**Do not answer this by eyeballing chrome://extensions yourself first.** Run the verified
launcher -- it proves load through four independent checks (a CDP target for the exact
predicted extension ID, the profile's own Preferences registration, a manifest.json
resource probe, and -- once registered -- the actual extension-owned banner/diagnostics DOM
on chatgpt.com) and tells you definitively which of `PASS`, `BLOCKED_EXTENSION_LOAD`,
`BLOCKED_RUNTIME`, or `BLOCKED_POLICY` you're in, instead of asking you to guess from a
visual check:

```bash
pnpm -w run dryrun:001:launch-chrome
```

**Command-line auto-load (`--load-extension`) can fail on some Chrome/Windows setups even
when the package itself is fine** (silent process crash, an unpacked-extension enterprise
policy, a Chrome build quirk). When it does, the launcher does not just report a generic
failure or ask you to manually verify: it automatically enters **assisted manual-load
mode** -- it opens `chrome://extensions` and a file browser at the exact extracted folder
in the same Chrome window, copies that exact path to your clipboard, and then polls for up
to two minutes for the load to register, continuing on its own the moment it detects
PromptProfit -- you never have to pick a ZIP, guess a folder, or tell the script when
you're done. See `docs/internal-beta/dry-runs/DRYRUN-001_CHROME_EXTENSION_LOAD_FAILURE.md`
for the full investigation and verification-layer design.

**If the launcher reports `BLOCKED_EXTENSION_LOAD` or `BLOCKED_POLICY`:**

- The extension is not loaded. **Do not proceed to ChatGPT.** No banner or diagnostics
  panel can appear under any circumstances until this is fixed.
- This is an **extension-load failure**, not a banner-render failure -- record it as such,
  using the launcher's exact `Blocked reason:`/policy-signal text. Do not describe this as
  "the banner didn't appear" in any report.
- Check, in this order:
  1. **Did packaging actually succeed for THIS session?** The launcher already re-runs
     packaging itself and refuses to proceed on failure -- but if you ran
     `package:browser:beta` manually first, confirm it exited 0 with no FAIL lines. A failed
     package build silently leaves behind an OLD ZIP from a previous run -- do not assume
     the ZIP you have is current just because a file exists.
  2. **Does the extracted folder actually contain manifest.json at its root?**
     Run `pnpm -w run check:browser:load-folder` -- it verifies this and also verifies the
     package's `promptprofit-build-info.json` matches the current commit (i.e. it is not stale).
  3. **Did assisted manual-load mode time out?** If the launcher entered assisted mode and
     the two-minute poll expired, re-run the launcher and complete the Load Unpacked steps
     it prints faster, or check for a Chrome error/policy badge on the extension card and
     report its exact text.
  4. **Is a Chrome/Chromium enterprise policy involved?** On Windows, the launcher itself
     checks the relevant `HKLM/HKCU\Software\Policies\Google\Chrome` (and `\Chromium`)
     registry values and reports `BLOCKED_POLICY` with the exact policy name/value if one
     is likely blocking Developer Mode or unpacked extensions.
- Only after the launcher itself reports `PASS` (or you have independently confirmed
  PromptProfit in `chrome://extensions` with no error badge AFTER assisted mode) should you
  proceed to STEP 1 and the banner-specific guidance below.

**If the launcher reports `BLOCKED_RUNTIME`:** the extension IS registered and loaded --
this is genuinely a banner-render (not extension-load) question. It already printed the
extension-owned diagnostic state (banner visible / diagnostics present / status label / last
error code) it observed on chatgpt.com; record that verbatim and proceed to the
banner/diagnostics guidance below rather than re-debugging package/load steps.

---

## Key Behavior Change: the Banner No Longer Waits for Generation or Login

As of the forced internal-beta demo fallback
(`docs/internal-beta/dry-runs/DRYRUN-001_DEFINITIVE_BANNER_FIX.md`), the demo banner
appears within a few seconds of the chatgpt.com page loading -- **before any prompt is
sent, and regardless of whether the tester is logged in**. It no longer depends on
ChatGPT's wait-state selectors matching, on generation completing, or on authentication.

This means the OLD assumption "the banner only appears once you're logged in and ChatGPT
is generating" (checklist item A1 below) is **no longer true** for the forced-fallback
path. If the banner still does not appear immediately after page load, do not assume the
tester needs to log in and try again -- treat it as a genuine failure and read the
diagnostics panel first (below). Section A below remains relevant only for the OPTIONAL
secondary check of the normal wait-state-driven path.

## Read the Live Diagnostics Panel First -- Do Not Guess

The packaged selftest (`pnpm -w run dryrun:001:selftest`) already proves the banner CAN
render in the shipped artifact via the forced demo fallback, with no wait-state trigger
and no API configuration. If the banner still does not appear on real ChatGPT, that means
something in the REAL runtime path is failing -- not a packaging problem. Guessing at
which of the checklist items below applies wastes the tester's time and produces vague
reports.

Instead: look for the small panel labeled "PromptProfit Dry-Run Diagnostics" in the
**top-left** corner of the page (internal-beta builds only). It never shows any ChatGPT
content -- only extension-owned state. Read its status line and record it EXACTLY:

| Status line | Meaning | What to check next |
|---|---|---|
| "Extension not loaded on this page" | Content script never ran here | Reload the ChatGPT tab; confirm you opened it AFTER loading the extension |
| "Platform not detected" | Hostname mismatch | Confirm you are on chatgpt.com or chat.openai.com |
| "Kill-switch active -- banner suppressed" | A stored flag is blocking the banner | See section B below |
| "Adapter inactive" | Extension loaded but did not start | Check for an error badge; see section B |
| "Waiting for generation state" (persists indefinitely, even with demo mode on and no prompt sent) | The forced fallback never triggered -- `demo_fallback_active` is false. Likely demo mode was never enabled | See section B5: confirm `dryRunDemoMode` was written (fresh install, not reused folder) |
| "Generation detected; API not configured" | Demo mode/API never got configured -- likely a reused extraction folder (see section B5) | Reload into a fresh folder; re-verify install was a genuine "install" not "update" |
| "Generation detected; ad decision failed" | Demo mode or API IS configured but still failed | This is a genuine runtime bug -- report it, do not treat as setup |
| "Banner attempted; not visible" | Banner is in the page but has zero visible size | Report this exactly -- likely a CSS/host-page conflict |
| "Banner visible" | Everything worked -- this should happen within seconds of page load, with no prompt needed | No issue |

Also check the panel's `demo_fallback_active` / `demo_fallback_rendered` fields directly:
if `demo_fallback_active` is `true` but `demo_fallback_rendered` stays `false` and the
banner never appears, that is a genuine renderer bug -- report the exact panel state, it
is not a setup issue.

If the panel itself is not visible at all: this only happens if
`dryRunDiagnosticsEnabled` was never written to storage, which (like the demo-mode issue
in section B5) usually means Chrome treated the extension load as an "update" rather than
a fresh "install." Remove all copies of the extension and reload from a NEW extraction
folder.

---

## Checklist: Common Causes of Banner Not Appearing

Work through each item in order. Check each box when confirmed.

### A. Tester Is Not Logged Into ChatGPT (Relevant Only to the Optional Secondary Check)

The forced demo fallback banner does NOT require login -- it appears on any supported
ChatGPT hostname regardless of authentication state. This section only matters if you are
running the OPTIONAL secondary check of the normal wait-state-driven path (which does
require a real, authenticated ChatGPT session to generate a response).

- [ ] **A1. Verify the tester is logged into chatgpt.com (only needed for the wait-state secondary check).**
  If the chatgpt.com page shows "Log in" or "Sign up for free": the tester is NOT logged in.
  Fix: Have the tester log in to their ChatGPT account BEFORE loading the extension.
  After logging in: reload the ChatGPT tab, open a new chat, then run the safe test prompt.

- [ ] **A2. Verify the tester is using their OWN account.**
  Do NOT share a test account across testers. Each tester uses their own ChatGPT login.
  If they don't have an account: they cannot participate in Track A until they create one.

### B. Extension Not Loaded Correctly

- [ ] **B1. Verify Developer Mode is ON in chrome://extensions.**
  Go to chrome://extensions. In the top-right: "Developer mode" toggle must be ON (blue/enabled).
  If it was off when the extension was loaded: disable and re-enable the toggle, then reload the extension.

- [ ] **B2. Verify the tester loaded the EXTRACTED ZIP ROOT FOLDER (not a subfolder).**
  When clicking "Load unpacked", the tester must select the EXTRACTED ZIP ROOT FOLDER — the folder
  created when they unzipped the package (e.g. `promptprofit-browser-beta-2026-07-01T.../`).
  That root folder contains `manifest.json` directly. Do NOT navigate into any subfolder.
  The `dist/` subfolder only contains compiled JS files, NOT manifest.json — Chrome will reject it.
  Fix: Remove the extension. Re-select the extracted root folder (the one with manifest.json), load again.

- [ ] **B3. Confirm "PromptProfit" appears in the chrome://extensions list with NO error badge.**
  An error badge (red exclamation mark) means the extension failed to load.
  Click "Details" -> "Errors" to see the error message (record the error text, no personal data).

- [ ] **B4. Confirm the extension toggle is ON (blue, not grayed out).**
  A grayed-out toggle means the extension is disabled. Tap it to enable.

- [ ] **B5. Check for multiple copies of the extension.**
  If the tester has loaded the extension more than once (e.g. from a previous attempt),
  remove all copies and load fresh from the current ZIP.

### C. ChatGPT Tab State

- [ ] **C1. Open a BRAND NEW tab after loading the extension (applies to the primary check too).**
  The content script injects when the page loads. If ChatGPT was already open before loading
  the extension: the script did not run. Fix: open a new tab, navigate to chatgpt.com, then test.
  This is required for the forced fallback banner too -- it only appears in tabs where the
  content script actually ran.

The remaining items in this section (C2-C4) apply ONLY to the optional secondary check of
the normal wait-state-driven path, not to the primary forced-fallback banner check.

- [ ] **C2. The tester must open a NEW chat (not continue an existing conversation).**
  Click "New chat" in the ChatGPT sidebar. Do NOT resume a previous conversation.

- [ ] **C3. Verify the tester is watching during ChatGPT GENERATION, not after.**
  The banner appears WHILE ChatGPT is generating (the spinning or streaming state).
  If the tester looks away and back after the response is complete: they may have missed it.
  Ask the tester to watch the bottom-right corner of the browser window from the moment they press Enter.

- [ ] **C4. Confirm the safe test prompt is typed in the chat input, not the URL bar.**
  The prompt must be typed into the ChatGPT message box, not the browser address bar.
  Recommended (gives more observation time): `Count slowly from 1 to 100, one number per line.`
  Also approved (original, shorter): `Count slowly from 1 to 10.`

### D. Extension Files

- [ ] **D1. Verify the extracted dist/ folder is the correct and latest build.**
  Run: `pnpm -w run dryrun:001:diagnose` -- it will print the expected files and their paths.
  If the build is stale: run `pnpm -r build && pnpm -w run package:browser:beta`, re-extract.

- [ ] **D2. Check that content/chatgpt.js is present in the loaded dist/ folder.**
  In the unzipped folder, open the `dist/` subfolder and verify `content/chatgpt.js` exists.
  If missing: the content script was not built. Run `pnpm -r build` and repackage.

- [ ] **D3. Check that background/service-worker.js is present.**
  In the `dist/` subfolder, verify `background/service-worker.js` exists.
  If missing: the service worker was not built. Run `pnpm -r build` and repackage.

### E. Manifest and Permissions

- [ ] **E1. Check the manifest.json content_scripts section.**
  In the extracted ZIP root folder, open `manifest.json` and verify there is a `content_scripts`
  entry matching `https://chatgpt.com/*`. If missing: the build may have been configured incorrectly.

- [ ] **F2. Confirm no Chrome Content Security Policy blocks the extension overlay.**
  In Chrome DevTools (F12) -> Console tab: look for errors mentioning "Content Security Policy",
  "Refused to load", or "Extension context invalidated".
  Record any error text (no personal data) and file an issue.

---

## What the Banner Should Look Like

When correctly installed (primary check -- forced demo fallback, no login or prompt required):

1. Tester loads chatgpt.com in a new tab, after loading the extension.
2. Within a few seconds, **in the BOTTOM-RIGHT corner of the browser window**, a small
   rectangular overlay appears -- with NO prompt sent and regardless of login state.
3. The banner contains:
   - A short placeholder headline (not real ad content)
   - A short placeholder description line
   - A placeholder display URL (e.g. "example.com" or similar placeholder)
   - An X close button in the top-right corner of the banner
4. The banner stays visible for at least ~12 seconds, or until the X is clicked.
5. The X button dismisses the banner immediately.

Optional secondary check (normal wait-state-driven path, requires login and a real prompt):

1. Tester submits the safe test prompt: `Count slowly from 1 to 100, one number per line.`
2. ChatGPT begins generating (streaming output).
3. The banner appears (or, if the forced-fallback banner is already up, stays as-is --
   see "no duplicate banners" in DRYRUN-001_DEFINITIVE_BANNER_FIX.md).

If any of the above is different (real ad content, personal data visible, API key visible):
STOP and follow the S0 escalation procedure in DRY_RUN_TRIAGE_CHECKLIST.md.

---

## Escalation

| What You See | Action |
|-------------|--------|
| No banner after all checklist items confirmed AND `dryrun:001:selftest` passed | File S1/P1 (beta blocker) via PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md -- record the diagnostic panel status line verbatim. A confirmed failure surviving a passing packaged selftest is NOT a setup issue and cannot be downgraded to S2-S4 (see `scripts/dryrun-001-finalize.js` enforcement). |
| Error badge on extension icon | Record exact error text; file S1/S2 issue |
| Real ad content in banner (not placeholder) | STOP -- S0/S1 -- escalate to Privacy Owner |
| API key pattern (ppft_...) visible anywhere | STOP -- S0 -- escalate to Privacy Owner |
| ChatGPT content visible in banner | STOP -- S0 -- escalate to Privacy Owner |
| Extension crashes Chrome | File S1 issue |
| Chrome shows "Aw, Snap!" | File S1 issue |

---

## Quick Fix Commands (Owner Side)

```bash
# Re-run repo diagnostics
pnpm -w run dryrun:001:diagnose

# Confirm the packaged artifact can render the banner without API config
pnpm -w run dryrun:001:selftest

# Print the live checklist (folder to load, recommended prompt, diagnostic panel legend)
pnpm -w run dryrun:001:live-checklist

# Rebuild and repackage
pnpm -r build
pnpm -w run package:browser:beta
pnpm -w run package:browser:zip:audit -- --mode internal-beta

# Verify state
pnpm -w run check:dryrun:001
pnpm -w run check:secrets:local
```

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
