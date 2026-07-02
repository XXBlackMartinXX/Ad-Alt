# PromptProfit — Fraud, Abuse, and Quality Controls (Monetization)

**Phase:** Internal Beta Monetization Readiness
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Scope:** billing-adjacent fraud/abuse/quality controls, source-verified

---

## 1. Fake impressions

**Control exists.** `FraudScorer.scoreImpression()` / `scoreViewability()`
(`packages/fraud/src/scorer.ts`) checks displayed duration against
`IMPRESSION_MIN_THRESHOLD_MS` (3000ms) and an upper sanity bound (30 min) —
an impression displayed too briefly or implausibly long is flagged
(`impossibleDurationSignal`, score 50/90). Viewability itself requires a
real `IntersectionObserver` + timer in the extension
(`IMPRESSION_VIEWABILITY_THRESHOLD_MS = 5000`), not a self-reported flag.
**Status:** Implemented. **Blocks internal beta:** No. **Blocks public
release:** No (sufficient for both, pending staging load testing).

## 2. Duplicate impressions

**Control exists — 3 layers.** Redis atomic `SET ... NX` dedup +
DB-unique `event_deduplication_keys.key` + DB-unique
`impression_events.idempotency_key` (see
`MONETIZATION_SOURCE_AUDIT.md` Q9, verified this session via
`check-ledger-confidence.js` §4 and the existing
`ledger-balance.test.ts` "duplicate eventId does not double-bill" test).
**Status:** Implemented. **Blocks internal beta:** No. **Blocks public
release:** No.

## 3. Replay events

**Control exists.** Same mechanism as #2 — a replayed event carries the
identical `eventId`, caught before any DB/ledger work
(`event-processor.ts:44-47`). Verified this session via
`check-ledger-confidence.js` §5. **Status:** Implemented. **Blocks
internal beta:** No. **Blocks public release:** No.

## 4. Bot/click spam

**Partial control.** `rapidClickSignal` in `FraudScorer.scoreClick()`
flags clicks within `CLICK_RATE_LIMIT_SECONDS` (30s) of the device's last
click (score 40). This is a **per-device, in-process signal** — there is
no IP-based or account-level click-spam detection, and no CAPTCHA/
challenge mechanism. A sophisticated multi-device bot would not be caught
by this signal alone (device-velocity and impression-rate signals provide
partial secondary coverage). **Status:** Partially implemented. **Risk:**
Medium. **Blocks internal beta:** No (internal beta uses a small, known
tester population). **Blocks public release:** Recommend strengthening
before any high-traffic public rollout — **TODO**, not yet scoped.

## 5. Clicks without viewability/impression context

**Control exists.** `hasValidPriorImpression` check in
`event-processor.ts:281-282` requires the impression to be in
`"billable"` or `"reconciled"` status; if not, `clickWithoutImpressionSignal`
(score 95) forces a `"block"` decision (95 ≥ `BLOCK_THRESHOLD` 85) — no
ledger entry is created. Verified this session via
`check-ledger-confidence.js` §6 (explicit test: click with no prior
impression → `fraud_block`, zero ledger entries). **Status:** Implemented.
**Blocks internal beta:** No. **Blocks public release:** No.

## 6. Developer self-click fraud

**Not implemented — gap.** There is no mechanism anywhere in the codebase
that correlates a click's `deviceId` against the developer who owns the
API key used, or detects a developer clicking their own served ads. The
existing fraud signals (`rapidClickSignal`, `deviceVelocityHighSignal`)
would catch an *obviously* automated pattern from the same device, but a
developer manually self-clicking at a human pace would not be flagged by
anything in this codebase today. **Status:** NOT IMPLEMENTED. **Risk:**
Medium-High for a real-money pilot; Low for internal beta (synthetic/test
accounts only, no real developer earnings at stake). **Blocks internal
beta:** No. **Blocks public release:** Yes — recommend before any real
developer payout is enabled. **TODO**, not yet scoped.

## 7. Advertiser budget abuse

**Control exists.** `campaigns.budgetMicrocents` / `spentMicrocents`
checked atomically under `SELECT ... FOR UPDATE` before every charge
(`ledger.service.ts:66-100`); campaign is marked `"exhausted"` and stops
billing once the budget would be exceeded. No overspend is possible past
one in-flight event's worth of race window (bounded by the row lock).
**Status:** Implemented. **Blocks internal beta:** No. **Blocks public
release:** No.

## 8. API key misuse

**Partial control.** `requireApiKey` middleware
(`apps/api/src/middleware/auth.ts`) validates a hashed API key
(`apiKeys.keyHash`) and supports `revokedAt`/`expiresAt`. `rateLimit`
middleware (`apps/api/src/middleware/rate-limit.ts`) caps `/v1/events` at
300 requests/60s per user, using atomic Redis `INCR` + `EXPIRE NX`. There
is no automated anomaly detection (e.g. a key suddenly used from many
distinct devices) — revocation is a manual/admin action.
`check:secrets:local` (existing repo gate, run this session, 0 leaks
across 396 files) provides defense-in-depth against a key being
accidentally committed to source. **Status:** Partially implemented.
**Blocks internal beta:** No. **Blocks public release:** No (rate
limiting + revocation is adequate baseline; anomaly detection is a
future enhancement, not a blocker).

## 9. Event tampering

**Control exists.** All billable events are validated against a closed
Zod schema (`EventValidator` / `TelemetryEventSchema`,
`packages/telemetry/src`) before processing — unknown/extra fields are
rejected, not silently passed through. Pricing (`cpmBidMicrocents`) is
always read server-side from the `campaigns` table, never accepted from
the client event payload — a tampered client cannot inflate its own
billing rate (confirmed: `ledger.service.ts` always sources
`cpmBidMicrocents` from the DB-fetched `campaign` row, never from the
event). **Status:** Implemented. **Blocks internal beta:** No. **Blocks
public release:** No.

## 10. Rate limits

**Control exists, narrow scope.** `/v1/events` is rate-limited (300/60s
per user, `routes/events.ts:15-22`). No rate limit was found on
`/v1/ledger/me` or `/v1/admin/*` routes (`grep` confirms `rateLimit(...)`
is only applied to the events route). **Status:** Partially implemented.
**Risk:** Low (these are authenticated, low-value-to-abuse read/admin
endpoints, not the billing write path). **Blocks internal beta:** No.
**Blocks public release:** Recommend extending rate limiting to all
authenticated routes before public release — **TODO**.

## 11. Kill-switch behavior

**Control exists for reading; no admin write path exists.**
`EventProcessor.isAdapterKillSwitched()` checks three flag names
(`kill_switch_all_ads`, `disable_adapter_<name>`, `kill_switch_<name>`)
from the `featureFlags` table before processing any event
(`event-processor.ts:30-37`), and `GET /v1/flags`
(`routes/flags.ts`) exposes current flag state read-only. **Gap found this
session:** there is no admin API endpoint or script anywhere in this repo
that WRITES a feature flag — `grep -rn "featureFlags" apps/api/src`
confirms only reads (`flags.ts`, `event-processor.ts`). Actually flipping
a kill switch today requires a direct database write (e.g. manual SQL),
not an application-level action. This matches
`docs/internal-beta/ROLLBACK_AND_DISABLE_GUIDE.md`'s existing rollback
procedure (uninstall/disable at the extension level), but the
*feature-flag* kill switch specifically has no in-app admin control.
**Status:** Read path implemented; write/admin path NOT IMPLEMENTED.
**Risk:** Medium (an internal beta with engineering DB access can still
flip the switch manually; a real production incident response would want
an admin API/UI). **Blocks internal beta:** No. **Blocks public release:**
Recommend an admin kill-switch endpoint before public release — **TODO**.

## 12. Audit logging

**Control exists, narrow scope.** `adminAuditLogs` table is written for
creative review (`admin.ts:78-88`) and campaign review (`:147-157`)
actions, with actor ID, actor email, action, target, details, and a
**hashed** (not raw) IP address (`createHash("sha256")` —
`admin.ts:86,155`, consistent with the no-raw-PII posture verified in
Phase 7). **Gap:** no audit log entry is written for fraud-scoring
decisions themselves (block/review/pass), for ledger writes, or for any
future kill-switch/device-block admin action (since those write paths
don't exist yet — see #6, #11). **Status:** Partially implemented.
**Blocks internal beta:** No. **Blocks public release:** Recommend
extending audit logging to fraud/ledger/kill-switch actions before public
release — **TODO**.

---

## Summary table

| # | Control | Status | Blocks internal beta? | Blocks public release? |
|---|---------|--------|------------------------|--------------------------|
| 1 | Fake impressions | Implemented | No | No |
| 2 | Duplicate impressions | Implemented | No | No |
| 3 | Replay events | Implemented | No | No |
| 4 | Bot/click spam | Partial | No | Recommended (TODO) |
| 5 | Click without impression context | Implemented | No | No |
| 6 | Developer self-click fraud | Not implemented | No | Yes (TODO) |
| 7 | Advertiser budget abuse | Implemented | No | No |
| 8 | API key misuse | Partial | No | No |
| 9 | Event tampering | Implemented | No | No |
| 10 | Rate limits (full coverage) | Partial | No | Recommended (TODO) |
| 11 | Kill-switch admin write path | Not implemented (read-only) | No | Recommended (TODO) |
| 12 | Audit logging (full coverage) | Partial | No | Recommended (TODO) |

**Internal beta assessment:** No control gap found above blocks a
tightly-scoped internal pilot using synthetic/test accounts and a small,
known tester population — the gaps that exist (#6, #10 full coverage,
#11 write path, #12 full coverage) are all real-money / public-scale
concerns, correctly out of scope for this phase, and are carried forward
into public-release requirements rather than silently dropped.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
document.**
