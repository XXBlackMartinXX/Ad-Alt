# PromptProfit — Internal Beta Pilot Rehearsal Plan

**Phase:** Internal Beta Pilot Rehearsal
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Baseline commit:** 48a1641 (this phase's changes land on top)

---

## 1. Purpose

Prove, end to end and repeatably, that an operator can run a simulated
monetization pilot — synthetic advertiser, synthetic developer, synthetic
campaign, synthetic events, ledger writes, reconciliation, and payout
simulation — entirely with deterministic synthetic data, before any real
or controlled human participant is ever invited into a monetization
pilot. This is a **rehearsal**, not the pilot itself: it exercises the
tooling and the operator's own understanding of it, not real people.

## 2. Scope

In scope: the billing/ledger pipeline as it exists today (impression and
click events, `LedgerCalculator` split math, duplicate/replay rejection,
fraud-scoring gates, payout simulation, reconciliation). Out of scope:
DRYRUN-001 runtime/banner verification (already completed separately —
see `docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md`; this phase
does not re-run or re-debug it), and anything requiring a live
Postgres/Redis/staging environment (this rehearsal runs entirely via
deterministic, in-memory synthetic fixtures — see
`MONETIZATION_SOURCE_AUDIT.md` for why the real DB-coupled services
cannot be driven directly from a plain `node` script).

## 3. Synthetic-only rule

Every account, campaign, event, and amount used in this rehearsal is
synthetic, fixed in source code, and clearly labeled as such (IDs
prefixed `synthetic-`/`rehearsal-`, emails on the `example.test` reserved
domain). No real advertiser is charged. No real developer is credited
outside the simulation. No real payout is sent. No payment processor is
called — none is integrated anywhere in this codebase (confirmed in
`MONETIZATION_SOURCE_AUDIT.md` Q18). No ChatGPT prompt, response, chat
history, DOM content, page title, URL, cookie, token, or personal data is
read, stored, or logged by this rehearsal — it never touches the browser
extension or a real ChatGPT session at all; it only exercises the
billing/ledger/payout-simulation code path in isolation.

## 4. Roles

| Role | Responsibility in this rehearsal |
|------|-----------------------------------|
| Operator | Runs `pnpm -w run pilot:rehearsal` and the supporting checks per `INTERNAL_PILOT_OPERATOR_RUNBOOK.md`, reads the PASS/HOLD/STOP decision, records issues using `PILOT_ISSUE_TEMPLATE.md` |
| Reviewer | Reviews the generated `PILOT_REHEARSAL_REPORT.md` and this plan's go/no-go criteria (§15) before signing off |
| Synthetic advertiser | Not a real role — a fixed fixture record (`syntheticAdvertiser` in `scripts/fixtures/internal-beta-pilot-fixtures.js`) standing in for an advertiser account |
| Synthetic developer | Not a real role — a fixed fixture record (`syntheticDeveloper`) standing in for a developer account |
| Release manager | Reads `GO_NO_GO_INTERNAL_PILOT_REHEARSAL.md`, decides whether to proceed to inviting a real, controlled internal pilot participant (a decision explicitly OUT OF SCOPE for this rehearsal itself) |

## 5. Pre-flight requirements

Before running the rehearsal:

1. Repository on branch `claude/windows-release-pipeline-fix-xfj0sw`, working tree clean.
2. `pnpm install --frozen-lockfile` succeeds.
3. `pnpm -r build` succeeds (the rehearsal script dynamic-imports the real
   built `@ad-alt/ledger`, `@ad-alt/fraud`, and `@ad-alt/platform-core`
   packages, same as `check-ledger-confidence.js`).
4. `pnpm -w run check:secrets:local` passes (no leaked keys before you
   start).
5. DRYRUN-001 functional runtime remains PASS (not re-verified by this
   rehearsal — see §2).

## 6. Event flow

The rehearsal replays this fixed sequence against a synthetic in-memory
ledger engine (the same pattern `check-ledger-confidence.js` uses,
described there as a "synthetic ledger engine" — see that script's header
comment for why a live DB-coupled service cannot be driven directly):

```
1. valid impression                  -> billed
2. duplicate impression (same eventId) -> rejected, not billed
3. replayed impression (delayed resend, same eventId) -> rejected, not billed
4. valid click after a billable impression -> billed
5. click without a prior billable impression -> fraud-blocked, not billed
6. repeated click (same eventId)     -> rejected, not billed
7. suspicious fraud-ratio scenario   -> fraud-blocked, not billed
```

## 7. Billing flow

Every billed event produces exactly 3 ledger entries
(`advertiser_charge`, `developer_credit`, `platform_fee`), computed by the
REAL, built `@ad-alt/ledger` `LedgerCalculator` — not a reimplementation.
Pricing follows the same rules documented in
`MONETIZATION_SOURCE_AUDIT.md` Q4-Q7: impression price = campaign CPM bid
/ 1000, click price = impression price x 10, developer share = 60%,
platform fee = remainder (not independently computed, so it can never
drift from the total by a rounding error).

## 8. Ledger flow

The rehearsal script asserts, for every billed event: exactly 3 entries
created, correct entry types, correct amounts, and
`advertiser_charge === developer_credit + platform_fee` to the microcent.
Rejected events (duplicate/replay/fraud-blocked) must create **zero**
ledger entries — this is checked explicitly, not assumed.

## 9. Reconciliation flow

After all events are replayed, the rehearsal sums every ledger entry by
type and re-verifies the aggregate invariant
(`sum(advertiser_charge) === sum(developer_credit) + sum(platform_fee)`)
across the whole synthetic run, plus a per-event count check (accepted
events x 3 === total ledger entries). This mirrors, at rehearsal scale,
what `BILLING_RECONCILIATION_REPORT.md` already verified for the
standalone ledger-confidence and payout-simulation runs.

## 10. Payout simulation flow

The rehearsal's synthetic developer's accumulated `developer_credit`
total is run through the same payout-status logic as
`simulate-payouts.js` (payable / pending / held / manual_review), so the
rehearsal proves the full pipeline from event to a payout-simulation
status, not just the ledger math in isolation. **No real payout is
computed or sent** — this remains a status classification only.

## 11. Privacy constraints

The rehearsal scans every generated ledger row and every line of its own
generated report for the canonical forbidden-field list
(`@ad-alt/platform-core`'s `TELEMETRY_FORBIDDEN_FIELDS`, the same list
`check-monetization-privacy.js` uses) and for the `ppft_` API-key leak
pattern. A privacy failure is treated as an invariant failure — the
rehearsal cannot PASS with a privacy violation present, by design.

## 12. Fraud/replay controls

The rehearsal exercises, with real assertions (not just narrative claims):
duplicate-eventId rejection, delayed-replay rejection, click-without-
impression fraud-blocking, and a fraud-ratio scenario, using the REAL
`@ad-alt/fraud` `FraudScorer` — the same production fraud-decision code
`check-ledger-confidence.js` already exercises. See
`FRAUD_ABUSE_CONTROLS.md` for the broader control review this rehearsal
does not repeat.

## 13. Rollback plan

If the rehearsal reveals a genuine invariant failure (not a rehearsal
tooling bug), do not proceed to any real pilot. See
`KILL_SWITCH_AND_ROLLBACK_REVIEW.md` for what can be disabled and how.
The rehearsal itself has no rollback need of its own — it makes no
persistent writes outside its own generated markdown report (no database,
no Redis, no real account is touched).

## 14. Stop conditions

STOP the rehearsal (and do not proceed to any real pilot) if:
- Any billing split invariant fails.
- Any duplicate/replay event is billed.
- Any forbidden private field appears anywhere in synthetic data or the
  generated report.
- `check:secrets:local` finds a leaked key.
- Any S0/S1 issue is discovered (per `PILOT_ISSUE_TEMPLATE.md` severity
  guide).

## 15. Go/no-go criteria

See `GO_NO_GO_INTERNAL_PILOT_REHEARSAL.md` for the full decision record.
Summary: GO for "rehearsal complete" requires `pilot:rehearsal`,
`check:ledger:confidence`, `check:monetization:privacy`,
`simulate:payouts`, `check:billing:reconciliation --mode internal-beta`,
and `check:secrets:local` to all pass, zero open S0/S1 rehearsal issues,
and explicit confirmation that public release, real payouts, and
staging/production reconciliation remain correctly blocked/unverified.

## 16. Explicitly out of scope

- **Public release** — blocked regardless of this rehearsal's outcome;
  see `check:license`, `package:browser:zip:audit`,
  `package:vscode:vsix:audit`, all `--mode public-release`.
- **Production readiness** — not claimed by this document or any script
  in this phase.
- **Real payouts** — no payment processor is integrated; `simulate:payouts`
  and this rehearsal's payout section are simulations only.
- **Real advertiser charging** — no advertiser account outside the fixed
  synthetic fixture is ever touched.
- **Real developer payout** — no developer account outside the fixed
  synthetic fixture is ever touched, and no code path exists that could
  send a real payout even if one were.
- **Inviting a real pilot participant** — a separate decision, made by
  the release manager after reading `GO_NO_GO_INTERNAL_PILOT_REHEARSAL.md`,
  not automatically implied by this rehearsal passing.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
document or to any rehearsal fixture.**
