# PromptProfit — First Monetization Pilot Checklist

**Phase:** Internal Beta Monetization Readiness
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw

> Use this checklist immediately before and during the first internal
> monetization pilot session. It assumes DRYRUN-001 functional runtime is
> already confirmed (see `docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md`)
> — this checklist does not re-verify banner rendering.

---

## Pre-pilot checks

- [ ] `pnpm install --frozen-lockfile` clean
- [ ] `pnpm -w run check:ledger:confidence` — PASS (17/17)
- [ ] `pnpm -w run simulate:payouts` — invariant PASS
- [ ] `pnpm -w run check:monetization:privacy` — PASS
- [ ] `pnpm -w run check:billing:reconciliation -- --mode internal-beta` — PASS
- [ ] `pnpm -w run check:billing:reconciliation -- --mode public-release` — still FAILS (confirms public release remains correctly blocked)
- [ ] `pnpm -w run verify` — PASS (includes `apps/api` ledger/event tests)
- [ ] `docs/internal-beta/monetization/MONETIZATION_RISK_REGISTER.md` reviewed — confirm no new S0/S1 item since last review

## Advertiser setup

- [ ] Advertiser account is an explicitly-labeled **synthetic/test**
      account (e.g. name/email contains "test" or "synthetic", never a
      real company)
- [ ] `advertiserProfiles.stripeCustomerId` is null or a Stripe **test-mode**
      customer ID only — never a live customer ID (no live integration
      exists today, so this should always be null in internal beta)
- [ ] Campaign `budgetMicrocents` is a small, bounded test value
- [ ] Campaign `cpmBidMicrocents` is a documented, known value (used to
      predict expected ledger entries below)
- [ ] Campaign targets `browser_chatgpt` only (matches current MVP scope
      per CANARY 7 — no Claude/Gemini/Desktop/Antigravity)

## Developer setup

- [ ] Developer account is an explicitly-labeled **synthetic/test** account
- [ ] `developerProfiles.payoutEmail` is a test address (e.g.
      `*@example.test`) or intentionally null to exercise the "held" path
- [ ] `developerProfiles.totalEarnedMicrocents` /
      `totalPaidOutMicrocents` start at 0 for a clean pilot run

## API key setup

- [ ] A dedicated API key is issued for the pilot session, not a
      previously-used key
- [ ] Key is scoped to the test developer/advertiser accounts above
- [ ] `check:secrets:local` run and PASS before and after the session (no
      key leaked into source, logs, or reports)

## Event verification

- [ ] `impression_requested` → `impression_rendered` →
      `viewability_threshold_met` fire in order, each with a unique
      `eventId` (per `docs/EVENT_LEDGER_DEDUP_REVIEW.md`)
- [ ] A `click` event, if fired, occurs only after a `billable` impression
- [ ] No forbidden field (`pageTitle`, `pageUrl`, `promptText`,
      `chatHistory`, etc.) appears in any event payload sent —
      spot-check with `query:local-events` if a local stack is available

## Ledger verification

- [ ] Exactly 3 ledger entries per billable event: `advertiser_charge`,
      `developer_credit`, `platform_fee`
- [ ] `developer_credit + platform_fee == advertiser_charge` to the
      microcent, for every entry set
- [ ] `developer_credit` is 60% of the total, `platform_fee` is the
      remainder (not independently computed — see
      `MONETIZATION_SOURCE_AUDIT.md` Q7)
- [ ] Replaying the same event does not create duplicate entries
- [ ] Spot-check with `query:local-ledger` if a local stack is available

## Reconciliation verification

- [ ] Sum of `advertiser_charge` entries for the pilot session equals
      expected (billable-event-count × rate)
- [ ] Sum of `developer_credit` + sum of `platform_fee` equals sum of
      `advertiser_charge`
- [ ] No orphaned ledger entries (every entry's `referenceId` corresponds
      to a real impression/click event from this session)

## Payout simulation verification

- [ ] Re-run `pnpm -w run simulate:payouts` with the pilot's real (synthetic)
      developer totals substituted, if extending the simulation script for
      this specific pilot
- [ ] Confirm no payout would have crossed the manual-review threshold
      unexpectedly (if it did, investigate before treating the pilot as
      clean)
- [ ] Confirm zero real payouts were sent (there is no code path that
      could send one — verify this remains true if any payout-adjacent
      code changed since this document was written)

## Rollback plan

- [ ] Disable the pilot's API key immediately if a billing anomaly is
      observed (per `docs/internal-beta/ROLLBACK_AND_DISABLE_GUIDE.md`)
- [ ] Document the failing event ID(s) and ledger entry ID(s) — privacy-safe,
      no ChatGPT content
- [ ] Do not extend the pilot to more testers until root cause is
      identified

## Emergency stop / kill-switch

- [ ] Confirm current state of `kill_switch_all_ads` and
      `disable_adapter_browser_chatgpt` flags via `GET /v1/flags` before
      starting
- [ ] **Known gap (see `FRAUD_ABUSE_CONTROLS.md` #11):** flipping these
      flags requires direct database access — there is no admin API/UI
      today. Confirm who on the pilot team has that DB access before
      starting, so an emergency stop is actually executable within
      minutes, not blocked on provisioning access mid-incident.

## Owner sign-offs

| Role | Sign-off | Date |
|------|----------|------|
| Engineering owner | [PENDING] | |
| Finance/billing owner | [PENDING] | |
| Privacy owner | [PENDING] | |
| Release manager | [PENDING] | |

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
document.**
