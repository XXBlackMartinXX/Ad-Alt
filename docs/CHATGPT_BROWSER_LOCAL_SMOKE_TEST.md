# ChatGPT Browser Local Smoke Test

**Product:** PromptProfit  
**Status:** Manual verification procedure — adapter not yet manually verified  
**Adapter:** `browser_chatgpt` (chatgpt.com, chat.openai.com)

---

## Prerequisites

1. Node.js 20+, pnpm 9.4.0+
2. Chrome or Chromium (not Firefox — Manifest V3)
3. A ChatGPT account (free tier sufficient)
4. The monorepo built: `pnpm install && pnpm turbo build`

---

## Step 1 — Build the extension

```powershell
# Windows
pnpm --filter @ad-alt/browser-extension build

# Check dist/ was produced
ls apps/browser-extension/dist/
# Expected:
#   content/chatgpt.js
#   content/chatgpt.js.map
#   content/claude.js
#   content/gemini.js
#   background/service-worker.js
```

---

## Step 2 — Load unpacked in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select `apps/browser-extension/dist/` ← the built output directory
5. Verify the extension appears with no error badge

> If you see a manifest error, check that `apps/browser-extension/manifest.json`
> is present. The build script does NOT copy the manifest — copy it manually:
> ```
> cp apps/browser-extension/manifest.json apps/browser-extension/dist/
> ```

---

## Step 3 — Configure the API base URL

The extension reads `apiBaseUrl` from `chrome.storage.local`. Set it to your local
API server (or a deployed instance).

Open the Chrome DevTools console for the service-worker (Extensions → service worker
inspect link) and run:

```javascript
chrome.storage.local.set({ apiBaseUrl: "http://localhost:3000" });
```

For a production deployment:
```javascript
chrome.storage.local.set({ apiBaseUrl: "https://api.yourpromptprofit.com" });
```

---

## Step 4 — Start the local API (optional)

If using `apiBaseUrl: "http://localhost:3000"`, start the API server:

```bash
# Requires Postgres and Redis (see SETUP.md)
pnpm --filter @ad-alt/api dev
```

Without a running API, `GET_AD_DECISION` returns `null` and no ad is shown.
The wait-state detection still works; you can verify it in the console.

---

## Step 5 — Navigate to ChatGPT

1. Open `https://chatgpt.com` in Chrome
2. Open DevTools → Console
3. Look for any errors from the extension (content script errors appear here)

You should see **no errors** on initial load.

---

## Step 6 — Verify wait-state detection

1. In the ChatGPT text input, type any message and send it
2. While the AI is generating a response, open DevTools → Console
3. The content script sends a `GET_AD_DECISION` message to the service-worker

To monitor service-worker messages:
1. Go to `chrome://extensions`
2. Click **"service worker"** link under the PromptProfit extension
3. Open Console tab in the opened DevTools window

Expected: you see the `GET_AD_DECISION` message when ChatGPT starts generating.

---

## Step 7 — Verify sponsored moment rendering (requires API)

With the local API running and a seeded ad campaign:

1. Send a message in ChatGPT
2. While AI is generating, the sponsored banner should appear in the **bottom-right
   corner** of the viewport
3. Verify:
   - [ ] "PromptProfit · Sponsored" label is visible
   - [ ] Headline text is displayed (from the campaign creative)
   - [ ] Optional body text is displayed if configured
   - [ ] Display URL is shown in green
   - [ ] Close button (×) is visible in the top-right of the banner
   - [ ] Banner does NOT cover the prompt input
   - [ ] Banner does NOT cover the AI response area
   - [ ] Banner does NOT block scrolling

4. Click the close button — banner should disappear immediately
5. When AI finishes generating, banner should also disappear

---

## Step 8 — Verify kill-switch

1. In the service-worker console, run:
   ```javascript
   chrome.storage.local.set({
     featureFlags: {
       killSwitchEnabled: true,
       disabledAdapters: [],
       flags: {}
     }
   });
   ```
2. Reload the ChatGPT tab
3. Send a message — **no banner should appear**
4. Verify in console: no `GET_AD_DECISION` message from content script (adapter disabled at startup)

To re-enable:
```javascript
chrome.storage.local.set({
  featureFlags: {
    killSwitchEnabled: false,
    disabledAdapters: [],
    flags: {}
  }
});
```

---

## Step 9 — Verify privacy (no forbidden fields)

In the service-worker console, monitor outgoing fetch calls:
1. Open Network tab in service-worker DevTools
2. Trigger a wait-state
3. Inspect the `GET /v1/ad-decision` request headers and body

Expected: the request URL contains **only** `adapterName=browser_chatgpt` — no
`pageUrl`, `pageTitle`, `domText`, or any content from the ChatGPT page.

---

## Known limitations (alpha)

- No click tracking in this release (link is display-only)
- ViewabilityObserver is not wired to the telemetry event path in this release
- API must be manually configured via `chrome.storage.local.set`
- Extension does not auto-update `apiBaseUrl` from a remote config

---

## Smoke test result recording

| Check | Pass / Fail / N/A | Notes |
|---|---|---|
| Build produces dist/ files | | |
| Extension loads unpacked without error | | |
| No errors on chatgpt.com page load | | |
| Wait-state detected (GET_AD_DECISION sent) | | |
| Banner renders with correct label | | |
| Banner is non-invasive (does not cover input) | | |
| Close button dismisses banner | | |
| Kill-switch disables adapter | | |
| No forbidden fields in API request | | |

**Tester:** ____________________  **Date:** __________  **Chrome version:** __________
