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
2. In the file browser, navigate to the unzipped folder and select the "dist" folder inside it.
3. Click "Select Folder" (or "Open").

### Step 5 -- Verify the extension loaded
- "PromptProfit" should now appear in the extension list at chrome://extensions.
- The extension icon may appear in your Chrome toolbar (puzzle-piece icon area).

### Step 6 -- Log in and open a new chat
1. Go to https://chatgpt.com.
2. **REQUIRED: Confirm you are logged in.** If you see "Log in" or "Sign up for free": log in first.
   The PromptProfit banner ONLY appears when you are logged in and ChatGPT is generating.
3. Click "New chat" in the ChatGPT sidebar to start a fresh conversation.
4. Type this exact safe test prompt in the message box (not the URL bar):

   Count slowly from 1 to 10.

5. Press Enter and **watch the bottom-right corner** while ChatGPT responds.

### Step 7 -- What success looks like
WHILE ChatGPT is generating its response (the streaming/typing phase), look for:

- A small rectangular banner/overlay in the **bottom-right corner** of the browser window.
- The banner shows placeholder text: a headline, a short body line, and a display URL.
- These are placeholders, NOT real advertisements.
- A close button (X) appears in the corner of the banner.

Important: Watch the bottom-right corner FROM THE MOMENT you press Enter. The banner appears
during generation. If you look away and back after ChatGPT finishes, you may have missed it.

### Step 8 -- Test the close button
Click the X button on the banner. It should disappear immediately.

### Step 9 -- What to do if no banner appears
- Check: Is the extension toggle ON (blue) in chrome://extensions?
- Check: Are you logged into chatgpt.com? (No "Log in" or "Sign up" visible?)
- Check: Did you open a NEW chat (not an existing one)?
- Check: Were you watching the bottom-right corner DURING generation?
- If all yes and still no banner: file a bug report using the template in FEEDBACK_INTAKE.md.
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
1. Go to chrome://extensions -> enable Developer Mode.
2. Click "Load unpacked" -> select apps/browser-extension/dist/
3. Confirm PromptProfit appears in the extension list.

### Step 9 -- Manual test
1. Go to https://chatgpt.com.
2. Open Chrome DevTools -> Network tab (to monitor requests).
3. Type the safe test prompt:

   Count slowly from 1 to 10.

4. Observe: banner appears in bottom-right while ChatGPT responds.
5. In Network tab: confirm the extension's event POST payload contains NO page content
   (no promptText, pageUrl, domText, chatHistory, cookies, authToken fields).
6. Click the X button. Banner disappears.

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
| Banner does not appear | Check: logged in? Extension ON? New chat? Watched during generation? |
| Not logged into chatgpt.com | Log in first, reload tab, try again from Step 6 |
| Extension shows error badge | Click "Details" -> "Errors" -- record error text (no personal data) |
| Banner text looks wrong | File a bug report with severity S2 |
| Chrome crashes | File a bug report with severity S1 |
| You see a ppft_ key anywhere | Stop immediately -- notify beta coordinator |
| You want to stop testing | Disable: chrome://extensions -> toggle off |
| Still no banner after all checks | See TROUBLESHOOTING_BANNER_NOT_OBSERVED.md |
