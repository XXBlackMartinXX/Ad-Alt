---
# PromptProfit — Privacy & Security One-Pager

**Version:** Internal Beta 1 | **Date:** 2026-07-01 | **Audit:** `docs/CHATGPT_BROWSER_PRIVACY_SECURITY_AUDIT.md`

---

## What Data Is Collected

The PromptProfit browser extension collects only these fields per impression event:

| Field | Purpose | Source |
|-------|---------|--------|
| `adId` | Identifies which ad was shown | Backend-assigned at ad decision |
| `impressionId` | Unique ID for this impression | Backend-assigned |
| `campaignId` | Identifies the campaign | Backend-assigned |
| `creativeId` | Identifies the creative shown | Backend-assigned |
| `deviceId` | Anonymous extension instance identifier | Randomly generated at install |
| `extensionVersion` | Extension build version | Hardcoded in build |
| `sequenceNumber` | Monotonic event counter per session | Extension-generated |
| `eventId` | Per-event UUID for dedup | crypto.randomUUID() per event |
| `sessionId` | Per-content-script-lifetime ID | Generated at content script load |
| `timestamp` | Event time | Extension-generated |

---

## What Data Is NEVER Collected

The extension explicitly does NOT collect, store, or transmit:

| Data | Status |
|------|--------|
| ChatGPT prompt text | NEVER — no DOM text reads |
| ChatGPT response text | NEVER — no DOM text reads |
| Chat history | NEVER |
| Page title | NEVER |
| Full page URL | NEVER — only `window.location.hostname` |
| URL path or query string | NEVER |
| Cookies | NEVER |
| Auth tokens | NEVER |
| localStorage / sessionStorage | NEVER |
| Clipboard contents | NEVER |
| Screenshots / videos / traces | NEVER |
| User identity | NEVER |
| Personal data of any kind | NEVER |

---

## Privacy Guard Enforcement

A `PrivacyGuard` validates every outbound event and rejects any event containing a forbidden field. Three fixture E2E tests (tests 11–13) specifically verify:
- No forbidden fields in ad request payloads
- No forbidden fields in event payloads
- No page content in DOM interactions

---

## API Key Handling

- API keys (`ppft_...`) are stored in `chrome.storage.local` only
- Keys are never printed to console, reports, logs, or committed files
- Keys are never transmitted in event payloads
- Automated secret scan (`pnpm check:secrets:local`) verifies 333 files and reports 0 leaks
- Keys are cleared from environment variables after local smoke scripts complete

---

## Local Report Handling

Smoke test reports (`test-results/local-billing/*.md`) contain:
- Event status (accepted/duplicate)
- Ledger amounts in microcents
- Invariant pass/fail
- No API keys, no page content, no personal data

Reports are git-ignored and ASCII-only.

---

## What Testers Must NOT Include in Bug Reports

- ChatGPT prompt or response text
- Page URLs beyond `chatgpt.com`
- Cookie values or auth tokens
- API keys (`ppft_` or any)
- Screenshots containing personal data
- localStorage or sessionStorage values
- Any personal, medical, financial, or legal data

---

## How to Run the Secret Scan

```bash
pnpm -w run check:secrets:local
```

Expected: 0 leaks across 333 files. If any `ppft_` key pattern is found in committed files, treat as a CRITICAL incident and rotate the key immediately.

---

## How to Verify No Page Content Is Sent

1. Open Chrome DevTools → Network
2. Watch POST requests to the local API (`/v1/events` or similar)
3. Inspect request body
4. Confirm presence of ONLY: `adId`, `impressionId`, `campaignId`, `creativeId`, `deviceId`, `extensionVersion`, `sequenceNumber`, `eventId`, `sessionId`, `timestamp`
5. Confirm ABSENCE of: `pageContent`, `pageTitle`, `url`, `cookies`, `authToken`, `prompt`, `response`

---

## Current Privacy Confidence

| Area | Confidence | Evidence |
|------|-----------|---------|
| No DOM text reads | HIGH | Grep audit clean; no innerHTML/textContent reads from ChatGPT DOM |
| No full URL reads | HIGH | Only hostname used; grep audit clean |
| No cookie access | HIGH | No document.cookie; grep audit clean |
| No auth token reads | HIGH | Grep audit clean |
| No secrets in artifacts | HIGH | check:secrets:local passes 333 files |
| No secrets in ZIP | HIGH | ZIP artifact audit checks forbidden patterns |
| No secrets in VSIX | HIGH | VSIX artifact audit checks forbidden patterns |
| Privacy guard enforcement | HIGH | 3 fixture E2E tests verify no forbidden fields |

---

## Remaining Privacy Risks

| Risk | Status |
|------|--------|
| Third-party npm dependency audit | NOT RUN — recommended before public release |
| CSP (Content Security Policy) audit for CWS | NOT RUN — required before CWS submission |
| Staging event payload inspection | PENDING — requires staging environment |
| Long-run session test (many events) | NOT RUN — edge case for dedup/leak |
