---
# PromptProfit — Internal Beta Test Plan

**Version:** Internal Beta 1 | **Date:** 2026-07-01 | **Branch:** `claude/ecstatic-maxwell-h0d8d8`

---

## 1. Test Scope

| In Scope | Out of Scope |
|----------|-------------|
| ChatGPT browser adapter (chatgpt.com only) | Claude, Gemini, Desktop adapters |
| Local Docker API integration | Production API |
| Impression billing (local) | Staging/production billing |
| Click billing (local) | Payout / refunds |
| VS Code extension packaging | VS Code Marketplace listing |
| Fixture E2E automation | Live ChatGPT automation in CI |
| Privacy guard (fixture) | End-user PII in test data |

---

## 2. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js v20+ | `node --version` |
| pnpm 9.4+ | `pnpm --version` |
| Docker Desktop | Required for billing smoke only |
| Google Chrome latest | Load unpacked extension |
| Repository cloned at correct branch | `git branch --show-current` → `claude/ecstatic-maxwell-h0d8d8` |

---

## 3. Pre-Test Environment Setup

```bash
git checkout claude/ecstatic-maxwell-h0d8d8
pnpm install --frozen-lockfile
pnpm -r build
```

---

## 4. Automated Test Suite

### 4.1 ASCII / Secret Checks

```bash
pnpm -w run check:ps1          # Expected: 10/10 PS1 files ASCII-clean
pnpm -w run check:secrets:local # Expected: 333 files, 0 leaks
pnpm -w run check:report-ascii # Expected: all templates ASCII-clean
```

### 4.2 Fixture E2E Tests

```bash
pnpm -w run smoke:chatgpt:fixture
```

Expected: **13/13 passing**

Test coverage:
- Extension loads and initialises
- Wait-state detection fires
- Sponsored moment renders
- Kill-switch prevents events
- Missing API config shows no banner
- Viewability threshold event fires at test threshold
- Privacy fields absent from events (tests 11–13)

### 4.3 Unit Tests

```bash
pnpm --filter @ad-alt/browser-extension test:unit
```

Expected: **105/105 passing**

### 4.4 TypeScript / Lint

```bash
pnpm -w run verify
```

Expected: 0 TypeScript errors, 0 lint errors.

### 4.5 License Gate

```bash
pnpm -w run check:license -- --mode internal-beta
```

Expected: exit 0 with WARN (no LICENSE — documented blocker).

### 4.6 Beta Packet Completeness

```bash
pnpm -w run check:internal-beta-packet
```

Expected: all required docs present, no overclaiming detected.

---

## 5. Local Real-API Smoke Test

Requires Docker + Postgres. See `docs/LOCAL_REAL_API_SMOKE_MODE.md` for full setup.

```bash
pnpm -w run smoke:chatgpt:local-api
```

Expected: impression_requested, impression_rendered events appear in local DB; no API keys printed.

---

## 6. Billing Smoke Tests

Requires Docker + local API running.

```bash
pnpm -w run smoke:billing:local        # Impression billing smoke
pnpm -w run smoke:billing:click:local  # Click billing smoke
```

Expected: reports generated at `test-results/local-billing/`; invariant `developer_credit + platform_fee == advertiser_charge` PASS in both reports.

Billing reconciliation gate:
```bash
pnpm -w run check:billing:reconciliation -- --mode internal-beta
```

Expected: PASS / WARN (staging not run — acceptable for internal beta).

---

## 7. Package Audit Tests

```bash
pnpm -w run package:browser:beta
pnpm -w run package:browser:zip:audit -- --mode internal-beta
pnpm -w run package:vscode:vsix:audit -- --mode internal-beta
pnpm -w run package:browser:audit -- --mode internal-beta
pnpm -w run package:vscode:audit -- --mode internal-beta
```

All expected: PASS.

---

## 8. Manual Human ChatGPT Test

> **IMPORTANT privacy rule:** Only submit harmless, generic, non-personal prompts.

**Suggested prompt (safe):**
> "Count slowly from 1 to 10."

**Instructions:**
1. Load the extension (see BETA_TESTER_INSTALLATION_GUIDE.md)
2. Configure local API key
3. Navigate to https://chatgpt.com
4. Submit the suggested prompt
5. Observe:
   - Does the ad overlay appear while the model is generating?
   - Does the overlay disappear when generation completes?
   - Are there console errors?
   - Does the viewability event fire after ~5 seconds?
6. Record findings (without including prompt text, response text, or personal data)

**Prohibited prompts:** Anything personal, medical, financial, legal, confidential, or private.

---

## 9. Privacy/Security Checks

```bash
pnpm -w run check:secrets:local  # Verify no API keys in committed code
```

Review `docs/internal-beta/PRIVACY_SECURITY_ONE_PAGER.md` before testing.

Verify no forbidden fields in network requests:
- Open Chrome DevTools → Network
- Watch requests to the local API
- Confirm payloads contain ONLY: `adId`, `impressionId`, `deviceId`, `extensionVersion`, backend-assigned IDs
- Confirm payloads do NOT contain: page content, URLs, cookies, auth tokens

---

## 10. Pass/Fail Criteria

### PASS

- All automated checks exit 0
- Fixture E2E: 13/13
- Unit tests: 105/105
- Sponsored moment appears on ChatGPT wait-state
- No forbidden fields in event payload (privacy guard passes)
- Billing invariant passes in local smoke reports
- ZIP and VSIX artifact audits pass in internal-beta mode

### INCONCLUSIVE

- Docker not available (billing smoke cannot run)
- ChatGPT UI has changed selectors (adapter may need update)
- Local API returns no eligible campaign (no banner = expected, not a failure)
- VS Code extension cannot be installed (VS Code version < 1.80)

### FAIL

- Any fixture E2E test fails
- Any unit test fails
- TypeScript or lint errors
- Secret leak scan detects a ppft_ key
- ZIP or VSIX contains source maps, .env, or test artifacts
- Billing invariant fails: developer_credit + platform_fee != advertiser_charge
- Privacy fixture tests 11–13 fail (forbidden field in event payload)

---

## 11. Bug Report Template

```markdown
## Bug Report

**Date:**
**Chrome version:**
**OS:**
**Extension version/commit:**

### Repro Steps
1.
2.
3.

### Expected Behavior

### Actual Behavior

### Console Output (redacted of keys and personal data)

### Network Errors (if any)

### Additional Notes

---
*Privacy reminder: Do not include ChatGPT prompt/response text, personal data, or API keys.*
```

---

## 12. Safe Evidence Policy

| Allowed in bug reports | Prohibited in bug reports |
|-----------------------|--------------------------|
| Console error messages | ChatGPT prompt text |
| Network error codes (no bodies) | ChatGPT response text |
| Repro steps (generic) | API keys (ppft_ or any) |
| Chrome/OS version | Screenshots with personal data |
| Timestamp | page URLs beyond domain |
| Extension state (debug panel) | localStorage / cookie values |
