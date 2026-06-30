# Local Real-API Smoke Mode

This document describes how to run the ChatGPT browser adapter smoke test
against a locally running PromptProfit API (fully automated).

---

## Quick Start

```powershell
pnpm -w run smoke:chatgpt:local-api
```

The script handles everything: Docker services, migrations, seed, API health,
API key minting, extension build, smoke run, event query, and report.

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

No local Postgres or psql install is needed - the script uses
`docker compose exec postgres psql`.

---

## Automation Steps

`scripts/run-local-real-api-smoke.ps1` runs these steps in order:

1. **Safety check** - Validates `--ApiUrl` is localhost/127.0.0.1 only. Refuses
   non-local targets (exit 3).
2. **Load .env** - Reads `.env` from the repo root. Existing environment
   variables take precedence (no overwrite).
3. **Validate DATABASE_URL** - Confirms the database URL is local. Refuses
   non-local database targets (exit 3).
4. **Check Docker** - Verifies the Docker daemon is reachable (exit 2 if not).
5. **Start services** - Runs `docker compose up -d` (skip with `-SkipDocker`).
6. **Migrate + seed** - Runs `pnpm db:migrate` and `pnpm db:seed` (idempotent;
   skip with `-SkipMigrate`).
7. **API health** - Waits for `GET /health` to return 200. Auto-starts the
   API as a background job if not running (skip auto-start with `-NoStartApi`).
8. **Mint API key** - Calls `scripts/get-local-dev-api-key.ps1` to find the
   seeded `dev@example.com` user in local Postgres and exchange their ID for
   a local-dev-only API key via `POST /v1/auth/exchange`. The raw key is held
   in the current process environment only.
9. **Build extension** - Runs the test bundle build (skip with `-SkipBuild`).
10. **Run smoke** - Runs Playwright with `LIVE_SMOKE_USE_LOCAL_API=1` and
    `PLAYWRIGHT_API_BASE_URL` set.
11. **Clear key** - Clears `PROMPTPROFIT_DEV_API_KEY` from the process
    environment after the test completes.
12. **Query events** - Runs `query-local-browser-events.ps1` to show sanitized
    recent event rows from local Postgres.
13. **Show report** - Prints the latest local-API smoke report.
14. **Cleanup** - Stops any API background job started in step 7.

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
| `-SinceMinutes` | 10 | Event query lookback window |
| `-Help` | off | Print usage and exit |

---

## API Key Security Rules

The minted API key is LOCAL DEVELOPMENT ONLY. These rules are enforced:

- The raw key is **never** printed by default.
- The raw key is **never** included in smoke reports, event payloads, or the
  debug panel.
- The raw key is **never** written to disk unless `-OutFile` is explicitly
  passed to `get-local-dev-api-key.ps1`.
- The raw key is cleared from the process environment immediately after the
  test run completes (step 11).
- The script refuses to mint a key if the API URL is not local (exit 3).
- The script refuses to run if DATABASE_URL points to a non-local host (exit 3).

The key flows: `POST /v1/auth/exchange` response -> `$env:PROMPTPROFIT_DEV_API_KEY`
-> `configureExtensionStorage` -> `chrome.storage.local["apiKey"]` ->
`buildHeaders()` -> `Authorization: Bearer` on API requests only. It never
appears in any log, report, or event payload.

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

## Event Verification

After the smoke run, the script queries local Postgres for sanitized event rows.
The query selects only: `id`, `event_type`, `adapter_id`, `created_at`, and
`session_id`. It never reads: `page_url`, `page_title`, `dom_text`,
`prompt_text`, `response_text`, or any user-identifying fields.

If no events are captured, the report includes `events_captured: 0` and all
downstream event-content checks are skipped (not vacuously passed).

---

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | All steps passed |
| 1 | Smoke test failed |
| 2 | Blocked (Docker unavailable, API unreachable, seed missing) |
| 3 | Unsafe (non-local API or DB URL detected) |

---

## Privacy Guarantees

Real-API mode does not weaken any privacy guarantees. The content script
never reads page content regardless of which API backend is configured.

The following are **never** read, stored, logged, or transmitted:
- ChatGPT prompt text, response text, or chat history
- Page title or full URL path/query
- Conversation IDs
- DOM text from the ChatGPT page
- Cookies, auth tokens, localStorage, or sessionStorage
- Screenshots, videos, or Playwright traces containing user content
- ChatGPT private API calls or network traffic

Only the API base URL changes between mock and real-API mode. All data
flowing through the events pipeline is backend-assigned identifiers and
extension-owned metadata.
