# Production Billing Reconciliation Plan

**Status:** STAGING NOT YET VERIFIED — this document records the plan; staging execution is a pre-production gate.
**Date:** 2026-06-30
**Applies to:** PromptProfit ChatGPT browser adapter, impression billing, click billing

> **CANARY 12:** Do not claim production billing is verified until staging reconciliation is complete.
> The `check:billing:reconciliation` script (in `--mode public-release`) will fail until staging is done.

---

## 1. Scope

This plan governs reconciliation of the PromptProfit billing pipeline in staging and production environments. It covers:
- Impression billing (viewability_threshold_met → ledger entries)
- Click billing (click event → ledger entries at 10× impression rate)
- Billing invariant verification (developer_credit + platform_fee === advertiser_charge)
- Fraud guard validation
- Viewability threshold enforcement
- Payout integrity
- Rollback procedures

Local Docker smoke is **not** a substitute for staging reconciliation. Local smoke verifies the pipeline mechanics; staging verifies the full system under realistic conditions with production infrastructure.

---

## 2. Staging Environment Prerequisites

| Requirement | Detail |
|------------|--------|
| Staging API endpoint | A dedicated staging instance of the PromptProfit API (separate from production) |
| Staging Postgres DB | Separate DB from production; safe to reset and reseed |
| Staging browser extension | Loaded unpacked against staging API key |
| Staging campaign | At least one active campaign with `browser_chatgpt` placement configured |
| Billing reconciler | The billing reconciler service must be running in staging (not just local dev) |
| Fraud detection | Fraud guard rules configured in staging environment |

---

## 3. Staging Reconciliation Checklist

### 3.1 Impression Billing — Staging

| Step | Expected Outcome | Gate |
|------|-----------------|------|
| Load extension in staging Chromium | Extension initialises, no errors in service worker | PASS required |
| Navigate to chatgpt.com, trigger wait-state | `impression_requested`, `impression_rendered` events fire | PASS required |
| Wait 5 seconds for viewability threshold | `viewability_threshold_met` fires | PASS required |
| Query staging ledger via API | 3 ledger entries present: `advertiser_charge`, `developer_credit`, `platform_fee` | PASS required |
| Verify invariant | `developer_credit + platform_fee === advertiser_charge` to the cent | PASS required |
| Verify split | `developer_credit` = 60% of `advertiser_charge`; `platform_fee` = 40% | PASS required |
| Verify currency precision | No floating-point rounding errors; amounts match expected integer arithmetic | PASS required |
| Run reconciler | Reconciler processes the impression; balance sheet updated | PASS required |
| Re-query after reconciler | No duplicate entries; idempotent run produces same result | PASS required |

### 3.2 Click Billing — Staging

| Step | Expected Outcome | Gate |
|------|-----------------|------|
| Trigger a click event in staging | `click` event fires with correct `adId` | PASS required |
| Query staging ledger | 3 click ledger entries present | PASS required |
| Verify click rate | Click billing = 10× impression billing rate | PASS required |
| Verify click invariant | `developer_credit + platform_fee === advertiser_charge` for click entry | PASS required |
| Dedup check | Duplicate click with same `eventId` does NOT create a second ledger entry | PASS required |

### 3.3 Viewability — Staging

| Step | Expected Outcome | Gate |
|------|-----------------|------|
| Load extension with staging API | Viewability timer uses production 5000ms threshold | PASS required |
| Observe DOM timer in staging environment | Timer fires at ≥5000ms; not configurable from page | PASS required |
| Verify event payload | No page content, URL path, or cookies in event | PASS required |

### 3.4 Fraud Guard — Staging

| Step | Expected Outcome | Gate |
|------|-----------------|------|
| Verify fraud rules configured in staging | At least one fraud guard rule active | PASS required |
| Send a rapid-fire sequence of impression events | Fraud guard blocks or flags repeated requests | PASS required |
| Verify flagged events are NOT billed | No ledger entry for fraud-flagged events | PASS required |
| Verify legitimate events ARE billed | Non-flagged events do create ledger entries | PASS required |

---

## 4. Reconciliation Verification

After staging smoke, run reconciliation to confirm:

1. All impression events in `impression_events` table have corresponding ledger entries.
2. No orphaned ledger entries exist (entries without a matching impression event).
3. Total `advertiser_charge` across the test run matches expected value (number of billable events × rate).
4. `developer_credit` balance sums to 60% of total `advertiser_charge`.
5. `platform_fee` balance sums to 40% of total `advertiser_charge`.
6. Reconciler idempotency: running reconciler twice produces no duplicates.

---

## 5. Payout Integrity

| Check | Detail |
|-------|--------|
| Payout ledger correct | Developer payout reflects only verified `developer_credit` entries |
| Platform fee retained | Platform fee not erroneously included in payout |
| No negative balances | Refunds / reversals leave no negative developer balances unless intended |
| Staging payout NOT sent to real accounts | Staging payouts must go to test accounts only |

---

## 6. Privacy Verification in Staging

| Check | Detail |
|-------|--------|
| No page content in staging events | Query `impression_events` in staging DB; verify no `pageContent`, `url_path`, `cookies` columns |
| No auth tokens in staging events | Verify event payload contains only allowed fields |
| API key not in logs | Staging API logs must not contain raw `ppft_` API keys |

---

## 7. Rollback Criteria

Rollback staging and halt production deployment if:

- The billing invariant fails: `developer_credit + platform_fee ≠ advertiser_charge` for any event
- Duplicate ledger entries appear after reconciler run
- Fraud guard allows a known-bad event sequence to generate billing entries
- Any `ppft_` API key appears in staging logs or event payloads
- Reconciler exits non-zero in staging (unhandled error)
- Click billing rate does not match 10× impression rate

### Rollback Procedure

1. Disable the staging browser extension API key immediately.
2. Stop the billing reconciler in staging.
3. Document the failing event IDs and ledger entry IDs.
4. Do NOT deploy to production until root cause is identified and fixed.
5. Fix, re-run staging smoke, re-run reconciler, re-verify invariant.
6. Only proceed to production after staging passes completely.

---

## 8. Audit Log

All staging reconciliation runs must be documented here before production deployment is approved:

| Date | Environment | Run by | Impression OK | Click OK | Invariant OK | Fraud OK | Reconciler OK | Notes |
|------|-------------|--------|--------------|----------|-------------|---------|-------------|-------|
| (not yet run) | staging | — | — | — | — | — | — | Awaiting staging environment |

---

## 9. Production Deployment Gate

Production deployment of billing is blocked until:

- [ ] All staging reconciliation checks PASS
- [ ] Audit log above is filled in with at least one complete staging run
- [ ] `check:billing:reconciliation --mode public-release` would pass if staging entry existed
- [ ] docs/PUBLIC_RELEASE_READINESS_MATRIX.md updated to reflect staging PASS
- [ ] Sign-off from at least one engineer who reviewed the staging audit log

---

## 10. References

- Local Docker smoke: `pnpm smoke:billing:local` / `pnpm smoke:billing:click:local`
- Local smoke scripts: `scripts/run-local-billing-ledger-smoke.ps1`, `scripts/run-local-click-billing-smoke.ps1`
- Readiness check: `pnpm check:billing:reconciliation`
- Event dedup review: `docs/EVENT_LEDGER_DEDUP_REVIEW.md`
- Readiness matrix: `docs/PUBLIC_RELEASE_READINESS_MATRIX.md`
- Privacy audit: `docs/CHATGPT_BROWSER_PRIVACY_SECURITY_AUDIT.md`
