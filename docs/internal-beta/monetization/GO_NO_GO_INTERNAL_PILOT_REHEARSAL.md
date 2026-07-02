# PromptProfit — Go / No-Go: Internal Beta Pilot Rehearsal

**Phase:** Internal Beta Pilot Rehearsal
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw

---

## Decision: **GO** — internal pilot rehearsal complete

**Public release remains BLOCKED.** **Real payouts remain BLOCKED.**
**Staging/production reconciliation remains explicitly NOT VERIFIED.**
This GO applies exclusively to the rehearsal described in
`PILOT_REHEARSAL_PLAN.md` — a synthetic-data, no-real-money dress
rehearsal of the tooling. It is not itself a decision to invite a real
pilot participant; that is a separate decision for the release manager.

---

## 1. GO requirements and evidence

| # | Requirement | Result | Evidence |
|---|-------------|--------|----------|
| 1 | `pilot:rehearsal` passes | PASS (30/30, 0 critical, 0 normal) | `PILOT_REHEARSAL_REPORT.md`, re-run fresh this session |
| 2 | `check:ledger:confidence` passes | PASS (17/17) | `LEDGER_CONFIDENCE_REPORT.md`, re-run fresh this session |
| 3 | `check:monetization:privacy` passes | PASS (6/6) | Re-run fresh this session |
| 4 | `simulate:payouts` passes | PASS (invariant holds) | `PAYOUT_SIMULATION_REPORT.md`, re-run fresh this session |
| 5 | `check:billing:reconciliation --mode internal-beta` passes | PASS | Re-run fresh this session — this gate itself fresh-executes checks 2-4 as child processes before evaluating, per the stale-evidence fix from the prior phase |
| 6 | `check:secrets:local` passes | PASS (0 leaks, 423 files scanned) | Re-run fresh this session |
| 7 | No S0/S1 internal pilot blockers | TRUE — 0 open S0, 0 open S1 | `MONETIZATION_RISK_REGISTER.md` (11 S2, 5 S3, all mitigated/resolved/accepted for internal-beta scope) |
| 8 | Public release remains explicitly blocked | TRUE | See §3 |
| 9 | Real payouts remain explicitly blocked | TRUE | No payment processor integrated anywhere in this codebase (`MONETIZATION_SOURCE_AUDIT.md` Q18); `simulate:payouts` and the rehearsal's payout section are classification-only |
| 10 | Staging/production reconciliation remains explicitly noted as not verified | TRUE | `check:billing:reconciliation --mode public-release` continues to FAIL for this reason; `PRODUCTION_BILLING_RECONCILIATION_PLAN.md` §8 audit log remains empty |

All ten GO requirements are met.

## 2. What this rehearsal actually proved

- The synthetic pilot fixture module (`scripts/fixtures/internal-beta-pilot-fixtures.js`)
  is deterministic, uses only reserved `example.test` emails, and covers
  all 10 required scenarios (valid impression, duplicate impression,
  replayed impression, valid click after impression, click without prior
  impression, repeated click, a suspicious fraud-ratio scenario, and all
  three other payout-status classifications: below-threshold, payable,
  and held).
- The rehearsal script (`scripts/run-internal-beta-pilot-rehearsal.js`)
  drives the REAL, built `@ad-alt/ledger` and `@ad-alt/fraud` production
  packages through every scenario, asserts exact split-math, duplicate/
  replay rejection, click-eligibility rules, payout-status classification,
  a whole-run reconciliation invariant, and a privacy scan — 30
  independent assertions, all passing.
- The rehearsal's PASS/HOLD/STOP decision logic was verified to actually
  discriminate correctly, not just always report PASS: a deliberately
  broken non-critical fixture value produced `Result: HOLD` with exit code
  1; a deliberately broken critical (money-math) fixture value produced
  `Result: STOP` with exit code 1; both were confirmed and the fixture was
  restored and re-verified passing before being relied upon further.
- 12 new automated tests
  (`scripts/__tests__/internal-beta-pilot-rehearsal.test.js`) cover
  fixture determinism, individual scenario correctness, the split
  invariant, payout classification, privacy, and — critically — that the
  rehearsal script itself exits non-zero on an intentionally broken
  invariant (not just that it exits zero on a clean run).
- A genuine, internal-beta-relevant safety gap was found and fixed during
  the kill-switch/rollback review: the browser extension never actually
  fetched `/v1/flags` from the backend, so a kill switch stopped billing
  immediately but did not reach the extension's local serving-gate cache.
  This is now fixed (`syncFlagsFromBackend()`, fire-and-forget, does not
  touch the hot gating path) and verified with zero regression to the
  already-verified DRYRUN-001 runtime (148/148 browser-extension unit
  tests, clean typecheck, 27/27 fixture e2e smoke tests including both
  kill-switch scenarios).

## 3. Public-release / production / real-payout status — unaffected by this decision

| Gate | Status |
|------|--------|
| `check:license -- --mode public-release` | Not re-run this session; unaffected by this phase's changes (no LICENSE file added) — expected FAIL |
| `package:browser:zip:audit -- --mode public-release` | Expected FAIL (internal-beta strings, placeholder icons) — reconfirmed in Phase 10 verification below |
| `package:vscode:vsix:audit -- --mode public-release` | Expected FAIL (no LICENSE file) — reconfirmed in Phase 10 verification below |
| `check:billing:reconciliation -- --mode public-release` | Expected FAIL (staging reconciliation never run) — reconfirmed in Phase 10 verification below |
| Real payout provider integration | NOT IMPLEMENTED — simulation only |
| Real money movement | NOT POSSIBLE — no code path exists anywhere in this codebase |
| Staging/production billing reconciliation | NOT VERIFIED — audit log empty |
| DRYRUN-001 launcher fix reconfirmation on real Windows | NOT DONE (carried forward, unrelated to this phase) |

**Do not interpret this document as public release readiness, production
readiness, or real-payout readiness under any circumstance.**

## 4. Accepted internal-beta limitations

1. Local Docker billing smoke (`smoke:billing:local`,
   `smoke:billing:click:local`) requires PowerShell + Docker; this
   sandbox has neither. The deterministic `check:ledger:confidence` and
   this rehearsal substitute for internal-beta gating purposes.
2. Client-side kill-switch sync is now live within 5 minutes (or
   immediately on a fresh service-worker start), not instantaneous —
   accepted for internal beta; billing-side stop (the control with real
   financial consequences even in simulation) remains instantaneous.
3. No admin API/UI exists to write feature flags — direct database access
   is required. Acceptable for an internal-beta engineering team;
   flagged for public release.
4. 10 open S2 risks and 5 open S3 risks remain in
   `MONETIZATION_RISK_REGISTER.md`, all explicitly scoped as
   public-release requirements, none blocking this rehearsal.

## 5. Recommendation

The tooling and the operator's process for running an internal
monetization pilot rehearsal are now proven end to end, deterministically,
with automated test coverage and a working PASS/HOLD/STOP decision
mechanism. Proceed to using `INTERNAL_PILOT_OPERATOR_RUNBOOK.md` for
future rehearsals. The decision to invite a real, controlled internal
pilot participant is separate and should be made by the release manager
using this document plus `GO_NO_GO_MONETIZATION_PILOT.md` (the prior
phase's broader monetization readiness decision) — not automatically
implied by this rehearsal passing. Do not proceed to public release,
production billing, or real payouts on the basis of this document; those
remain gated by evidence this phase does not and cannot provide (staging
reconciliation, a real payment processor integration, license/brand-asset
decisions).

---

## 6. Sign-off placeholders

| Role | Decision | Signed | Date |
|------|----------|--------|------|
| Operator | [PENDING] | [ ] | |
| Reviewer | [PENDING] | [ ] | |
| Engineering owner | [PENDING] | [ ] | |
| Release manager | [PENDING] | [ ] | |

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
document.**
