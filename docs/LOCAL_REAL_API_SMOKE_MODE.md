# Local Real-API Smoke Mode

This document describes how to run the ChatGPT browser adapter smoke test
against a locally running PromptProfit API (fully automated).

---

## Quick Start

```powershell
pnpm -w run smoke:chatgpt:local-api
```

The script handles everything: Docker services, migrations, seed, API health,
API key minting, ad-decision preflight, extension build, smoke run, event
query, and report.

---

## What "Real-API Mode" Means

The fixture E2E suite (`pnpm smoke:chatgpt:fixture`) uses an in-process
`MockApiServer` that always returns a canned ad decision. Real-API mode
points the extension at `http://127.0.0.1:3001` so that ad decisions,
impression events, and viewability events flow through the full backend stack
and are persisted to the local Postgres database.

---

## Prerequisites

| Requirement | Check |
|---|---|
| Docker daemon running | `docker info` |
| pnpm 9.4.0+ | `pnpm -v` |
| Node 20+ | `node -v` |
| PowerShell 5.1 or pwsh | `$PSVersionTable` |

No local Postgres or psql install is needed - all database operations use
`docker compose exec postgres psql` via the running Docker container.

---

## Automation Steps

`scripts/run-local-real-api-smoke.ps1` runs these steps in order:

1. **Safety check** - Validates `-ApiUrl` is localhost/127.0.0.1 only. Refuses
   non-local targets (exit 3).
2. **Load .env** - Reads `.env` from the repo root. Existing environment
   variables take precedence (no overwrite).
3. **Validate DATABASE_URL** - Confirms the database URL is local. Refuses
   non-local database targets (exit 3).
4. **Check Docker** - Verifies the Docker daemon is reachable (exit 2 if not).
5. **Start services** - Runs `docker compose up -d` (skip with `-SkipDocker`).
6. **Migrate + seed** - Runs `pnpm db:migrate` and `pnpm db:seed` (idempotent;
   skip with `-SkipMigrate`). The seed includes a patch step that adds
   `browser_chatgpt` to the dev campaign's `targetAdapterNames` on already-seeded
   databases.
7. **API health** - Waits for `GET /health` to return 200. Auto-starts the
   API as a background job if not running (skip auto-start with `-NoStartApi`).
8. **Mint API key** - Calls `scripts/get-local-dev-api-key.ps1` to find the
   seeded `dev@example.com` user in local Postgres and exchange their ID for
   a local-dev-only API key via `POST /v1/auth/exchange`. The raw key is held
   in the current process environment only and is never printed.
9. **Ad-decision preflight** - Calls `GET /v1/ads/decision` with
   `adapterName=browser_chatgpt`, `deviceId=local-real-api-smoke-device`, and
   the minted API key. If the API returns 204 (no eligible campaign), the script
   exits with a clear message rather than launching the browser (exit 2).
   See "Preflight Failure" below for remediation.
10. **Build extension** - Runs the test bundle build (skip with `-SkipBuild`).
11. **Run smoke** - Runs Playwright with `LIVE_SMOKE_USE_LOCAL_API=1` and
    `PLAYWRIGHT_API_BASE_URL` set. The extension is configured with the local API
    URL, the minted API key, and `deviceId=local-real-api-smoke-device`.
12. **Clear key** - Clears `PROMPTPROFIT_DEV_API_KEY` from the process
    environment after the test completes.
13. **Query events** - Runs `query-local-browser-events.ps1` to show sanitized
    recent impression_events rows from local Postgres (via Docker).
14. **Show report** - Prints the latest local-API smoke report.
15. **Cleanup** - Stops any API background job started in step 7.

---

## Preflight Failure: No Eligible Ad Decision

If step 9 returns 204:

```
Ad-decision preflight: 204 No Content
The local API has no eligible ad decision for browser_chatgpt.
```

**Cause**: The dev campaign is not targeting `browser_chatgpt` (or has
exhausted budget, expired, or is paused).

**Fix**: Run `pnpm db:seed` — the incremental patch in `seed.ts` adds
`browser_chatgpt` to `targetAdapterNames` on the existing dev campaign.
If the campaign budget is exhausted, update `spentMicrocents` directly
in local Postgres, or re-seed after deleting the existing campaign row.

---

## Service Worker: deviceId and extensionVersion

The real API (`GET /v1/ads/decision`) requires three query parameters:
`adapterName`, `deviceId`, and `extensionVersion`. The service worker now:

1. Reads `deviceId` from `chrome.storage.local` (set by `configureExtensionStorage`
   in the smoke test to `local-real-api-smoke-device`).
2. Reads the extension version from `chrome.runtime.getManifest().version`.
3. Normalises `expiresAt` to a number (ms since epoch) — the real API returns
   an ISO string while the mock returns a number; both are now handled.

This means the real API sees a valid, complete request and returns 200 instead
of 400 (Zod validation failure).

---

## Script Flags

```powershell
pnpm -w run smoke:chatgpt:local-api:help
```

| Flag | Default | Description |
|---|---|---|
| `-ApiUrl` | `http://127.0.0.1:3001` | Local API base URL |
| `-SkipDocker` | off | Skip `docker compose up -d` |
| `-SkipMigrate` | off | Skip migrate + seed |
| `-NoStartApi` | off | Do not auto-start API (must be running) |
| `-SkipBuild` | off | Skip extension build |
| `-SinceMinutes` | 30 | Event query lookback window |
| `-NoDbVerify` | off | Skip post-run DB event query |
| `-Help` | off | Print usage and exit |

---

## API Key Security Rules

The minted API key is LOCAL DEVELOPMENT ONLY. These rules are enforced:

- The raw key is **never** printed during the smoke run.
- `get-local-dev-api-key.ps1` uses `Write-Output` (not `Write-Host`) for
  `-PrintKey` so the parent script can capture it via assignment without it
  appearing on the console.
- The raw key is **never** included in smoke reports, event payloads, or the
  debug panel.
- The raw key is **never** written to disk unless `-OutFile` is explicitly
  passed to `get-local-dev-api-key.ps1`.
- The raw key is cleared from the process environment immediately after the
  test run completes (step 12).
- The script refuses to mint a key if the API URL is not local (exit 3).
- The script refuses to run if DATABASE_URL points to a non-local host (exit 3).
- The preflight step uses the key in an Authorization header that is never
  written to any output stream.

Key flow:
```
POST /v1/auth/exchange
  -> $env:PROMPTPROFIT_DEV_API_KEY (process-only)
  -> configureExtensionStorage (apiKey + deviceId written to storage)
  -> chrome.storage.local["apiKey"]
  -> buildHeaders() -> Authorization: Bearer (on API requests only)
```

---

## Event Verification

After the smoke run, `query-local-browser-events.ps1` queries `impression_events`
in local Postgres via `docker compose exec postgres psql`. No local psql install
is required.

Safe columns selected: `id`, `created_at`, `adapter_name`, `status`,
`ad_decision_id`, `campaign_id`, `creative_id`, `device_id`, `requested_at`,
`rendered_at`.

Never read: `user_id`, `fraud_signals`, `idempotency_key`, or any payload JSON.

---

## Reports

Local-API smoke reports are written to:

```
apps/browser-extension/test-results/local-api/
```

This directory is gitignored (covered by `test-results/`). To list and read
the latest report:

```powershell
pnpm -w run smoke:chatgpt:local-api:report
```

---

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | All steps passed (human must interpret PASSED/INCONCLUSIVE) |
| 1 | Smoke test failed |
| 2 | Blocked (Docker unavailable, API unreachable, no eligible campaign, seed missing) |
| 3 | Unsafe (non-local API or DB URL detected) |

---

## Privacy Guarantees

Real-API mode does not weaken any privacy guarantees. The content script
never reads page content regardless of which API backend is configured.

The following are **never** read, stored, logged, or transmitted:
- ChatGPT prompt text, response text, or chat history
- Page title or full URL path/query
- Conversation IDs or DOM text from the ChatGPT page
- Cookies, auth tokens, localStorage, or sessionStorage
- Screenshots, videos, or Playwright traces containing user content
- ChatGPT private API calls or network traffic

The API key is never printed, logged, written to reports, or included in
event payloads. It is cleared from process memory immediately after the test.
