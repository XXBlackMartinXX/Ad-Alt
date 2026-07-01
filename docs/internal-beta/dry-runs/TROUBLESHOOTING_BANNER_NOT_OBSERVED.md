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

---

## Checklist: Common Causes of Banner Not Appearing

Work through each item in order. Check each box when confirmed.

### A. Tester Is Not Logged Into ChatGPT (Most Common Cause)

- [ ] **A1. Verify the tester is logged into chatgpt.com.**
  The PromptProfit banner ONLY appears when the user is authenticated.
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

- [ ] **C1. Open a BRAND NEW chat tab after loading the extension.**
  The content script injects when the page loads. If ChatGPT was already open before loading
  the extension: the script did not run. Fix: open a new tab, navigate to chatgpt.com, then test.

- [ ] **C2. The tester must open a NEW chat (not continue an existing conversation).**
  Click "New chat" in the ChatGPT sidebar. Do NOT resume a previous conversation.

- [ ] **C3. Verify the tester is watching during ChatGPT GENERATION, not after.**
  The banner appears WHILE ChatGPT is generating (the spinning or streaming state).
  If the tester looks away and back after the response is complete: they may have missed it.
  Ask the tester to watch the bottom-right corner of the browser window from the moment they press Enter.

- [ ] **C4. Confirm the safe test prompt is typed in the chat input, not the URL bar.**
  The prompt must be typed into the ChatGPT message box, not the browser address bar.
  Prompt: `Count slowly from 1 to 10.` (exactly as written)

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

When correctly installed and logged in:

1. Tester submits the safe test prompt: `Count slowly from 1 to 10.`
2. ChatGPT begins generating (streaming output).
3. **In the BOTTOM-RIGHT corner of the browser window**, a small rectangular overlay appears.
4. The banner contains:
   - A short placeholder headline (not real ad content)
   - A short placeholder description line
   - A placeholder display URL (e.g. "example.com" or similar placeholder)
   - An X close button in the top-right corner of the banner
5. The banner may disappear automatically or remain visible until the X is clicked.
6. The X button dismisses the banner immediately.

If any of the above is different (real ad content, personal data visible, API key visible):
STOP and follow the S0 escalation procedure in DRY_RUN_TRIAGE_CHECKLIST.md.

---

## Escalation

| What You See | Action |
|-------------|--------|
| No banner after all checklist items confirmed | File S2 issue via PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md |
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
