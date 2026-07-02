# PromptProfit — Monetization Source Audit

**Phase:** Internal Beta Monetization Readiness
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Baseline commit:** 7c9b4cc
**Scope:** billing, ledger, event processing, fraud, payout schema, reconciliation

> This is a source-code audit backed by direct file inspection and command
> output in this session. Where a claim could not be independently verified in
> this environment (no Docker/PowerShell available in this sandbox), it is
> labeled **not verified yet** rather than assumed. Prior-session evidence
> (dated 2026-06-30/07-01) is cited separately from this session's evidence
> and is not re-claimed as freshly verified.

---

## 1. Method

Source inspected directly (file + line references below):

- `packages/ledger/src/calculator.ts`, `packages/ledger/src/types.ts`
- `apps/api/src/services/ledger.service.ts`
- `apps/api/src/services/event-processor.ts`
- `apps/api/src/services/fraud.service.ts`
- `packages/fraud/src/scorer.ts`
- `apps/api/src/routes/events.ts`, `apps/api/src/routes/ledger.ts`
- `packages/database/src/schema/ledger.ts`, `events.ts`, `campaigns.ts`, `users.ts`
- `apps/api/src/redis.ts`
- `packages/shared/src/constants/index.ts`, `packages/shared/src/types/index.ts`
- `packages/platform-core/src/privacy-guard.ts`
- `apps/api/src/__tests__/ledger-balance.test.ts`, `ledger.test.ts`, `events.test.ts`
- `packages/ledger/src/__tests__/calculator.test.ts`
- Existing docs: `docs/internal-beta/BILLING_VERIFICATION_SUMMARY.md`,
  `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md`, `docs/EVENT_LEDGER_DEDUP_REVIEW.md`

Commands run this session:
```
pnpm -w run check:billing:reconciliation -- --mode internal-beta   # PASS WITH WARNINGS
pnpm -w run smoke:billing:local          # FAIL — pwsh not found (sandbox has no PowerShell)
pnpm -w run smoke:billing:click:local    # FAIL — pwsh not found (sandbox has no PowerShell)
pnpm -w run verify                       # PASS — includes apps/api test:unit (68 tests, incl. 8 ledger-balance tests)
node -e "... import('./packages/ledger/dist/index.js') ..."  # confirmed real LedgerCalculator math (see §2)
```

---

## 2. Answers to the 20 audit questions

### Q1. What event types are billable?
`viewability_threshold_met` (impression billing) and `click` (click billing) —
both only when `FraudScorer` returns decision `"pass"`.
Evidence: `apps/api/src/services/event-processor.ts:254` (`if (fraudResult.decision === "pass") { await ledgerService.recordImpression(...) }`) and `:335` (`if (fraudResult.decision === "pass" && click) { await ledgerService.recordClick(...) }`).

### Q2. What event types are non-billable?
`impression_requested` and `impression_rendered` are lifecycle-tracking only
— they update `impression_events.status` but never call `LedgerService`.
Evidence: `event-processor.ts:94-164` (`processImpressionRequested`,
`processImpressionRendered` — neither calls `ledgerService`).
A `viewability_threshold_met` or `click` event that scores `"review"` or
`"block"` is also non-billable (status becomes `viewable`/`pending`/
`fraud_blocked`, ledger is never called).

### Q3. What is the billing unit?
Microcents (`amountMicrocents`, integer, `1 USD = 1,000,000 microcents`).
Evidence: `packages/shared/src/constants/index.ts:32`
(`MICROCENTS_PER_DOLLAR = 1_000_000`); all ledger/campaign amounts in
`packages/database/src/schema/ledger.ts` and `campaigns.ts` are
`bigint(..., { mode: "number" })` in microcents. No floating-point currency
math anywhere in the calculator (`LedgerCalculator` uses native `bigint`
division, not `number`/float).

### Q4. What is the price per impression?
There is **no fixed platform price**. Impression price = the advertiser's
own per-campaign CPM bid, divided by 1000:
`totalMicrocents = params.cpmBidMicrocents / 1000n`.
Evidence: `packages/ledger/src/calculator.ts:29`. `cpmBidMicrocents` comes
from `campaigns.cpmBidMicrocents`, set by the advertiser at campaign
creation (`packages/database/src/schema/campaigns.ts:45`).

### Q5. What is the price per click?
`click value = impression value × 10` (hardcoded multiplier, not
advertiser-configurable).
Evidence: `packages/ledger/src/calculator.ts:4`
(`const CLICK_IMPRESSION_MULTIPLIER = 10n;`) and `:76`
(`totalMicrocents = impressionValue * CLICK_IMPRESSION_MULTIPLIER`).
**Risk note:** this multiplier is a code constant, not a per-campaign or
per-creative configurable value — any change requires a code deploy, not a
campaign-config change. Documented here as a fact, not a defect.

### Q6. What split goes to developer credit?
60% of the total charge (`DEVELOPER_SHARE_PERCENT = 60`), applied identically
to impressions and clicks.
Evidence: `packages/shared/src/constants/index.ts:29`;
`calculator.ts:30` (`developerAmountMicrocents = (totalMicrocents * this.developerSharePercent) / 100n`).

### Q7. What split goes to platform fee?
Remainder after developer share — **not** a separately-multiplied 40%, it is
`total - developerAmount`, which guarantees the two always sum to the total
exactly (no rounding-drift risk from computing both shares independently).
Evidence: `calculator.ts:31` (`platformAmountMicrocents = totalMicrocents - developerAmountMicrocents`).
`PLATFORM_FEE_PERCENT = 40` (`shared/src/constants/index.ts:26`) exists as a
constructor-validated constant (`platformFeePercent + developerSharePercent !== 100` throws) but is not used in the actual per-entry math — it is used only for validation and `LedgerCalculator.platformFeePercent` (documented in `calculator.ts:7` as "Retained for parity checking and display").

### Q8. What gets charged to advertiser?
The full `totalMicrocents` (100% of CPM-derived value) is debited from the
advertiser account and the same figure is checked against
`campaigns.budgetMicrocents`/`spentMicrocents` before the charge is applied.
Evidence: `ledger.service.ts:90-100` (budget check) and `:107-112`
(`applyBalanceDelta(tx, result.advertiserCharge.account, -Number(...), now)`
— negative delta = debit).

### Q9. How are duplicate impressions handled?
Three independent layers:
1. **Redis atomic dedup** — `SET dedup:<eventId> 1 EX 86400 NX`, a single
   atomic Redis command; race-safe by construction.
   Evidence: `apps/api/src/redis.ts:38-42`.
2. **DB-level unique constraint** as durability backup — `eventDeduplicationKeys.key` has a unique index (`packages/database/src/schema/events.ts:179,187`), written with `.onConflictDoNothing()`.
3. **Idempotency-key unique index** on `impression_events.idempotency_key` and `click_events.idempotency_key` (`events.ts:23,67,107,139`) — belt-and-suspenders even if Redis/dedup-key layer were bypassed.

### Q10. How are duplicate clicks handled?
Same three layers as Q9, applied identically (click events share the same
`EventProcessor.process()` entry point and dedup gate at
`event-processor.ts:40-47`).

### Q11. How is replay prevented?
Same Redis `SET ... NX` + DB unique-key mechanism as Q9/Q10 — a replayed
event carries the **same** `eventId`, so it is rejected before any DB or
ledger work happens (`event-processor.ts:44-47`, checked first, before the
kill-switch check and before the event-type switch).
**Verified this session** (via re-reading, and confirmed passing in the
existing test `apps/api/src/__tests__/ledger-balance.test.ts:439`
"replaying the exact same eventId is rejected by Redis dedup before reaching
the ledger" — part of the 68 `apps/api` tests that passed in this session's
`pnpm -w run verify`).
A **separate** replay class — resending a *fresh* `eventId` for an event
that is logically a repeat (e.g. a second `viewability_threshold_met` for
the same `adDecisionId`) — is caught by a different mechanism: the SQL
`UPDATE ... WHERE status = 'rendered'` lifecycle gate
(`event-processor.ts:218-236`) only matches while status is still
`"rendered"`; once billed, status moves to `"billable"`/`"viewable"`, so a
second call matches zero rows and is dropped
(`event-processor.ts:238-245`, `fraudDecision: "invalid_state"`). This is
also covered by the existing test at `ledger-balance.test.ts:403-426`.

### Q12. How are concurrent events handled?
Two different concurrency mechanisms depending on which invariant is at risk:
- **Campaign budget** — `SELECT ... FOR UPDATE` row lock on the `campaigns`
  row inside the transaction (`ledger.service.ts:66-71`, `:189-194`) —
  serializes concurrent impressions/clicks against the *same campaign* so
  budget cannot be over-spent by a race.
- **Account balances** — `INSERT ... ON CONFLICT DO UPDATE` atomic upsert
  (`ledger.service.ts:29-57`, `applyBalanceDelta`) rather than
  select-then-update, so concurrent deltas to the same account (e.g. the
  same developer earning from two different campaigns at once) serialize on
  the row without lost updates, and without needing the row pre-seeded.
- **Impression lifecycle** — relies on Postgres's own per-statement row
  locking: a bare `UPDATE ... WHERE status = 'rendered'` naturally
  serializes two concurrent transitions of the same row (second one sees 0
  matched rows after the first commits). No explicit `FOR UPDATE` is taken
  here, but the pattern is correct under Postgres's default READ COMMITTED
  isolation because `UPDATE` itself takes a row lock for the duration of the
  statement.
Existing test evidence: `ledger-balance.test.ts:545-559`
("two concurrent recordImpression calls both apply without losing an
update") — part of this session's passing `apps/api` test:unit run.

### Q13. What ledger entries are created per billable event?
Exactly three, always inserted together in one array in one `tx.insert(ledgerEntries).values([...])` call: `advertiser_charge`, `developer_credit`, `platform_fee`.
Evidence: `ledger.service.ts:126-163` (impression), `:245-282` (click).
No code path exists that writes fewer or more than these three for a
billable event.

### Q14. Are ledger writes atomic?
Yes, within a single event: the campaign row lock, budget check, all three
`applyBalanceDelta` upserts, the `ledgerEntries` insert, the
`developerProfiles.totalEarnedMicrocents` increment, and the
`campaigns.spentMicrocents` increment all happen inside one
`db.transaction(async (tx) => {...})` block (`ledger.service.ts:64-180`,
`:188-299`) — a Postgres crash or error mid-way rolls back the entire set,
never a partial write.
**Caveat:** atomicity is a property of the real Postgres transaction; it has
been exercised in this session only against the in-memory fake DB used by
the existing vitest suite, not against a live Postgres instance (**not
verified yet** in this environment — no Docker available).

### Q15. Are ledger entries balanced?
Yes, by construction and by an explicit runtime check:
`LedgerCalculator.verifyBalance()` asserts
`developerAmountMicrocents + platformAmountMicrocents === totalMicrocents`
(`calculator.ts:115-117`) and `LedgerService` calls this **before** any
write and **throws** (aborting the transaction) if it fails
(`ledger.service.ts:85-88`, `:208-211`). Because `platformAmountMicrocents`
is computed as `total - developerAmount` (Q7), this check can only fail from
a logic bug upstream (e.g. a corrupted `cpmBidMicrocents`), not from
independent rounding of two percentages — a stronger guarantee than
"charge = credit + fee by convention."

### Q16. Are negative balances possible?
Not prevented at the account-balance level for the **advertiser** account:
`applyBalanceDelta` is called with a negative delta for advertiser charges
(`ledger.service.ts:107-112`) with no floor check against
`balances.balanceMicrocents` — an advertiser's running balance can go
negative if their `campaigns.budgetMicrocents` allowance is what's actually
enforced (Q8), not their account balance. The **campaign budget** is the
real spend-limit control (`spentMicrocents + chargeAmount > budgetMicrocents`
check, `ledger.service.ts:93`), and once exceeded the campaign is marked
`"exhausted"` and stops billing — but the `balances` table itself has no
`CHECK (balance_microcents >= 0)` constraint or application-level floor.
This is a **documented gap, not a crash risk**: developer/platform balances
only ever receive credits (never go negative by construction), and
advertiser balance being negative is an accounting representation of "owes
more than initially funded," which is expected in a post-paid/invoice model
but would need an explicit design decision (prepaid floor vs. postpaid
invoicing) before a real-money pilot. Flagged in the risk register (Phase 6).

### Q17. Are refunds/voids implemented?
**No.** The ledger entry type enum anticipates them
(`"refund_debit" | "refund_credit"` in `packages/database/src/schema/ledger.ts:28-29`
and `packages/ledger/src/types.ts:7`) but **no service method, route, or
script creates a `refund_debit`/`refund_credit` entry anywhere in the
codebase** (confirmed by `grep -rn "refund" apps/api/src` returning only
`Promise<void>` false-positive matches). This matches
`docs/internal-beta/BILLING_VERIFICATION_SUMMARY.md:78`
("Refund/reversal: NOT IMPLEMENTED — Out of scope for internal beta"),
recorded in a prior session.

### Q18. Are payouts implemented or simulated only?
**Neither, currently — schema-only.** `payouts` and `payoutBatches` tables
exist (`packages/database/src/schema/ledger.ts:86-155`) with a
`stripeTransferId` column, and `developerProfiles.totalPaidOutMicrocents`
exists (`packages/database/src/schema/users.ts:162-166`), but **no route,
service, or script in `apps/api/src` ever inserts into `payouts` or
`payoutBatches`, or calls any payment processor** (`grep -rn "stripe|Stripe|payout" apps/api/src` returns zero matches outside schema/types). `apps/api/src/routes/ledger.ts:44-51`
computes `pendingMicrocents = totalEarned - totalPaidOut` for **display
only** — nothing ever increments `totalPaidOutMicrocents`. This confirms
the mission's premise: payout simulation (Phase 4 of this readiness effort)
needs to be built from scratch; there is no real payout code to
accidentally trigger.

### Q19. Is reconciliation implemented?
**Partially — invariant checking exists, batch reconciliation does not.**
- The `advertiser_charge === developer_credit + platform_fee` invariant is
  enforced **inline, per-event, before write** via `verifyBalance()` (Q15) —
  this is real, running code.
- A **separate batch reconciliation pass** (e.g. a job that re-derives
  balances from `ledgerEntries` and compares against the `balances` table,
  or that transitions `impression_events.status` from `"billable"` to
  `"reconciled"`) **does not exist**. The `"reconciled"` status value is
  defined in the type/schema (`packages/shared/src/types/index.ts:64`) and
  is *read* in one place (`event-processor.ts:282`, click eligibility check
  treats `"billable"` and `"reconciled"` as equally valid) but **is never
  written anywhere** (`grep -n '"reconciled"' apps/api/src` finds only that
  one read site). `check:billing:reconciliation` (the existing readiness
  gate script) checks for the *existence of docs and local smoke evidence*,
  not for an actual reconciliation computation.

### Q20. What is missing for a real monetization pilot?
Directly from the evidence above:
1. No batch/periodic reconciliation job (only inline per-event invariant
   checking) — Q19.
2. No refund/void implementation — Q17.
3. No payout execution — only schema exists — Q18.
4. No floor/guard on negative advertiser balances beyond campaign-level
   budget exhaustion — Q16.
5. No staging/production reconciliation evidence — `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md` §8 Audit Log is empty ("(not yet run)").
6. Local Docker billing smoke (`smoke:billing:local`,
   `smoke:billing:click:local`) could not be re-verified in this sandbox
   session (no PowerShell/Docker available) — the only evidence is the
   prior-session record in `BILLING_VERIFICATION_SUMMARY.md` (dated
   2026-07-01), which is **not re-confirmed this session**.
7. No fraud/abuse controls specific to a real-money context (see Phase 6:
   `FRAUD_ABUSE_CONTROLS.md`) beyond the existing `FraudScorer` signals,
   which were designed for the ad-serving pipeline, not payout risk.

---

## 3. Confirmed facts (source-verified this session)

| # | Fact | Evidence |
|---|------|----------|
| 1 | Billing unit is integer microcents, no floats in calculator math | `calculator.ts` (bigint arithmetic throughout) |
| 2 | Impression price = advertiser CPM bid / 1000; no fixed platform price | `calculator.ts:29` |
| 3 | Click price = impression price × 10 (hardcoded constant) | `calculator.ts:4,76` |
| 4 | Developer split 60%, platform gets remainder (not independently computed) | `calculator.ts:30-31`, `shared/constants:29` |
| 5 | Exactly 3 ledger entries per billable event, inserted together | `ledger.service.ts:126-163,245-282` |
| 6 | Ledger writes happen inside a single DB transaction per event | `ledger.service.ts:64,188` |
| 7 | Balance invariant checked and enforced (throws) before write | `calculator.ts:115-117`, `ledger.service.ts:85-88,208-211` |
| 8 | Duplicate/replay protection: Redis atomic SET NX + DB unique constraints (3 layers) | `redis.ts:38-42`, `events.ts` schema |
| 9 | Campaign budget race protected by `SELECT ... FOR UPDATE` | `ledger.service.ts:66-71,189-194` |
| 10 | Account balance race protected by atomic upsert | `ledger.service.ts:29-57` |
| 11 | Refunds/voids: type exists, zero implementation | grep confirmed zero non-type matches |
| 12 | Payouts: schema exists, zero implementation | grep confirmed zero matches in apps/api/src |
| 13 | Batch reconciliation: does not exist; only inline invariant check | grep confirmed single read-only reference to `"reconciled"` |
| 14 | Ledger route (`/v1/ledger/me`) exposes only aggregate/entry data, no forbidden fields | `routes/ledger.ts:47-59` |

## 4. Unverified assumptions / not verified yet this session

| # | Item | Why not verified | Path to verify |
|---|------|------------------|-----------------|
| 1 | Real Postgres transaction atomicity under crash/error | No Docker/Postgres in this sandbox | Staging reconciliation run per `PRODUCTION_BILLING_RECONCILIATION_PLAN.md` |
| 2 | `smoke:billing:local` / `smoke:billing:click:local` pass in this session | Requires `pwsh` + Docker, neither available in this sandbox | Re-run on a machine with Docker + PowerShell |
| 3 | Fraud guard behavior under real network/load conditions | Only unit-level `FraudScorer` logic reviewed | Staging fraud guard checklist, `PRODUCTION_BILLING_RECONCILIATION_PLAN.md` §3.4 |
| 4 | Negative advertiser balance behavior in a real pilot | No product decision recorded on prepaid vs. postpaid | Needs explicit stakeholder decision — flagged in risk register |

## 5. Missing controls (risk-ranked)

| # | Missing control | Risk level | Blocks internal beta? | Blocks public release? |
|---|------------------|-----------|------------------------|--------------------------|
| 1 | Batch/periodic reconciliation job | Medium | No (inline invariant check covers per-event correctness) | Yes |
| 2 | Refund/void implementation | Medium | No (internal beta uses synthetic/test accounts only) | Yes |
| 3 | Real payout execution + provider integration | Low for internal beta (simulation is sufficient per this mission) | No | Yes |
| 4 | Negative-balance floor/guard for advertiser accounts | Medium | No (campaign budget is the operative control) | Yes — needs explicit billing-model decision |
| 5 | Staging reconciliation evidence | High for public release | No | Yes (hard blocker, `check:billing:reconciliation --mode public-release`) |

---

## 6. Summary

The core billing math (`LedgerCalculator`) is simple, deterministic,
integer-only, and self-balancing by construction. The write path
(`LedgerService`) is transactional and has real concurrency protection for
both the two invariants that matter (campaign budget, account balance).
Duplicate/replay protection is layered (Redis + two DB unique constraints)
and independently exercised in the existing `apps/api` test suite, which
passed in this session (`pnpm -w run verify`, 68/68 `apps/api` tests,
`ledger-balance.test.ts` 8/8).

What does **not** exist yet is anything beyond single-event correctness:
no refunds, no real payouts, no batch reconciliation, and no staging/
production evidence. This matches the mission's premise exactly — this
audit is the basis for Phases 2-8, which build the missing
confidence/reconciliation/simulation/documentation layer for an
**internal, synthetic-data-only** monetization pilot, while leaving every
public-release gate correctly blocked.
