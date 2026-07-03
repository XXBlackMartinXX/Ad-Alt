# PromptProfit — Fast Release Triage (Controlled Revenue Pilot Focus)

**Phase:** Fast Controlled Revenue Pilot Launch Sprint
**Date:** 2026-07-03

> Ruthless triage. Goal: prevent overbuilding and keep focus on the
> controlled revenue pilot only. If an item doesn't block the pilot,
> defer it — do not build it this phase.

| Item | Area | Current status | Blocks controlled pilot? | Blocks revenue collection? | Blocks public release? | Severity | Quickest safe action | Defer until |
|------|------|-----------------|---------------------------|------------------------------|--------------------------|----------|------------------------|-------------|
| DRYRUN-001 launcher verification false-negative | Release automation | Fixed, tested, not reconfirmed on real Windows | No | No | Yes | S2 | None needed for pilot — the extension itself works (DRYRUN-001 functional runtime confirmed) | Reconfirm on real Windows before wider internal rollout |
| Staging reconciliation never run | Billing | Not verified — audit log empty | No (internal-beta ledger confidence + this session's fresh reconciliation gate substitute) | No | Yes (hard blocker) | S2 | None needed for one controlled pilot on local infra | Provision staging before public release |
| Public LICENSE missing | Legal/release | No LICENSE file at repo root | No | No | Yes (hard blocker) | S2 | None needed — pilot is not a store submission | Owner decides license before any store submission |
| Public icons are placeholders | Release assets | Confirmed placeholder (257 bytes) | No | No | Yes | S3 | None needed for pilot | Before store submission |
| No real payout execution | Payout | Confirmed absent (schema only) | No — by design, simulation only | No | Yes | N/A (intentional, not a defect) | None — do not build this phase (CANARY 7, CANARY 11) | A future, explicitly-approved payout phase |
| No refund/void implementation | Billing | Confirmed absent | No — pilot budget is small and capped; manual adjustment recorded via template if ever needed | No | Yes | S2 | None needed — `MANUAL_REVENUE_RECORD_TEMPLATE.md`'s "Refund/Adjustment Needed" field covers this manually | Post-pilot, if a real refund scenario occurs |
| No admin API for feature-flag writes | Operational | Confirmed absent — direct DB write only | No — direct DB write works and is documented in `PILOT_STOP_ROLLBACK_PLAN.md` | No | Yes | S2 | None needed for one founder-operated pilot | Before public release or multi-operator scale |
| No public marketplace listing | Distribution | Not started | No | No | Yes | N/A | None — out of scope this phase | Public release phase |
| No external advertiser onboarding (self-serve signup) | Product | Confirmed absent — `POST /v1/auth/exchange` requires an existing `users.id`; no signup route exists | No — this pilot uses one manually-seeded advertiser, matching `packages/database/src/seed.ts`'s existing pattern | No | Yes, for scale beyond a handful of manually-seeded advertisers | S3 | None needed for pilot | Post-pilot, before onboarding a second/third advertiser |
| Local Docker billing smoke (`smoke:billing:local`) is Windows/Docker-specific | Verification | Requires PowerShell + Docker; not runnable in this sandbox | No — `check:ledger:confidence` (deterministic, no Docker) substitutes for this gate's purposes | No | No (this specific smoke check, not the underlying billing correctness) | S3 | Run on a machine with Docker + PowerShell if available before the real pilot session, as a supplementary check | Optional, not a hard requirement for pilot launch |
| Kill-switch client-side sync gap | Operational safety | **RESOLVED this repo cycle** — `syncFlagsFromBackend()` added, verified zero regression | N/A — already fixed | N/A | No | N/A (resolved) | Already done | N/A |
| Rate limiting only covers `/v1/events` | Fraud/abuse | Confirmed partial | No — pilot traffic is one known tester, low volume | No | Yes, for scale | S3 | None needed for pilot | Before public release |
| Audit logging only covers creative/campaign review | Operational | Confirmed partial | No | No | Yes | S3 | None needed for pilot | Before public release |
| Batch/periodic reconciliation job | Billing | Confirmed absent — only inline per-event check exists | No — inline check + this phase's fresh reconciliation gate are sufficient for pilot scale | No | Yes | S2 | None needed for pilot | Post-pilot |
| Self-serve advertiser signup UI | Product | Confirmed absent | No — manual seed is the pilot's intended path (see `FAST_REVENUE_PATH_AUDIT.md` §1) | No | Yes, for scale | S3 | None needed for pilot | Post-pilot |
| `check:revenue-pilot` gate | Release automation | **Built this phase** | N/A — this IS the pilot-launch gate | N/A | No | N/A | Already done | N/A |

---

## Summary

**Nothing above blocks the controlled revenue pilot.** Every item that
blocks public release (LICENSE, icons, staging reconciliation, no admin
API, no self-serve onboarding, no refund/void, no real payout) is
correctly deferred — none of them are launch-critical for a single,
founder-operated, manually-invoiced, budget-capped pilot with one
advertiser and one developer surface. The two items resolved this repo
cycle (kill-switch client sync, this readiness gate) were the only
genuinely pilot-relevant gaps found.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
