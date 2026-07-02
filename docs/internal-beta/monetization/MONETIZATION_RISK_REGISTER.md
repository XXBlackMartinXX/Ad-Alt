# PromptProfit — Monetization Risk Register

**Phase:** Internal Beta Monetization Readiness
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw

**Severity scale (matches `dryrun-001-finalize.js`'s existing S0-S3 convention):**
- **S0** — critical, blocks everything, immediate rollback
- **S1** — blocks GO/pilot, must fix before proceeding
- **S2** — should fix, does not block a tightly-scoped internal pilot
- **S3** — minor / cosmetic / future enhancement

> **No S0 or S1 item is open in this register.** Every item below is S2 or
> S3, all correctly scoped as internal-beta-acceptable and carried forward
> as an explicit public-release requirement — none are silently dropped.

---

## Billing risk

| Risk | Severity | Owner | Mitigation | Status |
|------|----------|-------|-------------|--------|
| Negative advertiser balance possible (no floor/guard at the balance-table level; only campaign-budget-level spend cap exists) | S2 | [OWNER TBD — Engineering] | Campaign budget exhaustion is the operative real-world control today; a real-money pilot needs an explicit prepaid-vs-postpaid billing-model decision before enabling real advertiser accounts | Open — mitigated for internal beta (synthetic accounts, no real money), blocks public release |
| Click-value multiplier (10x) is a hardcoded code constant, not per-campaign configurable | S3 | [OWNER TBD — Product] | Documented as a fact in `MONETIZATION_SOURCE_AUDIT.md` Q5; not a defect, but a product-flexibility limitation | Open — informational, does not block internal beta or public release |

## Reconciliation risk

| Risk | Severity | Owner | Mitigation | Status |
|------|----------|-------|-------------|--------|
| No batch/periodic reconciliation job exists (only inline per-event invariant check) | S2 | [OWNER TBD — Engineering] | Inline `verifyBalance()` check runs before every write and throws on failure (`ledger.service.ts`); sufficient for internal-beta scale, insufficient for production-scale drift detection | Open — mitigated for internal beta, blocks public release |
| Staging/production reconciliation never run (audit log empty in `PRODUCTION_BILLING_RECONCILIATION_PLAN.md`) | S2 | [OWNER TBD — Engineering] | Local deterministic evidence (`LEDGER_CONFIDENCE_REPORT.md`, `BILLING_RECONCILIATION_REPORT.md`) substitutes for internal-beta scope | Open — hard blocker for `check:billing:reconciliation --mode public-release` (by design) |

## Payout risk

| Risk | Severity | Owner | Mitigation | Status |
|------|----------|-------|-------------|--------|
| No real payout execution exists (schema only; `payouts`/`payout_batches` never written) | S2 | [OWNER TBD — Engineering] | This phase's scope is simulation only (`simulate-payouts.js`); no real developer is owed money in internal beta | Open — expected, blocks public release until a real payout provider is integrated |
| No refund/void implementation | S2 | [OWNER TBD — Engineering] | Internal beta uses synthetic/test accounts; no real refund scenario expected | Open — blocks public release |
| Payout simulation policy thresholds (min payout, manual-review) are script placeholders, not reviewed business policy | S3 | [OWNER TBD — Finance/Product] | Clearly labeled as placeholders in `PAYOUT_SIMULATION_REPORT.md`; must be replaced with a real, signed-off policy before any real payout | Open — does not block internal beta (simulation only) |

## Fraud/abuse risk

| Risk | Severity | Owner | Mitigation | Status |
|------|----------|-------|-------------|--------|
| Developer self-click fraud has no dedicated detection | S2 | [OWNER TBD — Engineering] | Existing rapid-click/device-velocity signals provide partial coverage against obviously automated patterns; internal beta has no real developer earnings at stake | Open — blocks public release before real payouts are enabled |
| Bot/click spam detection is per-device only (no IP/account-level correlation) | S2 | [OWNER TBD — Engineering] | Adequate for a small, known internal-beta tester population | Open — recommended strengthening before public release |
| Kill-switch has no admin write path (flag toggling requires direct DB access) | S2 | [OWNER TBD — Engineering] | Internal beta engineers have DB access; acceptable stopgap | Open — recommend an admin API/UI before public release |
| Rate limiting only covers `/v1/events`, not `/v1/ledger/me` or `/v1/admin/*` | S2 | [OWNER TBD — Engineering] | Low practical risk (authenticated, low-value-to-abuse endpoints) | Open — recommend full coverage before public release |
| Audit logging only covers creative/campaign review, not fraud/ledger/kill-switch actions | S2 | [OWNER TBD — Engineering] | Fraud decisions are still recorded per-event (`fraudScore`, `fraudSignals` columns); no separate admin audit trail for those decisions yet | Open — recommend before public release |
| Browser extension never fetched `/v1/flags` — a backend kill switch stopped billing server-side but did not reach the extension's local cache, so client-side ad serving could keep running until the cache was somehow refreshed | S2 | Engineering (this phase) | Added `syncFlagsFromBackend()` to `apps/browser-extension/src/background/service-worker.ts`, called fire-and-forget on service-worker startup and the existing 5-minute `refresh-flags` alarm; does not touch the hot per-wait-state gating path. Verified via full re-run of `apps/browser-extension` unit tests (148/148), typecheck, and fixture e2e smoke (27/27, including both kill-switch scenarios). See `KILL_SWITCH_AND_ROLLBACK_REVIEW.md` §6. | **RESOLVED this phase** — serving stop is now live within 5 minutes of a backend flag change (or immediately for a freshly started service worker); still not instantaneous like the billing stop, which is an accepted internal-beta tradeoff |

## Privacy risk

| Risk | Severity | Owner | Mitigation | Status |
|------|----------|-------|-------------|--------|
| Automated privacy scan (`check:monetization:privacy`) uses pattern-based exemptions that a determined bad actor could word around | S3 | [OWNER TBD — Engineering] | Defense-in-depth only; primary control remains closed Zod schemas at the API boundary (`MONETIZATION_PRIVACY_REVIEW.md` §5) | Open — informational, does not block internal beta or public release |
| No live network capture / staging privacy verification performed this session | S3 | [OWNER TBD — Engineering] | Static source scan performed and passed; staging verification is part of `PRODUCTION_BILLING_RECONCILIATION_PLAN.md` §6 | Open — required before public release, not before internal beta |

## Operational risk

| Risk | Severity | Owner | Mitigation | Status |
|------|----------|-------|-------------|--------|
| Local Docker billing smoke (`smoke:billing:local`, `smoke:billing:click:local`) could not be re-verified this session (no PowerShell/Docker in this sandbox) | S3 | [OWNER TBD — Engineering] | Deterministic `check:ledger:confidence` substitutes for internal-beta gating purposes; prior-session record exists (2026-07-01) but is not re-confirmed | Open — recommend re-running on a machine with Docker + PowerShell before wider internal rollout |
| No owner assigned to any item in this register yet | S2 | [OWNER TBD — Release Manager] | Placeholder owners throughout this document | Open — assign real owners before pilot kickoff |

---

## Register summary

| Severity | Count | Blocks internal beta? |
|----------|-------|------------------------|
| S0 | 0 | N/A |
| S1 | 0 | N/A |
| S2 | 11 (10 open, 1 resolved this phase) | No — all mitigated, resolved, or accepted for internal-beta scope |
| S3 | 5 | No — informational / future enhancement |

**No S0 or S1 item is open.** Per this project's existing decision rules
(as codified in `scripts/dryrun-001-finalize.js` and mirrored in
`GO_NO_GO_MONETIZATION_PILOT.md`), this register does not force a HOLD or
STOP for the internal monetization pilot on its own.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
document.**
