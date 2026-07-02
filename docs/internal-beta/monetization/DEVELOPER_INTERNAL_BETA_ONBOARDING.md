# PromptProfit — Developer Internal Beta Onboarding

**Phase:** Internal Beta Monetization Readiness
**Date:** 2026-07-02
**Audience:** Internal/synthetic test developers participating in the
monetization pilot only. **Not for real/external developers** — public
developer onboarding is blocked until public-release gates pass, and no
real payout will ever be sent during this pilot.

---

## How developer credits are simulated/tracked

- When PromptProfit shows a sponsored banner in your (test) environment
  and the tester's session generates a billable impression or click, a
  `developer_credit` ledger entry is created for your developer account —
  60% of the advertiser's charge (`MONETIZATION_SOURCE_AUDIT.md` Q6),
  computed by the real production `LedgerCalculator`.
- Your running total is tracked in `developerProfiles.totalEarnedMicrocents`.
  This number is **real, in the sense that the math is real and verified**
  — but it does not represent money you can withdraw during this pilot.

## What payout simulation means

- `pnpm -w run simulate:payouts` computes what a payout **batch** would
  look like for a set of developers, entirely in memory, using the real
  ledger math — see `PAYOUT_SIMULATION_REPORT.md` for the current example
  run.
- This is a **projection/simulation**, not a real payout run. No payout
  provider (Stripe Connect or otherwise) is integrated in this codebase
  today (confirmed by source review — `MONETIZATION_SOURCE_AUDIT.md` Q18).

## When payouts are not real

**Always, during this pilot.** There is no code path anywhere in this
repository that sends a real payout. The `payouts` and `payout_batches`
database tables exist in the schema, but nothing writes to them. If you
see a "payable" status for your synthetic account in a payout simulation
report, this means "would be payable, if a real payout system existed and
this were a real account" — it does not mean a payment is coming.

## How ledger rows are reviewed

- Every credit to your account is an individual, immutable ledger row
  (`ledger_entries` table — `entryType: "developer_credit"`,
  `referenceType: "impression"` or `"click"`, an `amountMicrocents` value,
  and a `balanceAfterMicrocents` snapshot).
- You (or the pilot owner, on your behalf) can review your ledger via
  `GET /v1/ledger/me` (paginated, developer-scoped) or via
  `query:local-ledger` if you have local stack access.
- Each row's `description` is a fixed, templated string
  (e.g. `"Impression earning: <id>"`) — never freeform text, never
  ChatGPT content.

## What data is not collected

PromptProfit's billing/event pipeline never collects, and this pilot never
asks you to provide:
- ChatGPT prompt text, response text, or chat history
- Page content, page title, or full page URL
- Cookies, session tokens, or localStorage/sessionStorage contents
- Screenshots, videos, or traces of tester sessions
- Any tester's personal/identifying information

The only identifiers in any billing event are server-generated UUIDs
(impression ID, click ID, ad-decision ID) and a pseudonymous, per-device
identifier that is not linked to any tester's real identity — verified in
`MONETIZATION_PRIVACY_REVIEW.md`.

## Support / escalation path

- Pilot owner: **[OWNER TBD]**
- For a question about your ledger balance: report your developer ID and
  the approximate time window of the event in question.
- For an emergency stop request: contact the pilot owner directly; see
  `FIRST_MONETIZATION_PILOT_CHECKLIST.md` "Emergency stop / kill-switch"
  for the current (manual, DB-access-gated) process.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real developer account data to this document.**
