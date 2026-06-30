# Local Real-API Smoke Mode

This document describes how to run the ChatGPT browser adapter smoke test
against a locally running PromptProfit API instead of the embedded mock, and
what blockers currently prevent a fully automated end-to-end run.

---

## What "Real-API Mode" Means

The fixture E2E suite (`pnpm smoke:chatgpt:fixture`) uses an in-process
`MockApiServer` that always returns a canned ad decision. Real-API mode
means pointing the extension at `http://127.0.0.1:3001` (the local
PromptProfit API) so that ad decisions, impression events, and viewability
events flow through the full backend stack.

---

## Configuration

Set `apiBaseUrl` in `chrome.storage.local` to point at the local API:

```typescript
await configureExtensionStorage(context, {
  apiBaseUrl: 'http://127.0.0.1:3001',
  killSwitchEnabled: false,
  disabledAdapters: [],
});
```

The `-UseLocalApi` flag in `scripts/live-chatgpt-smoke.ps1` does this
automatically when starting the full live-smoke pipeline.

---

## Current Blockers

### 1. No seeded API key / campaign

The local API requires a valid campaign and API key before it returns an ad
decision. Without them, `/v1/ads/decision` returns 401 or an empty response,
and the extension shows no banner.

**Blocker:** No seed script populates a campaign record or issues an
extension API key for local development. Until a seed exists, real-API mode
produces an empty decision and the fixture tests fall back to inconclusive.

**Workaround:** Use the embedded `MockApiServer` (default). It always returns
a synthetic ad decision and accepts all event POSTs.

### 2. Local API server not started by default

The `@ad-alt/api` package must be running (`pnpm dev:api`) before the
extension can reach `http://127.0.0.1:3001`. The E2E test suite does not
start the API server automatically.

**Workaround:** Start the API manually in a separate terminal before running
the live-smoke script with `-UseLocalApi`.

### 3. Database migration and seed not automated in E2E

The API depends on a Postgres database. Migrations and seed data must be
applied manually (`pnpm db:migrate && pnpm db:seed`) before the API will
serve ad decisions.

**Workaround:** Run migrations and seed before starting the API server.

### 4. No Docker orchestration in the E2E runner

The `scripts/live-chatgpt-smoke.ps1` script has a `-SkipDocker` flag but
the E2E suite itself has no mechanism to start or verify Docker services.
If Postgres or Redis is not running, the API crashes on startup.

---

## What Would Enable Real-API Smoke

To enable a fully automated real-API fixture E2E run:

1. **Add a dev seed script** that creates a test campaign, a test advertiser
   account, and an API key, and exports the key as an environment variable
   `PROMPTPROFIT_DEV_API_KEY`.

2. **Add an `apiKey` field to `ExtensionConfig`** in `extension-context.ts`.
   The content script would then include it in the `Authorization` header when
   calling the local API.

3. **Add a Playwright global setup** (`playwright.config.ts` `globalSetup`)
   that starts the API server and waits for a health-check endpoint before
   tests begin.

4. **Update `configureExtensionStorage`** to write the `apiKey` alongside
   `apiBaseUrl`.

Until those steps are completed, use the embedded `MockApiServer` for
automated E2E and the manual live-smoke script for real-API validation.

---

## Privacy Note

Real-API mode does not change any privacy guarantees. The extension content
scripts never read page content regardless of which API backend is configured.
Only the API base URL changes; all data flowing through the events pipeline
remains the same backend-assigned identifiers and extension metadata.
