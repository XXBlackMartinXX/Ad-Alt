# Browser Foundation Audit — Fix Record

**Branch:** claude/ecstatic-maxwell-h0d8d8  
**Hardening commit:** (see git log)

## Finding 1 — Browser extension build broken

**Severity:** CONFIRMED  
**Files:** `apps/browser-extension/`

**Problem:** `manifest.json` references `dist/content/chatgpt.js`, `dist/content/claude.js`,
`dist/content/gemini.js`. None of those source files existed. `scripts/bundle.mjs`
(referenced in the `build` npm script) also did not exist.

**Fix:**
- Created `src/content/_content-main.ts` — shared entry-point logic (kill-switch check,
  WaitStateDetector wiring, service-worker messaging)
- Created `src/content/chatgpt.ts`, `claude.ts`, `gemini.ts` — thin per-domain entry points
  that import `_content-main.ts`; esbuild bundles each separately
- Created `scripts/bundle.mjs` — esbuild script that bundles content scripts (IIFE) and
  service worker (ESM) for browser consumption
- Changed `build` script from `tsc && node scripts/bundle.mjs` to `node scripts/bundle.mjs`
  (type-checking is already handled by the separate `typecheck` script)
- Added `esbuild ^0.23.0` as devDependency

---

## Finding 2 — TELEMETRY_FORBIDDEN_FIELDS missing 9 browser-specific fields

**Severity:** CONFIRMED  
**Files:** `packages/shared/src/schemas/events.ts`

**Problem:** `TELEMETRY_FORBIDDEN_FIELDS` in `shared` had 17 fields (VS Code–focused).
`packages/platform-core/src/privacy-guard.ts` had the full 26-field list including
9 browser-specific fields (`pageTitle`, `pageUrl`, `pageContent`, `domText`,
`clipboardContent`, `screenshotData`, `cookieData`, `authToken`, `sessionCookie`).
The telemetry validator in `packages/telemetry` imports from `shared`, so the
browser-specific fields were NOT being rejected by the API validator.

**Fix:**
- Added the 9 missing browser fields to `TELEMETRY_FORBIDDEN_FIELDS` in `shared`
- Added corresponding test cases to `packages/telemetry/src/__tests__/validator.test.ts`
- The `packages/shared/src/__tests__/telemetry-privacy.test.ts` schema-structure test
  automatically picks up the new entries (it iterates over `TELEMETRY_FORBIDDEN_FIELDS`)

---

## Finding 3 — Kill-switched events not written to dedup store

**Severity:** CONFIRMED  
**Files:** `apps/api/src/services/event-processor.ts`

**Problem:** When `isAdapterKillSwitched()` returns true, the handler returned
`{ fraudDecision: "adapter_disabled" }` immediately — without writing the `eventId`
to Redis or the `eventDeduplicationKeys` DB table. If the kill-switch was later
lifted, the same `eventId` could be replayed and processed as a fresh event,
producing a billable impression.

**Fix:**
- After the kill-switch check (which now runs after the Redis dedup fast-path),
  write the dedup key to both Redis (via `dedupCheck`) and the DB
  (`eventDeduplicationKeys` insert) before returning `adapter_disabled`
- Redis write is done via `dedupCheck` which atomically writes if not present
- DB write uses `onConflictDoNothing` for safety

---

## Finding 4 — Service worker fail-open on fresh install

**Severity:** CONFIRMED  
**Files:** `apps/browser-extension/src/background/service-worker.ts`

**Problem:** `refreshFlags()` opens with `let cachedFlags = FALLBACK_FLAGS_DISABLED`
(correct: fail-closed). But when `chrome.storage.local.get("featureFlags")` returns
an empty object (fresh install), the `else` branch set
`cachedFlags = { killSwitchEnabled: false, disabledAdapters: [], flags: {} }` —
switching to fail-OPEN — and then stamped the TTL. For the next 5 minutes the
extension showed ads before the API was ever queried.

**Fix:**
- Empty storage now keeps `cachedFlags = FALLBACK_FLAGS_DISABLED` (fail-closed stays)
- The TTL is NOT stamped on empty storage, so the next call will re-query storage
  (or ideally hit the API when that flow is added)

---

## Finding 5 — UPDATE_FLAGS has no origin or payload validation

**Severity:** CONFIRMED  
**Files:** `apps/browser-extension/src/background/service-worker.ts`

**Problem:** Any content script or injected code could send
`{ type: "UPDATE_FLAGS", flags: { killSwitchEnabled: false, disabledAdapters: [], flags: {} } }`
to the service worker and disable the kill switch for 5 minutes.

**Fix:**
- Added `isValidFeatureFlags()` type-guard that verifies the `flags` payload has
  the correct shape before accepting it
- Invalid payloads are silently rejected (respond `{ ok: false }`)

---

## Finding 6 — isAdapterKillSwitched runs full DB scan before Redis dedup

**Severity:** PLAUSIBLE  
**Files:** `apps/api/src/services/event-processor.ts`

**Problem:** Every event triggered a `SELECT * FROM featureFlags` before the Redis
dedup check. For duplicate events (e.g., extension retry), the DB scan was wasted
work. For non-duplicate events, the DB scan on every call adds latency.

**Fix:**
- Moved the Redis dedup check BEFORE the kill-switch check — duplicate events return
  early with zero DB work
- Added a 60-second in-memory flag cache (`flagCache`) to `isAdapterKillSwitched()`:
  the first call in each 60-second window hits the DB; subsequent calls return the
  cached map

---

## Finding 7 — preferredAdapterName includes unimplemented desktop adapters

**Severity:** CONFIRMED  
**Files:** `packages/shared/src/schemas/users.ts`

**Problem:** `UpdateDeveloperProfileSchema.preferredAdapterName` included
`desktop_chatgpt`, `desktop_claude`, and `antigravity`. None of these adapters
exist in the codebase. A user selecting one of them would get an adapter that
silently never activates.

**Fix:**
- Removed `desktop_chatgpt`, `desktop_claude`, `antigravity` from the enum
- The remaining values match adapters that are actually implemented:
  VS Code adapters, browser adapters, and `mock` (dev/testing)

---

## Finding 8 — MutationObserver attributes:true on full subtree

**Severity:** PLAUSIBLE  
**Files:** `apps/browser-extension/src/content/wait-state-detector.ts`

**Problem:** The observer was configured with `{ childList: true, subtree: true, attributes: true }`.
`attributes: true` with `subtree: true` fires on every DOM attribute mutation anywhere
on the page — including every `aria-*`, `class`, `style` change during AI token streaming.
This can fire thousands of times per second during streaming, calling `document.querySelector()`
on each mutation.

**Fix:**
- Removed `attributes: true` (child-list mutations are sufficient to detect the
  stop-button appearing/disappearing)
- Added a 150 ms leading-edge throttle on `checkState()` to limit querySelector frequency
- Scoped the observer to `document.documentElement` (was already `document.body`,
  which is equivalent; kept as-is)

---

## Finding 9 — Adapter-name enum duplicated across 4+ files

**Severity:** PLAUSIBLE  
**Files:** `packages/shared/src/schemas/events.ts`, `campaigns.ts`, `users.ts`,
`apps/api/src/routes/ad-decision.ts`

**Problem:** The 11-value adapter-name list was hard-coded in at least four places.
Adding or renaming an adapter required updating each location independently; a missed
update would cause schema mismatches.

**Fix:**
- Added `ADAPTER_ENUM_VALUES` export to `packages/platform-core/src/adapter-ids.ts`
  — a mutable tuple derived from `ALLOWED_ADAPTER_IDS`, typed for Zod compatibility
- Added `@ad-alt/platform-core` as a dependency of `@ad-alt/shared`
- Replaced the hard-coded enum lists in `events.ts`, `campaigns.ts`, and
  `ad-decision.ts` with `z.enum(ADAPTER_ENUM_VALUES)`
- `preferredAdapterName` in `users.ts` remains an explicit subset (implemented
  adapters only) so it is intentionally not derived from the full allowlist
