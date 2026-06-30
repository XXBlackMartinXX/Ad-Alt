# Live ChatGPT Smoke Test — Manual Checklist

Use this checklist when running a live smoke test against a real ChatGPT
session. The test requires a human operator but is otherwise heavily
automated — the extension does the work; you just log in and send a prompt.

**Time required:** 5–10 minutes (includes setup and verification)

**Privacy guarantee:** Nothing on this page asks you to copy, paste, or share
any ChatGPT content. You will never read page text, inspect network requests,
or extract cookies. Only the extension's debug overlay and local event logs
are examined.

---

## Before You Start

### Prerequisites

- [ ] Docker Desktop is running (or skip with `-SkipDocker` if services are already up)
- [ ] You have a ChatGPT account (free tier is fine)
- [ ] The repository is on the correct branch: `git status` shows no untracked build artifacts
- [ ] `pnpm --filter @ad-alt/browser-extension test:e2e` passes (12 passed, 0 skipped)

### Quick prerequisite check

```powershell
# Windows (PowerShell)
.\scripts\live-chatgpt-smoke.ps1 -UseMockApi -SkipDocker
```

```bash
# macOS / Linux
pwsh scripts/live-chatgpt-smoke.ps1 -UseMockApi -SkipDocker
```

Expected: **12 passed, 0 skipped**. If this fails, fix the fixture suite before
continuing.

---

## Running the Live Test

### Option A — Automated orchestration (recommended)

```powershell
# Windows
.\scripts\live-chatgpt-smoke.ps1

# macOS / Linux
pwsh scripts/live-chatgpt-smoke.ps1
```

The script will:
1. Build `dist-test/` automatically
2. Start the embedded mock API server
3. Open a Chromium window pointing at chatgpt.com
4. Print instructions in the terminal and wait for you

### Option B — Direct Playwright invocation

```bash
pnpm --filter @ad-alt/browser-extension test:e2e:live
```

---

## During the Test

When the Chromium window opens:

1. **Log in to ChatGPT** if you are not already logged in.
   - Use your normal ChatGPT credentials.
   - Never share your credentials with anyone.

2. **Submit any prompt** (e.g. "hello" or "tell me a joke").
   - The content of the prompt does not matter.
   - The extension detects the wait state structurally — it never reads your prompt.

3. **Watch for the debug panel** (bottom-left corner of the window).
   - The panel appears only because `debugMode` was enabled by the test harness.
   - It shows: adapter status, wait-state flag, banner rendered flag, last event type.
   - It never displays page text, your prompt, or the AI response.

4. **Wait for the banner to appear.**
   - A sponsored banner should slide in from the bottom of the input area
     while ChatGPT is generating a response.
   - If no banner appears within ~30 seconds of the wait state starting,
     check the terminal for error details.

5. **Do not close the browser** — the test will close it automatically after
   verifying events.

### What to watch for in the debug panel

| Panel field | Expected value during test |
|-------------|---------------------------|
| adapter | active |
| wait-state | yes (while ChatGPT is responding) |
| banner | rendered (after ad decision received) |
| last event | impression_rendered |
| kill-switch | off |
| api | configured |

---

## After the Test

### Check the terminal output

The Playwright runner prints results as they complete. Look for:

```
✓  live ChatGPT smoke — banner appears and events fire
```

A JSON and Markdown report are written to:
```
apps/browser-extension/test-results/live/live-chatgpt-smoke-YYYY-MM-DD-HH-MM-SS.{json,md}
```

### Verify the smoke report

Open the `.md` report. All checks should show `✓`:

| Check | Description |
|-------|-------------|
| `wait_state_detected` | Extension detected ChatGPT wait state |
| `banner_rendered` | `#promptprofit-sponsored-banner` appeared in DOM |
| `debug_panel_banner_rendered` | Debug panel reflected `data-banner-rendered=true` |
| `impression_requested_sent` | Mock API received `impression_requested` event |
| `impression_rendered_sent` | Mock API received `impression_rendered` event |
| `events_privacy_safe` | Events contain no forbidden private fields |

### Optional: Query the database (if using -UseLocalApi)

If you ran with `-UseLocalApi`, you can also query the local Postgres:

```powershell
.\scripts\query-local-browser-events.ps1 -Last 10
```

This shows only ad metadata columns — never page content or user data.

---

## Troubleshooting

### Banner does not appear

1. Check the debug panel: is `api: configured`? If not, the extension did not
   receive the mock API URL — re-run without `-SkipBuild`.
2. Check the terminal for `MockApiServer` errors.
3. Is `kill-switch: ON`? The kill-switch should be `off` in smoke runs.
4. Did you submit a prompt? The adapter only fires when ChatGPT is responding.

### No events in the report (`eventCount: 0`)

1. Confirm `dist-test/` was built: the test manifest must have
   `"host_permissions": ["http://127.0.0.1:*/*"]`.
2. Check the service worker console (chrome://extensions → Inspect service worker).
3. Run `pnpm --filter @ad-alt/browser-extension test:e2e` first to confirm the
   event pipeline works in fixture mode.

### Browser closes immediately / never opens

- Ensure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` points to a valid Chromium
  binary if you set it. Otherwise, unset the variable and let Playwright use
  its managed binary.
- Run `pnpm exec playwright install chromium` if the managed binary is missing.

### `psql` errors when using `-UseLocalApi`

- Start Docker services: `docker compose up -d postgres redis`
- Run migrations: `pnpm db:migrate && pnpm db:seed`
- Note: the DB seed creates no API keys, so `POST /v1/events` to the real API
  will return 401 unless you manually seed one. Use the mock API instead.

---

## Bug Report Template

If the test fails, file a bug with the following information:

```
**Date:** YYYY-MM-DD
**Branch:** (git rev-parse HEAD)
**OS:** Windows 11 / macOS 14 / Ubuntu 22.04
**Chrome version:** (shown in chrome://settings/help)
**Extension build:** dist-test/ (MV3, unpacked)
**Mode:** UseMockApi / LiveChatGPT

**Failing checks:**
- [ ] wait_state_detected
- [ ] banner_rendered
- [ ] debug_panel_banner_rendered
- [ ] impression_requested_sent
- [ ] impression_rendered_sent
- [ ] events_privacy_safe

**Terminal output (last 50 lines):**
[paste here — do NOT include ChatGPT prompts, responses, or cookies]

**Report JSON:**
[paste apps/browser-extension/test-results/live/*.json — confirm no private data before sharing]

**Debug panel state at failure:**
[screenshot of ONLY the bottom-left debug overlay, not the ChatGPT page content]

**Steps to reproduce:**
1.
2.
3.
```

> **Privacy reminder:** Never include screenshots of the ChatGPT page content,
> your prompts, AI responses, or any authentication information in bug reports.
