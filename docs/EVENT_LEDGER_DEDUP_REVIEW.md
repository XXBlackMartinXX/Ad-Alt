# Event Ledger and Deduplication Review

**Date:** 2026-06-30
**Scope:** `apps/browser-extension/src/content/ad-event-sender.ts`
         `apps/browser-extension/src/adapters/chatgpt/chatgpt.adapter.ts`
         `apps/browser-extension/src/content/chatgpt.ts`
         `apps/browser-extension/src/background/service-worker.ts`
**Status:** CLEAN — no dedup gaps found

---

## 1. Event Types

The extension fires three event types per impression:

| Event | When Fired | Required Fields |
|-------|-----------|----------------|
| `impression_requested` | Before banner is rendered (after ad decision received) | campaignId required; skipped if absent |
| `impression_rendered` | Immediately after banner enters DOM | adDecisionId |
| `viewability_threshold_met` | After banner visible for 5000ms (production) | adDecisionId, displayedDurationMs, thresholdMs |

---

## 2. Event ID Uniqueness

Each event gets a unique ID via `crypto.randomUUID()` at dispatch time.

```typescript
// ad-event-sender.ts line 89, 110, 132
eventId: crypto.randomUUID(),
```

`crypto.randomUUID()` returns a version-4 UUID per the Web Crypto spec.
Collision probability is negligible (2^122 event space). No dedup on the
client side is needed or implemented — each fired event is inherently unique.

**Status: SAFE** — eventId is per-event, not reused.

---

## 3. Session and Sequence State

```typescript
// ad-event-sender.ts
const SESSION_ID: string = crypto.randomUUID();  // module scope, one per page load
let _seq = 0;
function nextSeq(): number { return _seq++; }    // monotonically increasing
```

- `SESSION_ID`: Fixed for the lifetime of a content-script execution context
  (one per page load/navigation). A new page load generates a new session ID.
- `sequenceNumber`: Starts at 0, increments for each event dispatched in
  the session. Monotonic within a session but not globally unique.
- Both are extension-internal — no page data is included.

**Status: SAFE** — session ID does not leak page identity; sequence resets on
navigation, which is expected behavior.

---

## 4. Device ID

```typescript
// ad-event-sender.ts
async function getDeviceId(): Promise<string> {
  // Reads from chrome.storage.local; generates once and persists.
  const id = `dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await chrome.storage.local.set({ deviceId: id });
  // ...
}
```

- Device ID is a pseudonymous persistent identifier stored in `chrome.storage.local`.
- It is NOT linked to any user account, email, or page identity.
- It survives page navigations but not extension uninstall/reinstall.
- The prefix `dev_` makes it identifiable in logs as a device identifier.

**Privacy status:** Pseudonymous device identifier. Acceptable for ad
frequency capping and dedup. Does not identify the user or link to page content.

---

## 5. Forbidden Field Rejection

The `privacy-guard.ts` module enforces that no forbidden fields appear in
any event payload:

```typescript
const forbidden = [
  "pageTitle", "pageUrl", "pageContent", "domText",
  "clipboardContent", "screenshotData", "cookieData",
  "authToken", "sessionCookie", "referrer", "userAgent",
];
```

The `ad-event-sender.ts` constructs events from ONLY:
- Backend-assigned identifiers: `adDecisionId`, `campaignId`, `creativeId`
- Extension-internal metadata: `deviceId`, `sessionId`, `extensionVersion`,
  `sequenceNumber`, `clientTimestamp`, `eventId`, `adapterName`
- Event-specific data: `displayedDurationMs`, `thresholdMs`, `renderedAt`

None of these fields overlap with the forbidden list.
Privacy smoke tests (`privacy.smoke.spec.ts`) verify this at E2E level.

**Status: SAFE** — all events verified to contain no forbidden fields.

---

## 6. Event Pipeline Ordering

Ordering guaranteed by `chatgpt.ts`:

```
impression_requested  (before renderSponsoredMoment)
     ↓
impression_rendered   (after renderSponsoredMoment returns)
     ↓
viewability_threshold_met  (after 5000ms IntersectionObserver + timer)
```

There is no mechanism to fire `viewability_threshold_met` before
`impression_rendered` — the viewability observer is only started after the
banner is in the DOM.

`impression_requested` is fired with `void` (fire-and-forget) before
`impression_rendered` because the render is the visible signal; the request
event is informational. Both are async; there is no ordering guarantee
relative to each other at the network level, but both are dispatched to the
service worker before the next user interaction.

**Status: ACCEPTABLE** — ordering matches expected pipeline semantics.

---

## 7. Duplicate Fire Risk

### Same wait-state event

The `ChatGPTAdapter.onWaitStateStart` callback is registered once and fires
once per detected wait-state transition. The wait-state detector in
`chatgpt.wait-state.ts` is a MutationObserver that gates on a `!isWaiting`
→ `isWaiting` transition, preventing double-fire within a single wait state.

### Multiple wait-states per session

Each ChatGPT response generation is a separate wait-state. Each fires a full
`impression_requested → impression_rendered → viewability_threshold_met`
sequence with a new `adDecisionId` from a fresh GET_AD_DECISION call. The
`sequenceNumber` ensures these are distinguishable.

**Status: SAFE** — each wait-state produces at most one set of three events.

---

## 8. Cleanup on Wait-State End

When the wait state ends (`onWaitStateEnd`):
- The viewability observer is torn down (clears IntersectionObserver).
- The test-only timer is cancelled (`testViewabilityTimer` cleared in
  `fixture-test.ts`).
- The banner is removed from the DOM.

This prevents a race where `viewability_threshold_met` fires after the
banner has already been removed.

**Status: SAFE** — cleanup is correct; no orphaned timers in production path.

---

## 9. Service Worker Pass-Through

The service worker does not inspect or modify event payloads:

```typescript
// service-worker.ts
async function postEvent(event: unknown): Promise<void> {
  const resp = await fetch(`${apiBaseUrl}/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  // ...
}
```

The payload is passed through as-is. Privacy validation is the content
script's responsibility (privacy-guard.ts and field construction in
ad-event-sender.ts).

**Status: ACCEPTABLE** — pass-through design is intentional; content script
is the correct trust boundary.

---

## 10. Local Real-API Smoke Verification Results

Now that local-real-API smoke has passed on Windows (commit c5167e2), the
following table records what was actually verified end-to-end.

| Stage | Method | Status |
|-------|--------|--------|
| Ad-decision preflight | GET /v1/ads/decision returned 200 OK | PASS |
| browser_chatgpt adapter eligibility | Campaign includes browser_chatgpt in targetAdapterNames | PASS |
| Banner rendered on ChatGPT | #promptprofit-sponsored-banner in DOM after wait-state | PASS |
| impression_events row in Postgres | query-local-browser-events.ps1 returned >= 1 row | PASS |
| deviceId consistency | local-real-api-smoke-device in preflight, service worker, storage | PASS |
| API key handling | PROMPTPROFIT_DEV_API_KEY cleared from env after run; never printed | PASS |
| Viewability event | NOT VERIFIED - 5000ms production threshold exceeds smoke run | NOT VERIFIED |
| Click event | NOT VERIFIED - no click automation in smoke | NOT VERIFIED |
| Ledger/billing reconciliation | NOT VERIFIED - local dev has no billing reconciler | NOT VERIFIED |
| Fraud signal pipeline | NOT VERIFIED - not running in local dev stack | NOT VERIFIED |

### Billing Readiness Assessment

- **impression ingestion: PASS** - impression events reach backend and are persisted
- **viewability billing: PARTIAL** - event fires in fixture tests; production billing not verified
- **click billing: NOT VERIFIED** - no click test in smoke pipeline
- **production fraud/ledger readiness: PARTIAL/BLOCKED** - requires staging environment

---

## 11. Summary

| Concern | Finding | Status |
|---------|---------|--------|
| eventId uniqueness | crypto.randomUUID() per event | SAFE |
| Session ID leakage | MODULE-scope random UUID, no page data | SAFE |
| Forbidden field presence | Privacy guard + ad-event-sender construction | SAFE |
| Double-fire on wait-state | MutationObserver gates on transition | SAFE |
| Race: viewability after cleanup | Observer torn down on wait-state end | SAFE |
| Service worker payload inspection | Pass-through, no modification | ACCEPTABLE |
| Device ID privacy | Pseudonymous, not linked to user identity | ACCEPTABLE |
| Event ordering | impression_requested before impression_rendered | CORRECT |
| Local real-API end-to-end | impression ingestion verified in local Postgres | PASS |
| Viewability billing end-to-end | Not yet verified in local smoke | PARTIAL |
