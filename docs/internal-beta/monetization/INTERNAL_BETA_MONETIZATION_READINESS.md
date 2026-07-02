# PromptProfit — Internal Beta Monetization Readiness

**Phase:** Internal Beta Monetization Readiness
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Baseline commit:** 7c9b4cc (this phase's changes land on top)

---

## 1. Current runtime status

DRYRUN-001 (functional runtime): **completed with release-automation issue
open**, carried forward unchanged from the prior phase. PromptProfit loads
on real Chrome, appears in `chrome://extensions`, renders the demo fallback
banner and diagnostics panel on real chatgpt.com. The launcher
verification false-negative (`DRYRUN-001-ISSUE-002`) is fixed and tested
but not yet reconfirmed on a real Windows machine. **This phase does not
re-run or re-debug the banner/runtime path** — per this mission's explicit
instruction, runtime debugging is out of scope unless a new verified
regression appears. None appeared during this phase's work.

## 2. Current billing status

| Layer | Status |
|-------|--------|
| Per-event money math (`LedgerCalculator`) | PASS — deterministic, self-balancing by construction |
| Duplicate/replay protection | PASS — 3-layer, verified this session |
| Concurrency safety | PASS — verified this session |
| Click-requires-impression rule | PASS — verified this session |
| Ledger confidence (synthetic, deterministic) | PASS — 17/17 checks, see `LEDGER_CONFIDENCE_REPORT.md` |
| Billing reconciliation (internal-beta scope) | PASS — see `BILLING_RECONCILIATION_REPORT.md` |
| Payout simulation | PASS (invariant holds) — see `PAYOUT_SIMULATION_REPORT.md`; simulation only, no real payout |
| Monetization privacy | PASS — see `MONETIZATION_PRIVACY_REVIEW.md` |
| Local Docker billing smoke (`smoke:billing:local`) | NOT VERIFIED THIS SESSION — no Docker/PowerShell in this sandbox; prior-session record exists (2026-07-01), not re-confirmed |
| Staging/production reconciliation | NOT RUN — correctly blocks `check:billing:reconciliation --mode public-release` |

## 3. What is ready

- The core money-math and ledger-write invariants (split accuracy,
  balance, atomicity-of-call-pattern, duplicate/replay rejection,
  concurrency safety) are verified against the REAL production
  `@ad-alt/ledger` and `@ad-alt/fraud` code, both via this phase's new
  deterministic tooling and via the pre-existing
  `apps/api/src/__tests__/ledger-balance.test.ts` suite (8/8, part of this
  session's `pnpm -w run verify`).
- A synthetic-data-only payout simulation exists, exercising every payout
  status (`payable`, `pending`, `held`, `manual_review` via two different
  trigger conditions).
- A monetization-scoped privacy gate exists and passes, reusing the
  canonical forbidden-field list already enforced elsewhere in the
  codebase.
- A fraud/abuse control review exists, with every gap explicitly
  risk-rated and none rated S0/S1.
- The `check:billing:reconciliation --mode internal-beta` gate now
  meaningfully requires all of the above (not just optional Docker smoke
  evidence that silently downgrades to a warning) — see
  `BILLING_RECONCILIATION_REPORT.md` §1 for what changed.

## 4. What is not ready

- No batch/periodic reconciliation job (inline per-event checking only).
- No refund/void implementation.
- No real payout execution (simulation only — by design, per this
  mission's explicit scope).
- No admin write path for the kill-switch (read-only today; flipping a
  flag requires direct DB access).
- Local Docker billing smoke not re-verified in this sandbox session (no
  PowerShell/Docker available here).
- Staging/production reconciliation never run.

## 5. Pilot constraints

An internal monetization pilot under this readiness assessment must:

1. Use **synthetic or explicitly-labeled test advertiser/developer
   accounts only** — no real money, no real payouts.
2. Be limited to a **small, known set of internal testers** (matches the
   existing DRYRUN-001/beta rollout population, not a public audience).
3. Not enable any code path that would execute a real payout (none exists
   today, but this constraint should be enforced going forward as a
   review gate on any future payout-execution PR).
4. Continue running `check:ledger:confidence`, `check:monetization:privacy`,
   and `check:billing:reconciliation --mode internal-beta` before each
   pilot session, per `FIRST_MONETIZATION_PILOT_CHECKLIST.md`.

## 6. Accepted risk

Per `MONETIZATION_RISK_REGISTER.md`: 10 S2 and 5 S3 risks are open, zero
S0/S1. All S2/S3 risks are explicitly accepted for the scope of a
synthetic-data, small-population internal pilot, and are carried forward
as public-release requirements rather than dropped. The single highest
material risk — no floor/guard on negative advertiser balances — is
mitigated by the fact that internal beta never uses real advertiser money
and the campaign-budget check remains the operative spend control.

## 7. Blocked public-release items (unchanged, still correctly blocked)

- `check:license -- --mode public-release` — no LICENSE file
- `package:browser:zip:audit -- --mode public-release` — internal-beta-only
  strings present, placeholder icons
- `package:vscode:vsix:audit -- --mode public-release` — no LICENSE file
- `check:billing:reconciliation -- --mode public-release` — staging
  reconciliation never run
- DRYRUN-001 launcher fix not yet reconfirmed on real Windows

## 8. Recommended next phase

1. Assign real owners to every risk-register item (currently `[OWNER TBD]`).
2. Run a real, small internal monetization pilot per
   `FIRST_MONETIZATION_PILOT_CHECKLIST.md`, using synthetic/test accounts.
3. In parallel (not blocking the pilot): scope and implement the S2 items
   that block public release — batch reconciliation, refund/void,
   self-click fraud detection, admin kill-switch, full rate-limit/audit-log
   coverage.
4. Schedule a staging environment and run
   `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md` end-to-end — this is
   the single largest remaining gap between internal-beta and
   public-release billing readiness.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
document.**
