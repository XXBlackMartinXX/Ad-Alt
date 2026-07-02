# PromptProfit — Billing Reconciliation Report (Internal Beta)

**Phase:** Internal Beta Monetization Readiness
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Scope:** internal-beta reconciliation, synthetic data only

> **This report is scoped to internal-beta reconciliation.** It reconciles
> the synthetic scenarios run by `check-ledger-confidence.js` and
> `simulate-payouts.js` against the real `@ad-alt/ledger` production
> calculator. It is NOT staging or production reconciliation — those remain
> unverified (see §5) and continue to block `check:billing:reconciliation
> --mode public-release`, by design.

---

## 1. What was reconciled

Two independently-generated, deterministic synthetic runs, both produced
by this session's tooling and cross-checked against each other and against
the real `@ad-alt/ledger` calculator:

1. `scripts/check-ledger-confidence.js` → `LEDGER_CONFIDENCE_REPORT.md`
   (17 scenario checks: entry shape, split-math exactness, dedup/replay,
   click-requires-impression, concurrency, privacy).
2. `scripts/simulate-payouts.js` → `PAYOUT_SIMULATION_REPORT.md`
   (5 synthetic developers, 2 synthetic advertisers, a full simulated
   payout batch).

---

## 2. Synthetic event counts

| Source | Impressions | Clicks | Total billable events |
|--------|-------------|--------|------------------------|
| Ledger confidence run | 1 (scenario 1) + 1 (scenario 2, paired with its click) + 9x2 (split-math samples, impression+click) + 1 (dup, only 1 billed) + 1 (replay, only 1 billed) + 2 (concurrent) + 1 (privacy scenario) | 1 (scenario 2) + 9 (split-math samples) + 1 (privacy scenario) | 18 impressions, 11 clicks |
| Payout simulation run | 300 + 5 + 100 + 1000 + 200 = 1605 | 15 + 0 + 5 + 100 + 30 = 150 | 1605 impressions, 150 clicks |
| **Combined** | **1623** | **161** | **1784** |

All counts above are derived directly from the two generated reports —
not independently re-counted by hand — so they are reproducible by
re-running `pnpm -w run check:ledger:confidence && pnpm -w run simulate:payouts`.

---

## 3. Expected vs. actual charges

### 3.1 Ledger confidence run (fixed CPM = 5,000,000 microcents / $5.00)

| Entry | Expected | Actual (from report) | Match |
|-------|----------|------------------------|-------|
| Impression advertiser_charge | 5000 microcents | 5000 | YES |
| Impression developer_credit | 3000 microcents (60%) | 3000 | YES |
| Impression platform_fee | 2000 microcents (40%) | 2000 | YES |
| Click advertiser_charge | 50000 microcents (10x) | 50000 | YES |
| Click developer_credit | 30000 microcents (60%) | 30000 | YES |
| Click platform_fee | 20000 microcents (40%) | 20000 | YES |

Split-math scenario (§3, ledger confidence report) additionally verified
the `advertiser_charge = developer_credit + platform_fee` invariant across
9 non-round CPM samples (1, 999, 1000, 1001, 3333333, 5000000, 7777777,
12345678, 999999999 microcents) for both impressions and clicks — 18
additional balance checks, all exact, zero rounding drift.

### 3.2 Payout simulation run

| Field | Amount |
|-------|--------|
| Gross advertiser charged | $262.75 |
| Developer earned (total) | $157.65 |
| Platform retained | $105.10 |
| Invariant (earned + retained == charged) | PASS |

---

## 4. Mismatches

**None.** Every scenario in both reports resolved to `advertiser_charge ===
developer_credit + platform_fee` exactly, with zero rounding drift, across
27 total balance checks (18 split-math samples + the fixed-scenario checks
+ the payout-batch aggregate). No entry was found unbalanced by even one
microcent.

---

## 5. Reconciliation status

| Layer | Status | Evidence |
|-------|--------|----------|
| Per-event invariant (inline, production code) | PASS | `LedgerCalculator.verifyBalance()`, enforced before every write (`ledger.service.ts:85-88,208-211`) |
| Deterministic synthetic reconciliation (this report) | PASS | §3-4 above |
| Real-code-path orchestration tests (existing suite) | PASS | `apps/api/src/__tests__/ledger-balance.test.ts` (8/8), part of this session's `pnpm -w run verify` |
| Local Docker billing smoke (`smoke:billing:local`) | NOT VERIFIED THIS SESSION | Requires PowerShell + Docker, unavailable in this sandbox. Prior-session record (2026-07-01) in `docs/internal-beta/BILLING_VERIFICATION_SUMMARY.md` — not re-confirmed this session. |
| Staging reconciliation | NOT RUN | `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md` §8 Audit Log is empty |
| Production reconciliation | NOT RUN | Requires staging first |
| Batch/periodic reconciliation job | NOT IMPLEMENTED | Confirmed absent in `MONETIZATION_SOURCE_AUDIT.md` Q19 — only inline per-event checking exists |

**Internal-beta reconciliation: PASS**, on the basis of deterministic
synthetic evidence (rows 1-3 above), sufficient for a tightly-scoped
internal pilot using synthetic/test accounts.

**Staging/production reconciliation: NOT VERIFIED**, unchanged, and
continues to correctly block `check:billing:reconciliation --mode
public-release`.

---

## 6. Unresolved blockers

| # | Blocker | Blocks internal beta? | Blocks public release? |
|---|---------|------------------------|--------------------------|
| 1 | Staging reconciliation never run | No | Yes (hard blocker) |
| 2 | Batch/periodic reconciliation job not implemented (only inline per-event check exists) | No — inline check is sufficient for a synthetic-data pilot | Yes |
| 3 | Local Docker billing smoke not re-verified this session (no Docker/pwsh in this sandbox) | No — deterministic ledger-confidence run substitutes for internal-beta purposes | Yes — real staging/Docker evidence still required before public release |
| 4 | Refund/void not implemented | No — internal beta uses synthetic accounts, no real refund scenario expected | Yes |
| 5 | Real payout execution not implemented (simulation only) | No — this phase's explicit scope is simulation | Yes |

See `docs/internal-beta/monetization/MONETIZATION_RISK_REGISTER.md` for the
full risk register with severities and owners.

---

## 7. Known limitations

1. This report reconciles **synthetic, script-generated data only** — no
   real advertiser, developer, or event ever contributes to the numbers
   above.
2. Reconciliation here is a **post-hoc aggregation and cross-check** of two
   independently generated reports, not a live database reconciliation
   query — there is no live database in this sandbox to reconcile against.
3. Real Postgres transactional behavior (crash mid-transaction, concurrent
   real network requests) is not exercised — see
   `MONETIZATION_SOURCE_AUDIT.md` §4 for what remains unverified.
4. This report does not supersede or replace
   `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md`, which remains the
   authoritative staging/production reconciliation plan and is unaffected
   by this internal-beta-scoped report.
5. Regenerating `LEDGER_CONFIDENCE_REPORT.md` or `PAYOUT_SIMULATION_REPORT.md`
   changes the underlying numbers cited in §2-3 of this report only if the
   scripts' fixture data is edited; this report should be manually
   re-verified against the two source reports after any such change.

---

## 8. Commands to reproduce

```bash
pnpm -w run check:ledger:confidence
pnpm -w run simulate:payouts
pnpm -w run check:billing:reconciliation -- --mode internal-beta
pnpm -w run check:billing:reconciliation -- --mode public-release   # must still FAIL
```

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
report.**
