# PromptProfit -- Payout Simulation Report

**Generated:** 2026-07-02T19:53:45.302Z
**Generator:** scripts/simulate-payouts.js
**Invariant (developer earned + platform retained == advertiser charged):** PASS

> **This is a SIMULATION. No real money moves.** No payment processor
> (Stripe, PayPal, bank transfer, or otherwise) is called anywhere in this
> script or in the application code it models. Confirmed by source review
> (`docs/internal-beta/monetization/MONETIZATION_SOURCE_AUDIT.md`, Q18):
> the `payouts`/`payout_batches` database tables exist in the schema, but
> no route, service, or script in `apps/api/src` ever writes to them or
> calls a payment processor. All developer/advertiser IDs below are
> synthetic fixtures defined in this script, not real accounts.

---

## Simulation policy inputs (placeholders, not shipped constants)

No minimum-payout-threshold or manual-review-threshold constant exists
anywhere in `packages/shared` or the application code -- these are
simulation-only placeholder values pending a real business-policy decision:

- Minimum payout threshold: $10.00
- Large-payout manual-review threshold: $100.00
- Fraud-block-ratio manual-review threshold: 20%

---

## Synthetic developers

| Developer (synthetic) | Impressions | Clicks | Fraud-blocked | Gross charged | Developer earned | Platform retained | Status | Reason |
|---|---|---|---|---|---|---|---|---|
| synthetic-developer-01 | 300 | 15 | 0 | $22.50 | $13.50 | $9.00 | payable | meets minimum threshold, below review thresholds, payoutEmail present |
| synthetic-developer-02 | 5 | 0 | 0 | $0.25 | $0.15 | $0.10 | pending | below minimum payout threshold ($10.00) |
| synthetic-developer-03 | 100 | 5 | 0 | $15.00 | $9.00 | $6.00 | held | no payoutEmail on file (developerProfiles.payoutEmail is null) |
| synthetic-developer-04 | 1000 | 100 | 0 | $200.00 | $120.00 | $80.00 | manual_review | payout amount >= large-payout review threshold ($100.00) |
| synthetic-developer-05 | 200 | 30 | 60 | $25.00 | $15.00 | $10.00 | manual_review | fraud-block ratio 23% >= review threshold (20%) |

---

## Batch totals

| Field | Amount |
|-------|--------|
| Gross advertiser charged | $262.75 |
| Developer earned (total) | $157.65 |
| Platform retained | $105.10 |
| Payable this batch | $13.50 |
| Pending (below minimum threshold) | $0.15 |
| Held (missing payout info) | $9.00 |
| Manual review required | $135.00 |

---

## Refund / adjustment placeholder

Refunds and voids are **not implemented** anywhere in the application code
(`refund_debit`/`refund_credit` ledger entry types exist only in the type
enum -- see `MONETIZATION_SOURCE_AUDIT.md` Q17). This simulation therefore
applies zero refunds/adjustments to every developer. If a real pilot needs
to adjust a developer's payable amount downward (e.g. a post-hoc fraud
finding), that requires new application code, not just a simulation change.

| Developer | Adjustment | Reason |
|-----------|-----------|--------|
| synthetic-developer-01 | $0.00 | refund/void not implemented in application code |
| synthetic-developer-02 | $0.00 | refund/void not implemented in application code |
| synthetic-developer-03 | $0.00 | refund/void not implemented in application code |
| synthetic-developer-04 | $0.00 | refund/void not implemented in application code |
| synthetic-developer-05 | $0.00 | refund/void not implemented in application code |

---

## Next steps to a real payout provider integration

1. Choose and integrate a real payout provider (e.g. Stripe Connect) --
   none is integrated today; `advertiserProfiles.stripeCustomerId` and
   `payouts.stripeTransferId` are schema placeholders only.
2. Implement a real batch-payout service that writes to `payout_batches`
   and `payouts`, and updates `developerProfiles.totalPaidOutMicrocents`
   (today nothing ever writes to either).
3. Decide and codify the minimum-payout and manual-review thresholds used
   above as real, reviewed business policy (not simulation placeholders).
4. Implement refund/void ledger entries before enabling any adjustment flow.
5. Add staging reconciliation for payouts per
   `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md` section 5 (Payout Integrity).
6. Only after 1-5: pilot with a small number of real developers under a
   explicit, sign-off-gated real-money policy.

---

**Privacy warning: Do not add real developer emails, real payout details,
real API keys, or real financial account data to this report or to this
script's synthetic fixtures.**
