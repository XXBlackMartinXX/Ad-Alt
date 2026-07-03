# PromptProfit — Manual Revenue Record Template

**Phase:** Fast Controlled Revenue Pilot Launch Sprint

> **Purpose:** allow the founder/operator to record a controlled pilot
> revenue event manually, without building production billing yet. This
> is a record-keeping template, not a payment processor. Copy the block
> below once per collected payment.

---

## Warnings (read before filling this in)

- **Do not store card data.** No card numbers, CVVs, or expiry dates.
- **Do not store bank credentials.** No account/routing numbers.
- **Do not store API keys.** Raw `ppft_...` keys must never appear here.
- **Do not store ChatGPT content.** No prompt text, response text, or
  chat history, even as "context" for the record.
- **This is NOT production billing.** This template does not represent,
  imply, or create an automated billing system. It is a manual paper
  trail for a single controlled pilot payment.
- **No developer payout is owed automatically from this template.**
  Filling this in does not trigger, authorize, or imply any developer
  payout — real payout execution remains disabled (CANARY 7, CANARY 11).
  `simulate:payouts` classification is informational only.

---

## Record Template

```
### Pilot ID
[e.g. "pilot-001"]

### Date
[YYYY-MM-DD]

### Advertiser Name or Code
[Real name if explicitly provided for this record, or a code/alias --
never store more advertiser PII here than necessary for the record itself]

### Campaign Code
[The campaigns.id or a human-readable code for it]

### Approved Budget Cap
[$____ total, $____ daily -- must match CONTROLLED_REVENUE_PILOT_CRITERIA.md]

### Amount Actually Collected
[$____ -- the real amount received, which may be less than the budget
cap if the campaign did not fully spend]

### Collection Method
[e.g. "bank transfer", "check", "invoice + ACH" -- describe the method,
never record account/routing/card numbers here]

### Collection Reference
[An invoice number, transfer confirmation ID, or similar reference --
never a card number, account number, or raw payment credential]

### Ledger Evidence Location
[e.g. "query:local-ledger output reviewed 2026-07-03, campaign
<campaign-id>, total advertiser_charge = $X.XX, matches collected amount"]

### Reconciliation Result
[PASS / FAIL -- from `pnpm -w run check:billing:reconciliation -- --mode internal-beta`,
re-run at the time of this record]

### Refund/Adjustment Needed
[YES / NO -- if YES, describe; note that no refund/void code path exists
in this repo yet (see MONETIZATION_SOURCE_AUDIT.md Q17) -- any refund is
a manual, out-of-band action, recorded here, not an application feature]

### Developer Payout Status
[DISABLED / SIMULATED ONLY -- must always be one of these two values for
this phase; never "PAID" or "SENT", since no real payout code exists]

### Owner Approval
[Name and date of founder/owner sign-off on this record]

### Notes
[Anything else relevant -- no ChatGPT content, no payment credentials]
```

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
