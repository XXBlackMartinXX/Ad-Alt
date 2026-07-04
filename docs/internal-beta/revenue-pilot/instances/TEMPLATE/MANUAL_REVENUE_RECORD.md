# Manual Revenue Record — TEMPLATE

> Copy the block below once per collected payment. This is a
> record-keeping template, not a payment processor. See
> `docs/internal-beta/revenue-pilot/MANUAL_REVENUE_RECORD_TEMPLATE.md`
> for the full warnings and field-by-field guidance.

## Warnings

- Do not store card data, bank credentials, or API keys here.
- Do not store ChatGPT prompt/response/chat content here.
- This is NOT production billing and does not imply any developer
  payout — real payout execution remains disabled.

## Record

```
Pilot ID: TEMPLATE
Date: [YYYY-MM-DD]
Buyer alias: [MISSING]
Approved budget cap: [MISSING]
Amount actually collected: $____
Collection method: [e.g. "bank transfer", "check", "invoice + ACH"]
Collection reference: [invoice/transfer ID -- never a card/account number]
Ledger evidence location: [e.g. query:local-ledger output reviewed <date>]
Reconciliation result: [PASS / FAIL from check:billing:reconciliation --mode internal-beta]
Refund/adjustment needed: [YES / NO]
Developer payout status: DISABLED / SIMULATED ONLY (never "PAID" or "SENT")
Owner approval: [name/initials and date]
Notes: [no ChatGPT content, no payment credentials]
```

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real buyer contact/payment details, real API keys, or real payment credentials to this document.**
