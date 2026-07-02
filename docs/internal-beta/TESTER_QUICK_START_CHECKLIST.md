# PromptProfit -- Tester Quick-Start Checklist

**INTERNAL BETA ONLY. Not for public distribution. Not on the Chrome Web Store.**
**Date:** 2026-07-01 | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

Choose your track below. Track A requires no coding. Track B is for engineers.

---

## Track A: Non-Engineer / Product Tester

Estimated time: 30-45 minutes. No terminal required.

### Prerequisites
- [ ] Google Chrome (latest version). Download from https://www.google.com/chrome/ if needed.
- [ ] The beta ZIP file (received from your beta contact -- do NOT download from any store).
- [ ] A chatgpt.com account (your own existing account).
- [ ] **You MUST be logged into chatgpt.com before starting the test.**
  The PromptProfit overlay only appears when you are authenticated.
  If chatgpt.com shows "Log in" or "Sign up for free": log in first, then proceed.

### Step 1 -- Get the package
Obtain the beta ZIP file from your beta contact via the secure internal channel.
Do NOT download from any public website, Chrome Web Store, or link not provided by your beta contact.

### Step 2 -- Unzip
Unzip the file to a folder you can find easily (e.g., Desktop/promptprofit-beta/).

### Step 3 -- Enable Developer Mode in Chrome
1. Open Chrome.
2. Go to: chrome://extensions (type that in the address bar and press Enter).
3. In the top-right corner, toggle "Developer mode" ON (it turns blue when on).

### Step 4 -- Load the extension
1. Click "Load unpacked" (top-left button, visible after enabling Developer Mode).
2. In the file browser, navigate to the unzipped folder and SELECT THAT FOLDER ITSELF.
   The folder you select must contain `manifest.json` directly at its top level.
   Do NOT navigate into `dist/` or any subfolder — Chrome needs the folder with `manifest.json`.
3. Click "Select Folder" (or "Open").

### Step 5 -- Verify the extension loaded (do this BEFORE going to ChatGPT)
- "PromptProfit" should now appear in the extension list at chrome://extensions.
- The extension icon may appear in your Chrome toolbar (puzzle-piece icon area).

**If PromptProfit does NOT appear in the list at all:** STOP HERE. Do not go to
chatgpt.com yet -- no banner can ever appear if the extension itself did not load. This is
a different problem than "the banner didn't show up," and should be reported as such
("PromptProfit is not visible in chrome://extensions after Load unpacked"), not as a
banner problem. Tell your beta contact; the most common cause is that the ZIP you were
given was from a build that failed to package correctly (the owner-side tooling now
refuses to hand out a ZIP produced by a failed build, but always double-check you have the
newest ZIP your contact sent you).

### Step 5a -- PRIMARY CHECK: the banner should appear right away (no login needed)
1. Go to https://chatgpt.com in a NEW tab (open it AFTER loading the extension, not before).
2. **Watch the bottom-right corner of the browser window for about 5-10 seconds.**
   You do NOT need to log in or type anything yet -- the demo banner should appear on its
   own, even on the login/signup screen.
3. If the banner appears: great, continue to Step 6. If it does NOT appear: this is now a
   real problem to report (see Step 9) -- do not assume you need to log in first.

### Step 6 -- Log in and open a new chat (optional secondary check)
1. Confirm you are logged in. If you see "Log in" or "Sign up for free": log in first.
   (This step is only needed for the secondary check below -- the banner in Step 5a does
   not require login.)
2. Click "New chat" in the ChatGPT sidebar to start a fresh conversation.
3. Type this exact safe test prompt in the message box (not the URL bar). The longer
   prompt below is RECOMMENDED because it gives more time to observe:

   Count slowly from 1 to 100, one number per line.

   (The shorter prompt "Count slowly from 1 to 10." is also approved, but the longer
   one is recommended for this rerun.)

4. Press Enter and watch the bottom-right corner while ChatGPT responds (the banner from
   Step 5a may already be showing -- that's expected, not a bug).

### Step 6a -- Live dry-run diagnostics panel (internal beta only)

You may also see a small panel labeled "PromptProfit Dry-Run Diagnostics" in the
**top-left** corner of the page. It never shows any ChatGPT content -- only extension
state. If the banner does not appear, read this panel's status line and note it exactly
(word for word) instead of guessing why. It has a small `[-]`/`[+]` button to collapse it
if it gets in your way. Example status lines and what they mean:

| Status line shown | What it means |
|---|---|
| "Waiting for generation state" (persists even without sending a prompt) | The forced fallback did not trigger -- likely demo mode was not enabled; report this |
| "Generation detected; ad decision missing" or "...API not configured" | Relevant only to the secondary (Step 6) check |
| "Banner attempted; not visible" | The banner was added to the page but is not visible (report this exactly) |
| "Banner visible" | Everything worked -- expected within seconds of Step 5a, before any prompt |

### Step 7 -- What success looks like
The banner should appear within seconds of Step 5a (page load), without needing to send a
prompt. If you're doing the optional Step 6 secondary check too, it will look the same
during ChatGPT's response. Look for:

- A small rectangular banner/overlay in the **bottom-right corner** of the browser window.
- The banner shows placeholder text: a headline, a short body line, and a display URL.
- These are placeholders, NOT real advertisements.
- A close button (X) appears in the corner of the banner.

Important: the banner appears on its own within seconds of Step 5a -- you do not need to
send a prompt or watch during generation for the primary check to pass.

### Step 8 -- Test the close button
Click the X button on the banner. It should disappear immediately.

### Step 9 -- What to do if no banner appears (in Step 5a)
- Check FIRST: is PromptProfit even visible in chrome://extensions (Step 5)? If not, this
  is an extension-load failure, not a banner problem -- see Step 5's note above and stop
  here; do not continue troubleshooting the banner until the extension itself is loaded.
- If the extension IS visible: Check: Is the extension toggle ON (blue) in chrome://extensions?
- Check: Did you open chatgpt.com in a NEW tab (opened AFTER loading the extension)?
- Check: What does the diagnostics panel (Step 6a) say, exactly?
- Note: being logged in is NOT required for the Step 5a banner -- do not assume that's the cause.
- Do NOT guess at a cause. Report the exact diagnostics panel status line if you saw one,
  and file a bug report using the template in FEEDBACK_INTAKE.md.
  Do NOT share ChatGPT content in the bug report -- only describe extension behavior.

Other failure signs:
- An error badge (red exclamation icon) on the extension icon in chrome://extensions.
- Chrome shows an extension error under Details -> Errors in chrome://extensions.

### Step 10 -- Disable (safe pause)
To pause the extension without uninstalling:
1. Go to chrome://extensions.
2. Find PromptProfit.
3. Toggle the blue toggle to OFF (grayed out).
4. Verify: refresh chatgpt.com and type a prompt -- no banner should appear.

### Step 11 -- Remove (full uninstall)
1. Go to chrome://extensions.
2. Find PromptProfit.
3. Click "Remove" and confirm.

### Step 12 -- Report your feedback
- File a GitHub issue on the repository with label: release:internal-beta.
- Or use the feedback form your beta contact provided.
- See FEEDBACK_INTAKE.md for the bug report template.

### Do Not Share
- ChatGPT prompts or responses (including the one you typed during testing).
- Screenshots that show chat content or personal data.
- The beta ZIP file (internal distribution only).
- API keys, .env files, cookies, tokens, or logs with secrets.
- The full browser URL bar (may contain session IDs).

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**

---

## Track B: Engineer / Technical Tester

Estimated time: 60-90 minutes including automated checks.

### Prerequisites
- [ ] Node.js v20+ -- verify: node --version
- [ ] pnpm 9.4+ -- verify: pnpm --version
- [ ] Google Chrome (latest)
- [ ] git
- [ ] Docker Desktop (required for billing smoke tests only -- optional)
- [ ] Repository access on branch claude/ecstatic-maxwell-h0d8d8

### Step 1 -- Clone and checkout
  git clone [REPO_URL]
  cd [REPO_DIR]
  git checkout claude/ecstatic-maxwell-h0d8d8
  git log --oneline -3
  # Confirm: 6145fc7 is in the log

### Step 2 -- Install
  pnpm install --frozen-lockfile
  # Expect: Done, no errors

### Step 3 -- Build
  pnpm -r build
  # Expect: exit 0

### Step 4 -- Run unit tests
  pnpm --filter @ad-alt/browser-extension test:unit
  # Expect: 105/105 pass

### Step 5 -- Run fixture E2E
  pnpm --filter @ad-alt/browser-extension test:e2e
  # Expect: 13/13 pass

### Step 6 -- Secret scan
  pnpm -w run check:secrets:local
  # Expect: 0 leaks

### Step 7 -- Package and audit
  pnpm -w run package:browser:beta
  pnpm -w run package:browser:zip:audit -- --mode internal-beta
  # Expect: PASS, exit 0

### Step 8 -- Load extension in Chrome

**Recommended: use the verified launcher instead of steps 1-3 below.** It builds a fresh
package, verifies it's genuinely current, extracts it, and PROVES PromptProfit loaded
through four independent checks (not just a visual glance at chrome://extensions) before
printing PASS -- you never have to pick a ZIP or find a folder yourself:

```bash
pnpm -w run dryrun:001:launch-chrome
```

If it does not print `PASS`, do not proceed manually -- see
`docs/internal-beta/dry-runs/DRYRUN-001_CHROME_EXTENSION_LOAD_FAILURE.md`. If auto-load
fails, the launcher itself automatically opens `chrome://extensions` and a file browser at
the exact folder to select and polls for the load -- you do not need to do steps 1-3
yourself even in that case.

Manual alternative (only if you're not using the launcher):
1. Go to chrome://extensions -> enable Developer Mode.
2. Click "Load unpacked" -> select the `apps/browser-extension/` folder itself
   (the folder that contains `manifest.json` directly). Do NOT select
   `apps/browser-extension/dist/` -- that subfolder only has compiled JS files,
   not `manifest.json`, and Chrome will reject it.
3. Confirm PromptProfit appears in the extension list.

### Step 9 -- Manual test
1. Go to https://chatgpt.com.
2. Open Chrome DevTools -> Network tab (to monitor requests).
3. Type the recommended safe test prompt (gives more observation time):

   Count slowly from 1 to 100, one number per line.

   (The shorter prompt "Count slowly from 1 to 10." is also approved.)

4. Observe: banner appears in bottom-right while ChatGPT responds. If an internal-beta
   live dry-run diagnostics panel is visible (top-left), its status line should read
   "Banner visible."
5. In Network tab: confirm the extension's event POST payload contains NO page content
   (no promptText, pageUrl, domText, chatHistory, cookies, authToken fields).
6. Click the X button. Banner disappears; diagnostics panel `data-banner-closed` becomes true.

### Step 10 -- Billing smoke (optional, requires Docker)
  pnpm -w run smoke:billing:local
  # Expect: billing invariant pass (developer_credit + platform_fee == advertiser_charge)
  pnpm -w run smoke:billing:click:local
  # Expect: click billing invariant pass

### Step 11 -- Beta packet check
  pnpm -w run check:internal-beta-packet
  # Expect: PASS, exit 0
  pnpm -w run check:internal-beta-rollout
  # Expect: PASS, exit 0

### Step 12 -- Disable / remove
1. Disable: chrome://extensions -> toggle PromptProfit OFF.
2. Verify: no banner appears on chatgpt.com.
3. Remove if desired: chrome://extensions -> Remove.

### Step 13 -- Report
- File a GitHub issue with label: release:internal-beta.
- Include: OS, Chrome version, Node version, pnpm version.
- Attach sanitized test output (check for ppft_ keys before attaching).

### Do Not Share
- ChatGPT prompt or response text.
- Screenshots containing personal data.
- .env files, ppft_ API keys, cookies, or tokens.
- The beta package outside the approved tester list.

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**

---

## Quick Reference

| Situation | Action |
|-----------|--------|
| PromptProfit NOT visible in chrome://extensions at all | STOP -- this is an extension-load failure, not a banner problem. Do not go to ChatGPT. Report exactly this, and confirm you have the newest ZIP your beta contact sent. |
| Banner does not appear at Step 5a (extension IS visible, no login needed for this check) | Check: Extension ON? New tab opened after loading extension? Read the diagnostics panel status line (internal beta) instead of guessing. |
| Not logged into chatgpt.com | Only blocks Step 6 (optional secondary check) -- log in, reload tab, try again |
| Extension shows error badge | Click "Details" -> "Errors" -- record error text (no personal data) |
| Banner text looks wrong | File a bug report with severity S2 |
| Chrome crashes | File a bug report with severity S1 |
| You see a ppft_ key anywhere | Stop immediately -- notify beta coordinator |
| You want to stop testing | Disable: chrome://extensions -> toggle off |
| Still no banner after all checks | See TROUBLESHOOTING_BANNER_NOT_OBSERVED.md |
