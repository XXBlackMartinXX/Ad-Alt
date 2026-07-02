# PromptProfit — Internal Beta Pilot Issue Template

**Phase:** Internal Beta Pilot Rehearsal

> Copy the block below into a new issue (or a new section of your tracker)
> for every issue found during a pilot rehearsal or a real internal pilot
> session. Fill in every field — leave `[TBD]` only if genuinely unknown
> at filing time, and update it before the issue is closed.

---

## Issue Template

```
### Issue ID
PILOT-ISSUE-[NUMBER]

### Issue Title
[One-line summary]

### Severity
[S0 / S1 / S2 / S3 / S4 -- see severity guide below]

### Area
[billing / ledger / reconciliation / payout / privacy / fraud / rollback / operational / documentation]

### Detected By
[Operator name or "pilot:rehearsal automated check"]

### Date
[YYYY-MM-DD]

### Synthetic Scenario ID
[e.g. "valid-impression", "duplicate-impression", "rehearsal-developer-payable" --
use the scenarioId / developerId from scripts/fixtures/internal-beta-pilot-fixtures.js]

### Expected Result
[What the rehearsal plan or report said should happen]

### Actual Result
[What actually happened -- quote the exact PASS/FAIL line from the
rehearsal output or report, not a paraphrase]

### Privacy/Security Impact
[NONE / describe -- e.g. "forbidden field X appeared in ledger entry Y".
Never paste real ChatGPT content, real user data, or real API keys here,
even to illustrate the issue -- describe it in your own words instead.]

### Billing Impact
[NONE / describe -- e.g. "advertiser_charge did not match expected amount"]

### Ledger Impact
[NONE / describe -- e.g. "duplicate event created a second set of ledger entries"]

### Payout Impact
[NONE / describe -- e.g. "developer classified payable instead of pending"]

### Reconciliation Impact
[NONE / describe -- e.g. "grand total invariant failed by N microcents"]

### Rollback Needed
[YES / NO -- if YES, reference docs/internal-beta/monetization/KILL_SWITCH_AND_ROLLBACK_REVIEW.md
for the applicable procedure]

### Owner
[Name or "[OWNER TBD]"]

### Status
[OPEN / IN PROGRESS / RESOLVED / WONT FIX]

### Resolution Notes
[Filled in when resolved -- what changed, in which commit]

### Verification Command
[Exact command to re-run and confirm the fix, e.g.
"pnpm -w run pilot:rehearsal" or "pnpm -w run test:scripts"]
```

---

## Severity Guide

| Severity | Meaning | Example |
|----------|---------|---------|
| **S0** | Critical security/privacy/fund-movement issue | A forbidden field (prompt text, page content, API key) appears in a ledger row or report; any code path that could move real money is discovered |
| **S1** | Blocks internal pilot | A billing split invariant fails; duplicate events are billed twice; a fraud-blocked event is billed |
| **S2** | Blocks scale-up or requires fix before next rehearsal | A payout status is misclassified; a non-critical report section is malformed |
| **S3** | Minor operational issue | A command's output formatting is confusing; a documentation cross-reference is stale |
| **S4** | Documentation/cosmetic | A typo in a report; a missing Oxford comma in a doc |

**S0 and S1 issues force a STOP or HOLD decision respectively in
`GO_NO_GO_INTERNAL_PILOT_REHEARSAL.md`** — do not mark a rehearsal PASS or
proceed to a real pilot while an S0/S1 issue from this template remains
OPEN or IN PROGRESS.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to any
issue filed with this template.**
