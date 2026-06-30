# ChatGPT Browser Adapter — Privacy & Security Audit

**Date:** 2026-06-30
**Scope:** `apps/browser-extension/src/` (TypeScript source, excluding `__tests__/`)
**Status:** CLEAN — all grep searches returned only safe or expected results

---

## Audit Method

1. Grep the source for each forbidden pattern category.
2. For each hit, classify: SAFE (allowed usage), CONTROLLED (intentional but
   worth noting), or VIOLATION (must fix).
3. No violations were found.

---

## 1. Page Content / DOM Text

**Pattern:** `innerHTML`, `innerText`, `textContent` reads from ChatGPT DOM

**Search:**
```
grep -rn "innerHTML\|innerText\|textContent" src/ --include="*.ts"
```

**Results and classification:**

| File | Line | Usage | Classification |
|------|------|-------|----------------|
| `content/chatgpt.renderer.ts:65` | `closeBtn.textContent = "×"` | **Write** to extension-owned element | SAFE |
| `content/chatgpt.renderer.ts:86` | `sponsorLabel.textContent = "PromptProfit · Sponsored"` | **Write** to extension-owned element | SAFE |
| `content/chatgpt.renderer.ts:98` | `headline.textContent = moment.headline` | **Write** from API response | SAFE |
| `content/chatgpt.renderer.ts:112` | `body.textContent = moment.body` | **Write** from API response | SAFE |
| `content/chatgpt.renderer.ts:118` | `displayUrl.textContent = moment.displayUrl` | **Write** from API response | SAFE |
| `content/debug-panel.ts:144` | `this.el.innerHTML = [...]` | **Write** to extension-owned debug panel | CONTROLLED |

No `textContent` or `innerHTML` **reads** from ChatGPT DOM elements appear anywhere.

`debug-panel.ts:144` writes a fixed template string to the debug panel element.
The string is constructed entirely from `DebugState` values, none of which are
page-derived (they are boolean flags and pre-approved string codes).

---

## 2. Page URL / Hostname

**Pattern:** `window.location`, `document.URL`, `document.referrer`

**Search:**
```
grep -rn "window\.location\|document\.URL\|document\.referrer" src/ --include="*.ts"
```

**Results:**

| File | Line | Usage | Classification |
|------|------|-------|----------------|
| `content/wait-state-detector.ts:46` | `window.location.hostname` | Adapter activation gating only | SAFE |
| `content/platform-detector.ts:28` | `window.location.hostname` | Platform detection by hostname | SAFE |

Only `.hostname` is read — never `.pathname`, `.search`, `.href`, or `.hash`.
The hostname is used solely to determine which adapter to activate and then
is not stored or transmitted in any event.

---

## 3. Cookies / Auth Tokens

**Pattern:** `document.cookie`, `navigator.cookieEnabled`, localStorage, sessionStorage

**Search:**
```
grep -rn "document\.cookie\|localStorage\|sessionStorage\|navigator\.cookie" src/ --include="*.ts"
```

**Results:** No matches.

No cookie reads, no local/session storage reads from the extension source.
(`chrome.storage.local` is used for extension-owned configuration only.)

---

## 4. Network Calls Outside Service Worker

**Pattern:** `fetch`, `XMLHttpRequest` in content scripts

**Search:**
```
grep -rn "fetch\|XMLHttpRequest" src/ --include="*.ts" | grep -v "service-worker"
```

**Results:** No matches in content scripts.

All network calls go through the service worker (`src/background/service-worker.ts`)
via `chrome.runtime.sendMessage`. Content scripts never make direct network
requests.

---

## 5. Forbidden Field Names in Events

**Pattern:** `pageUrl`, `pageTitle`, `domText`, `promptText`, `aiResponse`,
`chatHistory`, `cookies`, `authToken`, `sessionCookie`

**Search:**
```
grep -rn "pageUrl\|pageTitle\|domText\|promptText\|aiResponse\|chatHistory\|cookies\|authToken\|sessionCookie" src/ --include="*.ts"
```

**Results and classification:**

| File | Usage | Classification |
|------|-------|----------------|
| `content/privacy-guard.ts` | Listed in the forbidden-field allowlist for validation | SAFE (guard code) |
| `content/debug-panel.ts` | Comment: "Forbidden: page content, DOM text, URLs, cookies..." | SAFE (documentation) |
| `content/ad-event-sender.ts` | Comment: "never reads or transmits: page URL..." | SAFE (documentation) |
| `content/chatgpt.ts` | Comment: "PRIVACY RULE: Never reads..." | SAFE (documentation) |
| Various adapter files | Comment mentions in privacy rules | SAFE (documentation) |

No forbidden field name appears as a **key** in any object literal, function
parameter, or property assignment. All occurrences are in comments or in the
privacy guard's validation array.

---

## 6. Console Logging

**Pattern:** `console.log`, `console.error`, `console.warn`

**Search:**
```
grep -rn "console\." src/ --include="*.ts" | grep -v "__tests__"
```

**Results:** No matches.

No console logging exists in production source. Debug output goes exclusively
through `DebugPanel.update()` which writes to DOM data attributes (not the
console) on the extension-owned panel element.

---

## 7. Chrome Extension Permissions

**Manifest permissions** (`dist/manifest.json` — production build):

```json
"permissions": ["storage", "scripting", "activeTab"],
"host_permissions": ["https://chatgpt.com/*", "https://chat.openai.com/*"]
```

| Permission | Justification | Risk |
|------------|---------------|------|
| `storage` | Reads `apiBaseUrl`, `featureFlags`, `debugMode` from `chrome.storage.local` | Low — no page data stored |
| `scripting` | Injects content scripts into ChatGPT tabs | Controlled — only on declared hosts |
| `activeTab` | Not used at runtime (declared defensively) | Low |
| `https://chatgpt.com/*` | ChatGPT adapter target | Scoped to known hosts only |
| `https://chat.openai.com/*` | Legacy ChatGPT domain | Scoped to known hosts only |

**Test-only manifest** (`dist-test/manifest.json`) adds:
```json
"host_permissions": ["http://127.0.0.1:*/*"]
```

This is intentional for E2E fixture testing and is never distributed.

---

## 8. Data Flow Summary

```
ChatGPT page (DOM)
  │
  │  only: element presence / absence (MutationObserver, no text reads)
  ▼
chatgpt.wait-state.ts
  │
  │  WaitStateEvent { adapterId, timestamp } — no page content
  ▼
chatgpt.ts / fixture-test.ts
  │
  │  chrome.runtime.sendMessage({ type: "GET_AD_DECISION", adapterId })
  ▼
service-worker.ts
  │
  │  GET /v1/ads/decision?adapterName=chatgpt
  ▼
PromptProfit API
  │
  │  SponsoredMoment { adDecisionId, creativeId, headline, body, displayUrl, expiresAt }
  ▼
chatgpt.renderer.ts  ←  writes only API-supplied text to extension-owned DOM
  │
  │  POST /v1/events  (via service-worker)
  │  payload: { eventType, eventId, adDecisionId, sessionId, adapterId, ... }
  │  NO page content in payload — validated by PrivacyGuard
  ▼
PromptProfit API (telemetry endpoint)
```

---

## 9. Smoke Script and Report Pipeline Audit

The following files generate output visible to the user and were audited in
addition to the extension source.

### scripts/run-local-real-api-smoke.ps1

| Pattern | Finding | Classification |
|---------|---------|----------------|
| `$env:PROMPTPROFIT_DEV_API_KEY` | Key held in process env only; never written to output | SAFE |
| `Authorization` header | Set once in preflight; value never written to any stream | SAFE |
| `Get-Content $latest.FullName -Raw` | Reads ASCII-only MD file; key is not in reports | SAFE |
| `Sanitize()` function | Strips non-printable bytes from child output | SAFE |
| DB query | Calls query-local-browser-events.ps1 with `-Adapter chatgpt` only | SAFE |

### scripts/query-local-browser-events.ps1

| Pattern | Finding | Classification |
|---------|---------|----------------|
| Selected columns | `id, created_at, adapter_name, status, ad_decision_id, campaign_id, creative_id, device_id, requested_at, rendered_at` | SAFE |
| Never selected | `user_id, fraud_signals, idempotency_key, payload JSON` | SAFE |
| Adapter filter | Parameterized `LIKE '%chatgpt%'` — no SQL injection (value validated with `^[a-zA-Z0-9_-]+$`) | SAFE |

### scripts/check-no-secret-leaks.js

Scans for `ppft_[0-9a-f]{48,}` in source and generated reports. All 317
source files pass clean. Confirmed: no real key pattern exists in committed code.

### apps/browser-extension/e2e/live/live-chatgpt-smoke.spec.ts

| Pattern | Finding | Classification |
|---------|---------|----------------|
| `process.env["PROMPTPROFIT_DEV_API_KEY"]` | Read once, passed to `configureExtensionStorage` only | SAFE |
| `console.log("... (key: [redacted])")` | API key value is NOT logged; only the literal string `[redacted]` | SAFE |
| `apiKey` in `configureExtensionStorage` | Written to `chrome.storage.local` by service worker evaluate; not to reports | SAFE |
| Report JSON/MD fields | `testId, timestamp, result, checks, eventCount, eventTypes, notes` — no key fields | SAFE |
| `page.goto(CHATGPT_URL)` | Navigation only; no content read | SAFE |
| `page.waitForSelector(...)` | Selector targets extension-owned elements only | SAFE |

### scripts/list-local-api-smoke-reports.js

Reads `.md` and `.json` files from `test-results/local-api/`. JSON fields
read: `result`, `apiBackend`, `checks[].name`, `checks[].result`. No
sensitive fields are read or printed. Classification: SAFE.

### Generated Reports (test-results/)

Reports contain: `testId`, `timestamp`, `result`, `checks`, `eventCount`,
`eventTypes`, `notes`. None of these fields include API keys, page content,
URLs, or user data. Reports are git-ignored and ASCII-only after spec fix.

---

## 10. Threat Model Alignment

Cross-referenced against `docs/03-threat-model.md`:

| Threat | Mitigated by | Verified |
|--------|-------------|---------|
| Extension reads ChatGPT prompt text | No `textContent`/`innerHTML` reads in source | ✓ |
| Extension reads page URL path/query | Only `.hostname` used | ✓ |
| Extension exfiltrates cookies | No `document.cookie` access | ✓ |
| Content script makes direct network calls | All network via service worker | ✓ |
| Forbidden fields in telemetry events | `PrivacyGuard` + E2E privacy tests | ✓ |
| Debug panel leaks page data | `DebugState` fields are boolean/pre-approved codes only | ✓ |
| Test threshold affects production | `testViewabilityThresholdMs` read only by `fixture-test.ts` | ✓ |

---

## 11. Audit Conclusion

No privacy violations or security issues were found in the production source,
test scripts, or report-generating code. All grep searches returned only
expected hits (privacy guard definitions, documentation comments, or
extension-owned DOM writes). The data flow is restricted to structural DOM
signals (element presence) and API-supplied content.

The secret leak check (`check-no-secret-leaks.js`) scanned 317 files and
found zero instances of real ppft_ key patterns.

**Coverage gaps (not audited in this pass):**
- Third-party npm dependencies (a full `npm audit` + license scan is
  recommended before public release)
- Chrome Web Store review requirements (CSP headers, remote code execution)
- The PromptProfit API server itself (out of scope for browser extension audit)

**Post-local-API smoke additions (previous session):**
- `service-worker.ts` deviceId/extensionVersion params - SAFE (no page data)
- `expiresAt` normalisation - SAFE (numeric conversion, no new data read)
- `run-local-real-api-smoke.ps1` preflight - SAFE (Authorization header not logged)
- `query-local-browser-events.ps1` rewrite - SAFE (privacy-safe columns confirmed)

**Post-billing-smoke additions (this session):**

| Script | Pattern | Finding | Classification |
|--------|---------|---------|----------------|
| `run-local-billing-ledger-smoke.ps1` | API key handling | Key minted via get-local-dev-api-key.ps1; cleared from env after last event POST; never printed | SAFE |
| `run-local-billing-ledger-smoke.ps1` | Event payloads | Only backend-assigned IDs (adDecisionId, campaignId, creativeId) + extension metadata; no page content | SAFE |
| `run-local-billing-ledger-smoke.ps1` | Ledger API response | Logs entryType, amountMicrocents, referenceType only; no user data or page content | SAFE |
| `run-local-billing-ledger-smoke.ps1` | Postgres query | Queries ledger_entries by reference_id; columns: entry_type, amount_microcents; no user-identifiable fields | SAFE |
| `run-local-billing-ledger-smoke.ps1` | Report content | Contains event status, ledger amounts, invariant result; no keys, no page data | SAFE |
| `run-local-click-billing-smoke.ps1` | Same patterns as billing smoke | Key cleared after click event POST; click payload has only adDecisionId + creativeId | SAFE |
| `query-local-ledger.ps1` | Postgres query | Queries: entry_type, reference_type, account_type, amount_microcents, balance_after_microcents, created_at; no PII | SAFE |
| `query-local-billing-events.ps1` | Postgres query | Queries: id, status, adapter_name, ad_decision_id, campaign_id, device_id, created_at; no page content | SAFE |
| `query-local-ledger.ps1` | SQL injection | AccountType and ReferenceType validated against allowlist before use in SQL; no user input passed to psql | SAFE |
| `query-local-billing-events.ps1` | SQL injection | Status validated against allowlist; Adapter validated as `^[a-zA-Z0-9_-]+$`; no raw user input in SQL | SAFE |
| `package-browser-extension.mjs` | File access | Reads dist/ directory only; no network calls; no API key access | SAFE |
| `audit-browser-extension-package.js` | File access | Reads dist/ and .vscodeignore; no network calls; no API key access | SAFE |
| `audit-vsix-package.js` | File access | Reads apps/extension/dist/ and .vscodeignore; no network calls; no secrets | SAFE |

All new billing smoke scripts refuse to run against non-local API URLs (exit 3) and
non-local DATABASE_URL values (exit 3). Event payloads submitted to the local API
contain only extension-internal metadata and backend-assigned identifiers - the same
privacy constraints as the production extension. No forbidden fields (pageTitle,
pageUrl, domText, cookies, authToken) appear in any request or report.
