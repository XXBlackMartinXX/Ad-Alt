---
# PromptProfit — Billing Verification Summary

**Version:** Internal Beta 1 | **Date:** 2026-07-01

> **IMPORTANT:** Local Docker billing smoke is verified. Staging and production billing are NOT verified. Do not claim production billing readiness.

---

## 1. Local Impression Billing Smoke

| Item | Result |
|------|--------|
| Script | `pnpm smoke:billing:local` |
| Status | PASS |
| Environment | Local Docker (non-production) |
| Events fired | impression_requested, impression_rendered, viewability_threshold_met |
| Ledger entries | 3 per impression: advertiser_charge, developer_credit, platform_fee |
| advertiser_charge | 500 microcents |
| developer_credit | 300 microcents (60%) |
| platform_fee | 200 microcents (40%) |
| Invariant | developer_credit + platform_fee == advertiser_charge: PASS |
| Report | `test-results/local-billing/billing-ledger-smoke-*.md` |
| Report validation | Size > 0, correct heading, no ppft_ keys, ASCII-clean: PASS |

---

## 2. Local Click Billing Smoke

| Item | Result |
|------|--------|
| Script | `pnpm smoke:billing:click:local` |
| Status | PASS |
| Environment | Local Docker (non-production) |
| Events fired | impression chain + click event |
| Click rate | 10x impression rate |
| advertiser_charge | 5000 microcents |
| developer_credit | 3000 microcents (60%) |
| platform_fee | 2000 microcents (40%) |
| Invariant | developer_credit + platform_fee == advertiser_charge: PASS |
| Report | `test-results/local-billing/click-billing-smoke-*.md` |
| Report validation | Size > 0, correct heading, no ppft_ keys, ASCII-clean: PASS |

---

## 3. Event Lifecycle Verified (Local)

```
impression_requested  →  [API accepts]  →  ledger: advertiser_charge created
impression_rendered   →  [API accepts]
viewability_threshold_met  →  [API accepts]  →  ledger: developer_credit + platform_fee created
click (separate smoke) →  [API accepts]  →  ledger: click entries at 10x rate
```

---

## 4. Ledger Invariant

Both impression and click billing verified the invariant:

```
developer_credit + platform_fee == advertiser_charge
300 + 200 == 500  (impression)
3000 + 2000 == 5000  (click)
```

The invariant is checked by the smoke script and reported in the ledger report.

---

## 5. What Is NOT Verified

| Item | Status | Path to Verify |
|------|--------|---------------|
| Staging reconciliation | NOT RUN | See `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md` |
| Production reconciliation | NOT RUN | Requires staging first |
| Payout pipeline | NOT IMPLEMENTED | Out of scope for internal beta |
| Refund/reversal | NOT IMPLEMENTED | Out of scope for internal beta |
| Duplicate/replay under load | NOT TESTED | Idempotency reviewed; load test not run |
| Fraud guard (staging) | NOT TESTED | Requires staging environment |
| Long-run session billing | NOT TESTED | Edge case for many impressions per session |
| Reconciler idempotency | NOT TESTED | Requires staging reconciler |

---

## 6. Commands to Rerun

```bash
# Must have Docker running and local API seeded first

pnpm -w run smoke:billing:local
pnpm -w run smoke:billing:click:local

# Check reconciliation readiness
pnpm -w run check:billing:reconciliation -- --mode internal-beta
```

---

## 7. How to Read Billing Reports

Reports are located at:
```
apps/browser-extension/test-results/local-billing/
```

Each report is a Markdown file containing:
- Timestamps and event statuses (accepted/duplicate)
- Ledger amounts in microcents
- Invariant result (PASS/FAIL)
- No API keys, no page content

To view latest report:
```bash
pnpm -w run smoke:chatgpt:reports:list
```

---

## 8. How to Query Local Ledger Safely

```bash
pnpm -w run query:local-ledger
pnpm -w run query:local-billing-events
```

These scripts:
- Connect only to local Docker Postgres
- Select safe columns only (no PII)
- Validate input against allowlists (no SQL injection)
- Exit 3 if a non-local database URL is detected

---

## 9. Remaining Production Blockers

1. Staging environment not configured
2. Staging billing reconciliation not run
3. Fraud guard not tested in staging
4. Reconciler idempotency not confirmed
5. No audit log entry in `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md`
6. No engineer sign-off on staging results

**Do not claim production billing readiness until all items above are resolved.**
