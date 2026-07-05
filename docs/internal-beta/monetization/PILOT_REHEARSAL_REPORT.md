# PromptProfit -- Internal Beta Pilot Rehearsal Report

**Generated:** 2026-07-05T00:06:12.665Z
**Generator:** scripts/run-internal-beta-pilot-rehearsal.js
**Commit:** d5cecc1
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Decision:** PASS (30 passed, 0 failed -- 0 critical, 0 normal)

> **This is a REHEARSAL using synthetic data only.** No real advertiser,
> no real developer, no real money, no real payout, no payment processor,
> no ChatGPT session. See
> docs/internal-beta/monetization/PILOT_REHEARSAL_PLAN.md for scope.
> This report does NOT claim public release, production, or real-payout
> readiness under any circumstance.

---

## Synthetic scenario summary

- Synthetic advertiser: `rehearsal-advertiser-001` (advertiser@example.test)
- Synthetic developer: `rehearsal-developer-001` (developer@example.test)
- Synthetic campaign: `rehearsal-campaign-001` (CPM $5.00)
- Synthetic placement: `rehearsal-placement-001` (browser_chatgpt)

## Event counts

| Category | Count |
|----------|-------|
| Accepted (billed) events | 2 |
| Rejected duplicate/replay events | 3 |
| Fraud-blocked events (core walkthrough) | 2 |
| Payout-scenario developers | 4 |

## Expected vs actual ledger entries (core walkthrough)

| Type | Expected microcents | Actual microcents | Match |
|------|---------------------|--------------------|-------|
| advertiser_charge | 55000 | 55000 | YES |
| developer_credit | 33000 | 33000 | YES |
| platform_fee | 22000 | 22000 | YES |

## Payout simulation result (per developer)

| Developer (synthetic) | Earned | Fraud-blocked | Status |
|------------------------|--------|----------------|--------|
| rehearsal-developer-below-threshold | $0.03 | 0 / 5 | pending |
| rehearsal-developer-payable | $12.00 | 0 / 2000 | payable |
| rehearsal-developer-held | $3.00 | 0 / 500 | held |
| rehearsal-developer-fraud-ratio | $12.00 | 600 / 2600 | manual_review |

## Reconciliation result (grand total, entire rehearsal run)

| Field | Amount |
|-------|--------|
| Grand total advertiser_charge | $45.10 |
| Grand total developer_credit | $27.06 |
| Grand total platform_fee | $18.04 |
| Invariant (charge === credit + fee) | PASS |
| Total ledger entries written | 13521 |

## Privacy result

No forbidden private fields (prompt/response/page/token/etc.) were found in
any ledger entry, and no `ppft_` API key pattern was found in the fixture
source. See the full scenario table below for the exact checks run.

## Full scenario/invariant table

| # | Check | Severity | Result | Detail |
|---|-------|----------|--------|--------|
| 1 | Fixture module exports all 12 required scenario objects | critical | PASS |  |
| 2 | Core fixture IDs are deterministic (rehearsal- prefixed, not random) | normal | PASS |  |
| 3 | Synthetic emails use the reserved example.test domain, not a real domain | critical | PASS |  |
| 4 | Scenario 1 (valid impression) is billed | critical | PASS |  |
| 5 | Scenario 1 advertiser_charge amount matches expected (5000) | critical | PASS | actual=5000 |
| 6 | Scenario 1 developer_credit amount matches expected (3000) | critical | PASS |  |
| 7 | Scenario 1 platform_fee amount matches expected (2000) | critical | PASS |  |
| 8 | Scenario 2 (duplicate impression) is rejected, zero new ledger entries | critical | PASS |  |
| 9 | Scenario 3 (delayed replay of the same impression) is rejected, zero new ledger entries | critical | PASS |  |
| 10 | Scenario 4 (valid click after a billable impression) is billed | critical | PASS |  |
| 11 | Scenario 4 advertiser_charge amount matches expected (50000) | critical | PASS |  |
| 12 | Scenario 5 (click without prior billable impression) is fraud-blocked, not billed | critical | PASS | reason=fraud_block |
| 13 | Scenario 6 (repeated click, same eventId) is rejected, zero new ledger entries | critical | PASS |  |
| 14 | Scenario 7 (implausibly short dwell time) is fraud-blocked, not billed | critical | PASS | reason=fraud_block |
| 15 | Core billing totals match expected (advertiser_charge) | critical | PASS | actual=55000 expected=55000 |
| 16 | Core billing totals match expected (developer_credit) | critical | PASS |  |
| 17 | Core billing totals match expected (platform_fee) | critical | PASS |  |
| 18 | Split invariant exact for core walkthrough: advertiser_charge === developer_credit + platform_fee | critical | PASS |  |
| 19 | Accepted event count matches expected (2) | critical | PASS | actual ledger entries=6, expected=6 |
| 20 | No double billing: total ledger entries === accepted events x 3, exactly (event idempotency holds) | critical | PASS | actual=6 |
| 21 | rehearsal-developer-below-threshold: earned $0.03, classified "pending" matches expected "pending" | normal | PASS | earned actual=30000 expected=30000; status actual=pending expected=pending |
| 22 | rehearsal-developer-payable: earned $12.00, classified "payable" matches expected "payable" | normal | PASS | earned actual=12000000 expected=12000000; status actual=payable expected=payable |
| 23 | rehearsal-developer-held: earned $3.00, classified "held" matches expected "held" | normal | PASS | earned actual=3000000 expected=3000000; status actual=held expected=held |
| 24 | rehearsal-developer-fraud-ratio: earned $12.00, classified "manual_review" matches expected "manual_review" | normal | PASS | earned actual=12000000 expected=12000000; status actual=manual_review expected=manual_review |
| 25 | Grand total advertiser_charge matches expected reconciliation outcome | critical | PASS | actual=45105000 expected=45105000 |
| 26 | Grand total developer_credit matches expected reconciliation outcome | critical | PASS |  |
| 27 | Grand total platform_fee matches expected reconciliation outcome | critical | PASS |  |
| 28 | Reconciliation invariant holds across the entire rehearsal run (advertiser_charge === developer_credit + platform_fee) | critical | PASS |  |
| 29 | No forbidden private fields in any of 13521 ledger entries | critical | PASS | hits=[] |
| 30 | No ppft_ API key pattern found in the fixture source file | critical | PASS |  |

## Open issues

None. Every invariant passed.

## Final rehearsal decision

**PASS**

Every invariant in this rehearsal passed. This means the tooling and
scenario data are internally consistent and ready for an operator to run
per `docs/internal-beta/monetization/INTERNAL_PILOT_OPERATOR_RUNBOOK.md`.
This does NOT mean public release, production, or real-payout readiness --
see `docs/internal-beta/monetization/GO_NO_GO_INTERNAL_PILOT_REHEARSAL.md`
for the full decision record and what remains explicitly blocked.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
report or to any rehearsal fixture.**
