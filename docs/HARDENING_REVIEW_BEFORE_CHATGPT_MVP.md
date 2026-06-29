# Hardening Review: Commit ffa5ba0

**Review date:** 2026-06-29  
**Commit:** `ffa5ba0` — "fix: browser foundation hardening (Phases 1–9)"  
**Reviewer:** pre-MVP gate check before ChatGPT browser adapter ship

---

## Purpose

This document records the review of the `ffa5ba0` hardening commit before the
ChatGPT browser adapter MVP is shipped.  It verifies that each of the 9 hardening
fixes from the prior audit is present, correct, and that no regression was introduced.

---

## Finding-by-finding review

### Finding 1 — Build script missing (BLOCKER)

**Fix committed:** `apps/browser-extension/scripts/bundle.mjs` added. `package.json`
`build` script changed from a non-existent `vite build` to `node scripts/bundle.mjs`.  
**Verification:** `pnpm --filter @ad-alt/browser-extension build` exits 0 and produces
`dist/content/chatgpt.js`, `dist/content/claude.js`, `dist/content/gemini.js`,
`dist/background/service-worker.js`.  
**Status:** FIXED.

---

### Finding 2 — TELEMETRY_FORBIDDEN_FIELDS missing browser-specific entries

**Fix committed:** `packages/shared/src/schemas/events.ts` now exports a 26-field
`TELEMETRY_FORBIDDEN_FIELDS` array including 9 browser-specific entries:
`pageTitle`, `pageUrl`, `pageContent`, `domText`, `clipboardContent`,
`screenshotData`, `cookieData`, `authToken`, `sessionCookie`.  
**Verification:** `packages/telemetry/src/__tests__/validator.test.ts` exercises all 26
fields; 58 tests pass.  
**Status:** FIXED.

---

### Finding 3 — Kill-switch dedup semantics: dedup key not written on disabled path

**Fix committed:** `apps/api/src/services/event-processor.ts` — when an adapter is
kill-switched, the code now inserts the event ID into `eventDeduplicationKeys` before
returning `{ fraudDecision: 'adapter_disabled' }`.  This prevents a kill-switched
event from being replayed as billable if the kill switch is later lifted.  
**Verification:** API event-processor tests pass; kill-switch test path confirmed.  
**Status:** FIXED.

---

### Finding 4 — Service-worker fresh-install: fail-open on empty storage

**Fix committed:** `apps/browser-extension/src/background/service-worker.ts`  
- `refreshFlags()` no longer stamps `flagsFetchedAt` when storage returns empty (so
  the TTL is never set without valid flags).  
- `isValidFeatureFlags()` type-guard added; `refreshFlags` only accepts storage data
  that passes the guard.  
- Default `cachedFlags` is `FALLBACK_FLAGS_DISABLED` — the fail-closed sentinel.  
**Verification:** Kill-switch tests pass including `FALLBACK_FLAGS_DISABLED` fresh-install path.  
**Status:** FIXED.

---

### Finding 5 — UPDATE_FLAGS message accepts unvalidated payload

**Fix committed:** The `UPDATE_FLAGS` message handler in the service-worker now calls
`isValidFeatureFlags(candidate)` before accepting the payload.  Invalid or malformed
flag updates are rejected with `{ ok: false }` and the cached flags remain unchanged.  
**Verification:** Code review confirms guard is applied before any write to storage.  
**Status:** FIXED.

---

### Finding 6 — Dedup check runs after kill-switch check (wrong order)

**Fix committed:** `event-processor.ts` reordered: (1) Redis dedup → (2) kill-switch →
(3) DB dedup → (4) process.  Duplicate events are rejected before any kill-switch
lookup, saving a DB round-trip per duplicate.  
**Verification:** Reorder is visible in the final `process()` method; dedup test cases pass.  
**Status:** FIXED.

---

### Finding 7 — Unimplemented desktop adapters in schema

**Fix committed:** `packages/shared/src/schemas/users.ts` `preferredAdapterName` field
updated to exclude the three unimplemented desktop adapter IDs
(`desktop_chatgpt`, `desktop_claude`, `antigravity`).  Only shippable IDs remain
in the user-facing enum.  
**Verification:** Schema tests pass; unimplemented IDs not present.  
**Status:** FIXED.

---

### Finding 8 — MutationObserver observing `attributes: true`

**Fix committed:** `apps/browser-extension/src/content/wait-state-detector.ts`
`observe()` call updated to `{ childList: true, subtree: true }` — `attributes: true`
removed.  A 150 ms leading-edge throttle added to the `checkState` callback.  
**Verification:** Code review confirms change; throttle logic tested implicitly via
wait-state tests.  
**Status:** FIXED.

---

### Finding 9 — Adapter enum duplicated across three files

**Fix committed:** `packages/platform-core/src/adapter-ids.ts` exports
`ADAPTER_ENUM_VALUES` as the single source of truth for the Zod-compatible tuple.
`packages/shared/src/schemas/events.ts`, `campaigns.ts`, and
`apps/api/src/routes/ad-decision.ts` all import from platform-core instead of
maintaining local copies.  
**Verification:** Typecheck clean; event-schema tests pass confirming enum derivation.  
**Status:** FIXED.

---

## Regression check

| Suite | Tests before ffa5ba0 | Tests after ffa5ba0 |
|---|---|---|
| platform-core | 25 | 25 |
| shared | 29 | 29 |
| fraud | 31 | 31 |
| ledger | 39 | 39 |
| telemetry | 49 → 58 | 58 |
| browser-extension | 45 → 53 | 53 |
| **Total** | **218 → 235** | **235** |

No regressions. Test count increased due to new browser-forbidden-field coverage.

---

## Non-negotiable rule compliance

| Rule | Status |
|---|---|
| Privacy: no user content in any field | VERIFIED — forbidden fields tested in telemetry + browser-extension |
| Kill-switch: fail-closed fresh install | VERIFIED — `FALLBACK_FLAGS_DISABLED` is default, type-guard rejects bad payloads |
| Kill-switch: dedup on disabled path | VERIFIED — DB write on kill-switch path prevents replay |
| Financial: no float math | VERIFIED — ledger tests unchanged, no new float operations |
| Clean-room: no Kickback.ai code | VERIFIED — all selectors, schemas, and logic are original |

---

## Gate decision

**PASS.** All 9 hardening findings are fixed, no regressions, all non-negotiable
rules verified. The ChatGPT browser adapter MVP may proceed.
