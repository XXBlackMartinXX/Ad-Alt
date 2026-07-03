# PromptProfit — Fast Safe Revenue Path Audit

**Phase:** Fast Controlled Revenue Pilot Launch Sprint
**Date:** 2026-07-03
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Baseline commit:** bc2b376

> Grounded in this repository's actual code, not generic startup advice.
> Every claim below cites a file/route/script.

---

## 1. What is the fastest safe path to first revenue validation?

**Seed one real advertiser + one real developer + one active campaign +
one approved creative directly into the local Docker Postgres stack
(the same one `docker-compose.yml` and `packages/database/src/seed.ts`
already stand up), point the browser extension's `apiBaseUrl` at that
API, run one real ChatGPT session with a real tester, and collect payment
manually (invoice/bank transfer) outside the app.** This is not a new
build — `packages/database/src/seed.ts` already inserts exactly this
shape of data (advertiser user + profile + balance, campaign
`status: "active"`, creative `status: "approved"` + review record) for
its own demo/dev purposes. The fastest path is to run an equivalent seed
with the pilot's real advertiser details instead of "Acme Corp," not to
build a self-serve advertiser signup flow (none exists today — see §2).

## 2. Can we run a controlled paid pilot now?

**Yes, technically — with a manual-collection billing model, not
automatic charging.** The full event → fraud-check → ledger pipeline is
real, tested, and verified (`MONETIZATION_SOURCE_AUDIT.md`,
`LEDGER_CONFIDENCE_REPORT.md`). What does NOT exist is any self-serve
advertiser onboarding: `POST /v1/auth/exchange` (the only credential-
issuing route) requires an EXISTING `users.id` — there is no signup
route anywhere in `apps/api/src/routes` or `apps/web`. A real advertiser
account today can only be created by direct database insert (the seed.ts
pattern). This is fine for a founder-operated, tightly controlled pilot
(one seed script run, once) and is explicitly the model CANARY 10
requires (manual invoice/collection, not automatic real billing).

## 3. If yes, under what strict limits?

- One advertiser (founder-managed or one real, consenting small
  business), one campaign, one creative, one developer/tester surface
  (`browser_chatgpt` only — matches current MVP scope).
- `budgetMicrocents` capped small (e.g. $10-$25, matching the seed.ts
  precedent of a $10 budget / $2 daily cap).
- No card/bank data ever touches this codebase — collection is manual
  and external (invoice, bank transfer, or similar), recorded via
  `MANUAL_REVENUE_RECORD_TEMPLATE.md`, not automated.
- No developer payout — `developerProfiles.totalPaidOutMicrocents` stays
  at 0 for real; only the simulation (`simulate:payouts`) may classify a
  hypothetical status.
- Kill-switch tested before the pilot starts (per
  `KILL_SWITCH_AND_ROLLBACK_REVIEW.md`, already fixed this repo cycle —
  client sync closes within 5 minutes, billing stop is immediate).

## 4. If no, what exact blockers remain?

N/A for a manual-collection controlled pilot — see §2. The blockers that
DO remain are all scoped to public release / automatic billing / scale,
not to a single controlled pilot: no LICENSE file, placeholder icons,
staging reconciliation never run, no real payment processor integration,
no refund/void, no admin API for feature flags (direct DB write only).
None of these block a founder-run, manually-invoiced, single-advertiser
pilot. Full triage: `FAST_RELEASE_TRIAGE.md`.

## 5. What can be manual for the first pilot?

- Advertiser account creation (seed script / direct DB insert, following
  `packages/database/src/seed.ts`'s exact pattern).
- Creative review/approval (already a manual admin action even in
  production design — `POST /v1/admin/creatives/:id/review`).
- Payment collection (invoice/bank transfer, recorded via
  `MANUAL_REVENUE_RECORD_TEMPLATE.md`).
- Kill-switch flag writes (direct DB row write — no admin API exists yet;
  documented and accepted in `KILL_SWITCH_AND_ROLLBACK_REVIEW.md`).
- Reconciliation review (an operator reads the reconciliation report,
  there is no dashboard).

## 6. What must be automated before accepting money?

**Nothing new — it already is.** The event ingestion, fraud scoring,
ledger writes, and campaign budget-cap enforcement are all real,
transactional, tested application code (`apps/api/src/services/
event-processor.ts`, `ledger.service.ts`). "Accepting money" in this
pilot means recording a manually-collected payment against a ledger-
verified campaign spend, not building a payment API — that distinction is
exactly what keeps this fast and safe.

## 7. What must remain disabled?

- Any payout execution (no code path exists to disable — confirmed
  absent; keep it that way).
- Any real payment processor integration (none exists; do not add one
  this phase — CANARY 10).
- Public release / Chrome Web Store / VS Code Marketplace submission
  (LICENSE, icons, staging reconciliation all still block this).
- Feature-flag admin write API (deferred; direct DB access is the
  accepted internal-beta stopgap per `KILL_SWITCH_AND_ROLLBACK_REVIEW.md`).
- Multi-advertiser or multi-developer self-serve onboarding.

## 8. What legal/business assumptions require owner review?

1. Whether a manually-invoiced pilot payment requires a written
   agreement/contract with the advertiser before collection.
2. Tax/accounting treatment of a manually-collected pilot payment
   (this repo has no invoicing/tax logic — entirely out of scope here).
3. Whether the pilot developer/tester needs a written data-handling
   acknowledgment (this repo enforces technical privacy constraints, not
   legal agreements).
4. Whether "founder-managed test advertiser" (paying oneself, in effect)
   or a real third-party advertiser is the intended first pilot shape —
   this materially changes what "revenue validation" means and must be
   an explicit owner decision, not inferred by this audit.

## 9. Fastest pilot structure

| Dimension | Recommendation | Basis |
|-----------|-----------------|-------|
| Advertisers | 1 | Matches `CONTROLLED_REVENUE_PILOT_CRITERIA.md` default |
| Developers/testers | 1 | Matches current MVP scope (VS Code + browser_chatgpt only) |
| Campaigns | 1, `status: "active"` | `seed.ts` precedent |
| Budget cap | Small, explicit (placeholder: $10.00-$25.00 total, low daily cap) | `seed.ts` used $10 total / $2 daily |
| Invoice | Manual, external | CANARY 10 — no real payment processor exists |
| Payout | Disabled (simulation only) | CANARY 7, CANARY 11 |

## 10. Smallest next implementation that reduces launch time

**A single readiness gate script** (`check:revenue-pilot`, Phase 3) that
fresh-runs every existing check (`pilot:rehearsal`,
`check:ledger:confidence`, `check:monetization:privacy`,
`simulate:payouts`, `check:billing:reconciliation --internal-beta`,
`check:dryrun:001`, `check:secrets:local`) plus verifies the pilot docs
package exists — so an operator has ONE command to run before launch,
instead of remembering seven. This is the highest-leverage remaining
implementation: everything else needed (seed data, manual invoice) is
either already-proven code (seed.ts pattern) or explicitly manual by
design (CANARY 10).

---

## Classification table

| # | Item | Classification |
|---|------|-----------------|
| 1 | Seed one real advertiser/developer/campaign/creative (adapt `seed.ts` pattern) | PILOT-CRITICAL |
| 2 | Run local Docker stack (`docker-compose.yml`) reachable by the extension | PILOT-CRITICAL |
| 3 | Point extension `apiBaseUrl`/`apiKey` at the pilot API instance | PILOT-CRITICAL |
| 4 | `check:revenue-pilot` readiness gate | LAUNCH-CRITICAL |
| 5 | Manual invoice / revenue record template | LAUNCH-CRITICAL |
| 6 | Kill-switch tested before pilot start | LAUNCH-CRITICAL |
| 7 | Reconciliation run before and after pilot | LAUNCH-CRITICAL |
| 8 | Self-serve advertiser signup flow | DO-NOT-BUILD-NOW |
| 9 | Real payment processor integration | DO-NOT-BUILD-NOW |
| 10 | Real payout execution | DO-NOT-BUILD-NOW |
| 11 | Refund/void implementation | POST-PILOT |
| 12 | Batch/periodic reconciliation job | POST-PILOT |
| 13 | Admin API for feature-flag writes | POST-PILOT |
| 14 | LICENSE decision, final brand icons | PUBLIC-RELEASE |
| 15 | Staging reconciliation | PUBLIC-RELEASE |
| 16 | Chrome Web Store / VS Code Marketplace submission | PUBLIC-RELEASE |
| 17 | Multi-advertiser / external advertiser onboarding | POST-PILOT |

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
