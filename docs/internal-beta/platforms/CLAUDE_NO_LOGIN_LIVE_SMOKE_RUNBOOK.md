# Claude Browser — No-Login Live Smoke Runbook

**Phase:** Safe No-Login First Live Verification Workflow
**Date:** 2026-07-03

> Read `LIVE_VERIFICATION_SAFETY_POLICY.md` in full before running this.
> Every rule in that document applies here without exception. This tier
> proves the extension is safe and inert on real claude.ai — it does
> **not** prove real wait-state detection (CANARY 6). Do not mark Claude
> `verified` from this runbook's result alone.

---

## What this tier can prove

- The extension loads on the real `claude.ai` origin without crashing.
- The correct content script (`claude.ts` → `ClaudeAdapter`) is present
  and active.
- The adapter stays inert (no banner) on a logged-out / landing /
  login-required page.
- No forbidden telemetry is emitted just from loading the page.

## What this tier cannot prove

- Real chat wait-state detection (claude.ai requires a signed-in session
  to send a message and receive a generated response — a logged-out page
  has no "Stop Response" button to detect).
- Banner appearance/close behavior during a real generation.
- Anything that would justify marking Claude `verified`.

If this tier cannot reach a real wait-state (the expected, normal
outcome), the correct sanitized result is
`LIVE_PAGE_SAFE_LOGIN_REQUIRED_FOR_WAIT_STATE`, and the next step is
`CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` — a separate,
human-driven, opt-in session.

---

## Steps

### 1. Build the extension

```bash
pnpm --filter @ad-alt/browser-extension build
```

This produces the production bundle at `apps/browser-extension/dist/`
(the same artifact a real user would install) — not the test-only
`dist-test/` bundle used by Playwright fixture tests.

### 2. Launch Chrome with the unpacked extension

Use the launcher script (see `scripts/launch-no-login-live-smoke.js`,
Phase 3):

```bash
pnpm -w run live:claude:no-login
```

This launches a **headed** (visible), **temporary, clean Chrome
profile** — never your everyday browser profile, never a profile with
any existing claude.ai session — with the unpacked `dist/` extension
loaded, and navigates directly to `https://claude.ai/`.

If the script cannot launch Chrome automatically on your machine (e.g.
no compatible Chrome binary found), it will print the exact manual
steps: open `chrome://extensions`, enable Developer Mode, click "Load
unpacked", select `apps/browser-extension/dist/`, then manually open a
new tab to `https://claude.ai/`.

### 3. Open the real platform URL

`https://claude.ai/` — confirmed by the script or done manually. Do not
navigate to any other Anthropic URL as part of this runbook.

### 4. Do not log in

Whatever claude.ai shows you (a landing page, a login prompt, a
"continue with Google" button, etc.) — do not click through any of it.
Just let the page load and sit on it.

### 5. Do not type prompts

There is no chat input to type into on a logged-out page in the first
place; if one is visible, do not click into it or type anything.

### 6. Do not click through automation-sensitive flows

Do not click "Sign in", "Continue with Google/email", any CAPTCHA, or
any security-challenge element. If one appears unprompted, stop and
record `HOLD` per the safety policy §8 — do not attempt to solve it.

### 7. Confirm the extension/content script does not crash

Open Chrome DevTools (F12) → Console tab on the claude.ai tab. Confirm
there are no uncaught exceptions originating from the extension (look
for `chrome-extension://` in any stack trace). A clean console (or only
unrelated site errors, not extension errors) is a pass for this step.

### 8. Confirm platform adapter detection state — extension-owned diagnostics only

The shipped extension has no visible UI by default. To observe
extension-owned diagnostic state safely:

1. Go to `chrome://extensions`, find "PromptProfit", click the
   "service worker" link to open its DevTools.
2. In that DevTools Console, run:
   ```js
   chrome.storage.local.set({ debugMode: true })
   ```
   This is the only supported way to enable the extension's own debug
   panel — there is no popup/options page (confirmed: `manifest.json`
   declares no `default_popup`/`options_page`). Setting this key does
   not read or affect anything about the claude.ai page itself.
3. Reload the claude.ai tab. A small panel labeled "PP Debug" appears in
   the bottom-left corner. This panel (`#promptprofit-debug-panel`) is
   entirely extension-owned — see `debug-panel.ts`'s doc comment: it
   never reads or displays page content, DOM text, URLs, cookies, or any
   user-derived data. Its `data-adapter-active` attribute (or the
   "adapter: active" line) confirms the Claude adapter detected the
   `claude.ai` hostname and started.
4. Only read the panel's boolean/enum state (adapter active, wait-state
   yes/no, banner rendered, kill-switch, last error code) — never any
   other element on the page.

### 9. Confirm no banner appears unless a valid wait-state exists

On a logged-out claude.ai page there is no "Stop Response" button, so
the adapter should correctly detect no wait-state and never render
`#promptprofit-sponsored-banner`. Confirm it does not appear.

### 10. Confirm no forbidden telemetry is sent

Open DevTools → Network tab, filter for the extension's own requests (or
inspect the service worker's Network tab from step 8's service-worker
DevTools window instead, which is cleaner since it isolates the
extension's own fetches from the page's own network activity). Since no
`apiBaseUrl` was configured in step 8 (only `debugMode` was set), the
service worker's `getAdDecision()`/`postEvent()` will not have a
configured API to call at all — confirm no outbound request to any
non-`claude.ai` origin appears. If one somehow does, capture only the
target origin (never the full request body/URL) and record `FAIL`.

### 11. Record the sanitized result

Copy `CLAUDE_NO_LOGIN_LIVE_SMOKE_RESULT_TEMPLATE.md` to a new file named
`CLAUDE_NO_LOGIN_LIVE_SMOKE_RESULT_LOG.md` in this same directory, fill
in only the allowed fields, and choose exactly one final result:

- `LIVE_PAGE_SAFE` — everything above passed, including the adapter
  showing an active/inert state via the debug panel.
- `LIVE_PAGE_SAFE_LOGIN_REQUIRED_FOR_WAIT_STATE` — everything above
  passed; the page is safe, but (as expected) no real wait-state was
  reachable without logging in. This is the normal, expected outcome.
- `HOLD` — something inconclusive happened (e.g. an unexpected
  challenge appeared and the session was stopped per safety policy §8).
- `FAIL` — the extension crashed, a banner appeared without a valid
  wait-state, or forbidden telemetry was observed.

---

**Privacy warning: Do not add real prompt/response text, real page
content, real account data, cookies/tokens, or payment credentials to
this document or its result log.**
