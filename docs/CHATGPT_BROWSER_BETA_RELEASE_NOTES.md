# ChatGPT Browser Adapter - Beta Release Notes

**Version:** 0.1.0 (pre-release)
**Date:** 2026-06-30
**Branch:** `claude/ecstatic-maxwell-h0d8d8`
**Label:** Beta-readiness candidate with local-real-API smoke verified

---

## Scope

This release covers the **ChatGPT browser adapter only**.

| Platform | Status |
|----------|--------|
| ChatGPT (chatgpt.com + chat.openai.com) | Beta-ready |
| Other AI platforms | NOT included in this release |
| VS Code extension | Separate package (apps/extension) |

---

## What Is Included

### Browser Extension (apps/browser-extension)

- **ChatGPT adapter** - detects wait states, renders sponsored banner, fires events
- **Service worker** - handles ad decisions, event forwarding, API key management
- **Debug panel** - developer-facing overlay (opt-in via `debugMode`)
- **Privacy guard** - enforces no forbidden fields in event payloads
- **Kill switch** - emergency suppression of all ads
- **Fixture E2E tests** - 13/13 passing
- **Unit tests** - 105/105 passing
- **Local real-API smoke** - verified end-to-end with local Postgres

### Automation Scripts

- `run-local-real-api-smoke.ps1` - fully automated local smoke pipeline
- `run-local-billing-ledger-smoke.ps1` - billing/ledger smoke (impression lifecycle + DB verification)
- `run-local-click-billing-smoke.ps1` - click billing smoke (click event + ledger verification)
- `query-local-browser-events.ps1` - privacy-safe DB event query (no local psql needed)
- `query-local-ledger.ps1` - query ledger_entries and balances tables
- `query-local-billing-events.ps1` - query impression_events with billing status
- `package-browser-extension.mjs` - beta ZIP without source maps
- `audit-browser-extension-package.js` - CWS submission readiness audit
- `audit-vsix-package.js` - VS Code Marketplace submission readiness audit
- `check-ps1-ascii.js` - ensures all 10 PS1 files are Windows-safe
- `check-no-secret-leaks.js` - scans 326 source files for leaked API key patterns
- `check-report-templates-ascii.js` - ensures report-generating files are ASCII-clean

---

## Tested Workflows

### Fixture E2E (automated, headless)
- Extension loads without errors
- Wait-state detection triggers sponsored banner
- Banner has required sponsorship label and close button
- Viewability threshold fires after configured duration
- Kill switch suppresses all ads
- Privacy: no forbidden fields in requests or events
- Privacy: no page content in DOM interactions

### Live Smoke (manual, real browser)
- Human logs in to ChatGPT and submits a prompt
- Extension detects wait state automatically
- Sponsored banner renders
- Events fire to mock API or real local API
- Report written to test-results/ (git-ignored)

### Local Real-API Smoke (manual, Docker required)
- Full automated pipeline: Docker, migrate, seed, health, key mint, preflight, build, smoke, DB query
- Ad-decision preflight confirms campaign eligibility before browser launches
- Service worker sends all required params (adapterName, deviceId, extensionVersion)
- Events persisted to local Postgres, verified via sanitized DB query
- Local dev API key never printed, cleared after run

---

## Privacy Guarantees

The extension **never** reads, stores, logs, or transmits:

- ChatGPT prompt text, response text, or chat history
- Page title or URL path/query (only hostname for adapter activation)
- DOM text from the ChatGPT page
- Cookies, auth tokens, localStorage, or sessionStorage
- Screenshots, videos, or traces containing user content
- Any ChatGPT private API calls or network traffic

All assertions target only extension-owned elements:
- `#promptprofit-sponsored-banner`
- `#promptprofit-debug-panel[data-*]`

API key is held only in process memory during smoke runs. Never printed,
logged, written to reports, or included in event payloads.

---

## Known Beta Blockers

### 1. No LICENSE File

**Severity:** Release blocker for store submission
**Impact:** Cannot submit to Chrome Web Store or VS Code Marketplace
**Resolution:** See `docs/LICENSE_DECISION_REQUIRED.md`

### 2. Source Maps in Browser Extension ZIP

**Severity:** Recommended to resolve before Chrome Web Store submission
**Impact:** Source maps increase ZIP size and expose TypeScript structure
**Current state:** esbuild emits `.map` files alongside `.js` in `dist/`
**Resolution:** Use `pnpm package:browser:beta` which creates a ZIP excluding
`.map` files, or configure `sourcemap: false` in `scripts/bundle.mjs`

### 3. Missing UI Assets

**Severity:** Pre-CWS-submission blocker
**Impact:** `manifest.json` references `popup.html`, `options.html`, and icon
PNG files that do not yet exist in the repository
**Resolution:** Create placeholder or production UI assets before CWS submission

---

## What Is NOT Verified

| Item | Status | Notes |
|------|--------|-------|
| Click billing | PARTIAL | Click smoke script created; billing in local dev may be PARTIAL/BLOCKED |
| Viewability billing/ledger | PARTIAL | Billing smoke script created; reconciliation requires staging |
| Production fraud signals | NOT VERIFIED | Local dev does not test fraud detection |
| Multi-user concurrent impressions | NOT VERIFIED | Single-user smoke only |
| Extension update behavior | NOT VERIFIED | Manifest version bump not tested |
| Chrome Web Store review compliance | NOT VERIFIED | Requires LICENSE + source map review |
| Edge browser support | NOT VERIFIED | Only tested in Chromium |
| Non-en locales | NOT VERIFIED | ChatGPT locale not tested |

---

## How to Run Smoke Tests

### Fixture (CI-safe, headless)

```bash
pnpm -w run smoke:chatgpt:fixture
```

### Live (Windows, human required)

```powershell
pnpm -w run smoke:chatgpt:live
```

Human action: log in to ChatGPT, submit a prompt such as "Count slowly from 1 to 10".

### Local Real-API (Windows, Docker + human required)

```powershell
pnpm -w run smoke:chatgpt:local-api
```

Human action: log in to ChatGPT, submit a prompt.

Prerequisites: Docker Desktop running, `pnpm db:migrate && pnpm db:seed` applied.

---

## Not Production-Ready

This release is suitable for **internal beta testing** only.

Do NOT use for production traffic until:
- LICENSE decision is made and file added
- Source map policy is finalized for distribution
- Fraud signal pipeline is verified
- Billing/ledger reconciliation is end-to-end tested
- Chrome Web Store policy compliance review is complete
