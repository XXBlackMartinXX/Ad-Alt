# PromptProfit — Kill-Switch and Rollback Review (Monetization)

**Phase:** Internal Beta Pilot Rehearsal
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Scope:** billing-adjacent kill-switch/rollback controls, source-verified

---

## 1. What can be disabled immediately?

| Control | Immediate? | Evidence |
|---------|-----------|----------|
| Individual API key | YES — `DELETE /v1/auth/keys/:keyId` sets `revokedAt`, enforced on the very next request | `apps/api/src/routes/auth.ts:95-100`, `apps/api/src/middleware/auth.ts:31-33` (`requireApiKey` returns 401 immediately once `revokedAt` is set) |
| Billing for a kill-switched adapter | YES, server-side — a `featureFlags` row write is read fresh on every event, before any ledger work | `apps/api/src/services/event-processor.ts:52` (`isAdapterKillSwitched`, checked before the event-type switch) |
| Browser extension itself | YES, by the tester — disable or remove via `chrome://extensions` | `docs/internal-beta/ROLLBACK_AND_DISABLE_GUIDE.md` §1-2 |
| Client-side ad serving (banner) for a kill-switched adapter | YES as of this phase's fix — was previously NOT live-synced (see §2 finding) | `apps/browser-extension/src/background/service-worker.ts`'s new `syncFlagsFromBackend()`, fired on service-worker startup and every 5-minute alarm |
| Payout simulation | N/A — there is nothing to disable; it is a read-only script run on demand, never scheduled, never persists outside its own report | `scripts/simulate-payouts.js` |

## 2. What requires a code change?

- **Refunds/voids** — do not exist in application code at all (only the
  `refund_debit`/`refund_credit` ledger entry type is defined). Reversing a
  bad charge today requires either a manual, documented ledger note or new
  application code — there is no "disable" for something that was never
  built. Confirmed in `docs/internal-beta/monetization/MONETIZATION_SOURCE_AUDIT.md` Q17.
- **Real payout execution** — does not exist; nothing to disable because
  nothing can be triggered in the first place (Q18, same doc).
- **Batch reconciliation** — does not exist as a scheduled job; only the
  inline per-event invariant check runs today (Q19).

## 3. What requires operator action?

- **Feature-flag kill switch itself** (`kill_switch_all_ads`,
  `disable_adapter_<name>`, `kill_switch_<name>` in the `featureFlags`
  table) — there is **no admin API or UI to WRITE these flags** (confirmed
  by `grep -rn "featureFlags" apps/api/src` returning only read sites in
  `routes/flags.ts` and `event-processor.ts`). An operator must write the
  row directly (e.g. via `psql` or an internal DB tool). This was already
  flagged as a gap in `docs/internal-beta/monetization/FRAUD_ABUSE_CONTROLS.md` #11 and remains
  true after this phase — implementing a full admin API for this was
  judged out of scope for an internal-beta-only safeguard (see §10).
- **API key revocation** — an operator (or the developer/advertiser
  themselves, if given the endpoint) must call
  `DELETE /v1/auth/keys/:keyId`; there is no automatic revocation trigger.

## 4. What requires infrastructure access?

- Direct database access to write a `featureFlags` row (§3).
- Stopping the local Docker stack entirely —
  `docs/internal-beta/ROLLBACK_AND_DISABLE_GUIDE.md` §4.
- Any staging/production-level rollback — none of this has been built or
  exercised yet (staging reconciliation has never been run).

## 5. Can billing be stopped safely?

**YES, and this was already true before this phase.** Setting
`kill_switch_all_ads` (or a per-adapter flag) to `true` in the
`featureFlags` table takes effect on the very next event, because
`EventProcessor.process()` re-reads the `featureFlags` table on every
single call (`isAdapterKillSwitched`, `event-processor.ts:30-37`) — there
is no caching or delay on the server side. A kill-switched event is
recorded as a dedup key (so it cannot be replayed later if the switch is
lifted) but produces `fraudDecision: "adapter_disabled"` and **never
reaches `LedgerService`** — confirmed by direct code inspection, not by
running a live server (no live Postgres in this sandbox).

## 6. Can serving be stopped safely?

**Partially, and this phase closes the main gap.** Before this phase: the
same `featureFlags` state that stops billing server-side had **no path to
reach the browser extension's local cache** — `packages/platform-core`'s
own doc comment says adapters "must poll [`/v1/flags`] on startup and
before each wait-state," but `apps/browser-extension/src/background/
service-worker.ts` never actually fetched that endpoint; its local
`featureFlags` cache was populated only by a safe default
(`killSwitchEnabled: false`) or by an `UPDATE_FLAGS` message that nothing
in the codebase ever sends. This meant flipping the backend kill switch
stopped billing immediately, but a tester's already-loaded extension could
keep requesting and rendering the banner until the local cache was somehow
refreshed (which, absent this fix, might never happen automatically).

**Fix implemented this phase** (see
`apps/browser-extension/src/background/service-worker.ts`): a new
`syncFlagsFromBackend()` function performs the real `GET /v1/flags`
fetch, validates the response, and updates the local cache — called
fire-and-forget on service-worker startup and on the existing 5-minute
`refresh-flags` alarm. This is strictly additive: the hot per-wait-state
gating path (`refreshFlags()`, used by `CHECK_ADAPTER_STATUS` and
`GET_AD_DECISION`) is completely unchanged, so no latency or behavior
regression was introduced to the already-verified DRYRUN-001 runtime path
— confirmed by re-running the full existing test suite after the change:
`apps/browser-extension` unit tests (148/148, including both
`kill-switch.test.ts` cases and the new `flags-sync.test.ts`), typecheck
(clean), and the fixture-based e2e smoke suite (27/27, including both
kill-switch scenarios: "disabled adapter (kill-switch) shows no banner"
and "kill-switch active ... suppresses the banner").

**Remaining limitation:** serving stop is now live within **5 minutes**
(the alarm period) of a backend flag change, or immediately for a freshly
started service worker — not instantaneous like the billing stop. This is
an acceptable internal-beta tradeoff (billing, the thing with real
financial consequences even in simulation, was already instantaneous) and
is documented honestly here rather than overstated.

## 7. Can payout simulation be stopped safely?

Trivially yes — `simulate:payouts` is a one-shot, on-demand script with no
persistent process, no schedule, and no queue. There is nothing running
to "stop." Since no real payout execution exists anywhere in this
codebase, there is also no real-money process that could need stopping.

## 8. What is missing for public release?

1. An admin API/UI to write feature flags (today: direct DB access only).
2. Batch reconciliation and refund/void implementation (§2).
3. A documented, tested staging rollback procedure — none has been
   exercised (`docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md` §8 Audit
   Log remains empty).
4. Real payout provider integration, and a corresponding real payout
   kill-switch/rollback procedure for it (none needed today because none
   exists to roll back).

## 9. What blocks internal beta pilot rehearsal?

**Nothing new.** The client-side kill-switch sync gap (§6) was the one
concrete, internal-beta-relevant safeguard this review found missing and
low-risk to fix, and it has been fixed and verified this phase. No S0/S1
issue is open as a result of this review — see
`docs/internal-beta/monetization/MONETIZATION_RISK_REGISTER.md` for the
full risk accounting (this finding is added there as a new, now-resolved
entry).

## 10. Recommended next implementation tasks

1. Build a minimal admin endpoint (`POST /v1/admin/flags/:name`) to write
   feature flags, gated by `requireAdmin` (already exists and is used
   elsewhere in `apps/api/src/routes/admin.ts`) — explicitly deferred this
   phase as "overbuilding production infrastructure" for what is
   currently a rare, low-frequency operator action; revisit before public
   release.
2. Reduce the `refresh-flags` alarm period below 5 minutes if a faster
   client-side serving stop is judged necessary before a larger internal
   rollout (trivial one-line change, `chrome.alarms.create("refresh-flags",
   { periodInMinutes: 5 })`).
3. Implement refund/void and batch reconciliation (carried forward from
   `MONETIZATION_RISK_REGISTER.md`, unchanged by this review).
4. Add a staging rollback rehearsal once a staging environment exists.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
document.**
