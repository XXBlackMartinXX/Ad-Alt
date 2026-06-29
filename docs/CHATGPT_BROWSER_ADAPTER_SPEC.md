# ChatGPT Browser Adapter — Implementation Specification

**Product:** PromptProfit  
**Version:** 0.1.0-mvp  
**Status:** Implemented — unit-tested, not yet manually verified in browser  
**Author:** Claude (clean-room implementation, no third-party code)

---

## 1. Scope

This spec covers the first real browser-platform MVP: ChatGPT browser support only.
Claude.ai and Gemini adapters are **not** implemented in this release; their adapter
IDs exist in the allowlist but the adapters themselves are unimplemented stubs.

---

## 2. Activation conditions

The ChatGPT adapter (`browser_chatgpt`) activates **only** when:

1. The extension is installed and enabled in the browser.
2. The active tab's hostname is exactly `chatgpt.com` OR `chat.openai.com`.
3. The service-worker kill-switch check returns `disabled: false` for `browser_chatgpt`.
4. The `isValidFeatureFlags()` guard has returned valid flags (fresh install defaults
   to `FALLBACK_FLAGS_DISABLED`, which disables all adapters).

If any condition fails, the content script exits immediately with no DOM interaction.

---

## 3. Allowed signals

The adapter uses **only** the following signals to detect wait-states:

| Signal | Value read | Privacy risk |
|---|---|---|
| `[data-testid='stop-button']` presence/absence | Boolean (element exists?) | None — no content read |
| `button[aria-label='Stop generating']` presence/absence | Boolean (element exists?) | None — no content read |

No other DOM signals are used. Specifically, the following are **never** read:

- `textContent`, `innerText`, `value`, `innerHTML` on any element
- Input field values (the user's prompt)
- AI response text or streaming content
- Page title (`document.title`)
- URL path or query string (only the hostname is used, at activation time)
- Cookies, `localStorage`, `sessionStorage`
- Network requests or responses
- Page screenshots or canvas content

---

## 4. Selector stability contract

All selectors are defined in `apps/browser-extension/src/adapters/chatgpt/chatgpt.selectors.ts`.

Every selector has a stability-risk comment:

```
"[data-testid='stop-button']"          // STABILITY RISK (high): OpenAI may rename test IDs
"button[aria-label='Stop generating']" // STABILITY RISK (medium): aria-label may change
```

If a selector stops matching, the wait-state detector fires neither `onWaitStateStart`
nor `onWaitStateEnd` — detection fails closed (no sponsored moment shown, no error).

---

## 5. Wait-state detection

**File:** `apps/browser-extension/src/adapters/chatgpt/chatgpt.wait-state.ts`

- Uses `MutationObserver` with `{ childList: true, subtree: true }` on `document.body`.
- `attributes: false` — only element presence changes trigger a check.
- 150 ms leading-edge throttle: multiple rapid DOM mutations collapse to one check.
- If `MutationObserver` is unavailable or `document.body` is null, the detector is a
  no-op (fails closed).
- DOM queries are wrapped in `try/catch`; any error fails closed.

**State machine:**

```
IDLE ──(stop-button appears)──► WAIT_STATE_ACTIVE ──(stop-button gone)──► IDLE
         fires onWaitStateStart                          fires onWaitStateEnd
```

---

## 6. Sponsored moment rendering

**File:** `apps/browser-extension/src/adapters/chatgpt/chatgpt.renderer.ts`

### Position

Fixed position, bottom-right of the viewport:
```
position: fixed; bottom: 90px; right: 16px; width: 284px;
```

The 90 px bottom offset clears ChatGPT's prompt input bar (~70 px) plus breathing room.

### Content (all from backend, never from DOM)

| Field | Max length | Display |
|---|---|---|
| `headline` | 80 chars | Bold, 14 px |
| `body` (optional) | 140 chars | Body text, 13 px |
| `displayUrl` | — | Green, 12 px |

### Required UI elements

1. **"PromptProfit · Sponsored" label** — 10 px, uppercase, always visible.
2. **Close button** — `aria-label="Dismiss sponsored moment"`, top-right corner.
   Click immediately calls `renderer.remove()`.
3. All other controls (prompt input, response area, nav, settings) remain fully
   accessible; the banner does not overlap them.

### Expiry guard

`expiresAt` is checked at render time. An expired moment is silently not rendered.

### Safety guards

- `headline.length > 80` → not rendered
- `body.length > 140` → not rendered
- `!moment.displayUrl` → not rendered
- `Date.now() > moment.expiresAt` → not rendered
- `typeof document === 'undefined'` → not rendered (SSR-safe)

### Inline styles

All styles are applied as `element.style.cssText` to avoid interfering with
ChatGPT's own CSS classes, which may change in any release.

---

## 7. Viewability tracking

**File:** `apps/browser-extension/src/adapters/chatgpt/chatgpt.adapter.ts` (`verifyViewability`)

The `verifyViewability()` method returns:
- `{ isViewable: false, notViewableReason: 'no_element' }` — when no sponsored moment
  is currently rendered.
- `{ isViewable: true, visibleDurationMs: 0 }` — when the element exists (element
  presence is a conservative proxy; real duration is tracked by `ViewabilityObserver`
  in the content script integration layer).

The `ViewabilityObserver` (IntersectionObserver-based, ≥50% intersection for ≥5 s)
is wired in Phase 4 (content script integration), not in the adapter itself.

---

## 8. Kill-switch behavior

| Condition | Adapter behavior |
|---|---|
| `killSwitchEnabled: true` | Content script exits before adapter is created |
| `disabledAdapters: ['browser_chatgpt']` | Same as above |
| `flags.kill_switch_browser_chatgpt: true` | Same as above |
| Adapter not yet `start()`ed | `renderSponsoredMoment()` is a no-op |
| `stop()` called | All handlers cleared, renderer removes element |

Dedup key is written to DB on the kill-switch path in the API event-processor so
disabled events cannot be replayed as billable if the kill switch is later lifted.

---

## 9. Telemetry events

Events sent by the content script through the service-worker:

| Event type | When fired | Adapter name |
|---|---|---|
| `impression_requested` | Wait-state detected + ad decision returned | `browser_chatgpt` |
| `impression_shown` | Sponsored moment rendered in DOM | `browser_chatgpt` |
| `impression_viewed` | ≥50% visible for ≥5 s (ViewabilityObserver) | `browser_chatgpt` |
| `impression_clicked` | User clicks the displayUrl area | `browser_chatgpt` |
| `impression_dismissed` | User clicks the close button | `browser_chatgpt` |

All events are validated by `TelemetryEventSchema` (Zod, strict mode). Forbidden
fields (`pageUrl`, `domText`, etc.) cause schema rejection.

---

## 10. Privacy compliance checklist

- [ ] No `textContent`/`innerText` read anywhere in the adapter
- [ ] No URL path/query read (only hostname at activation time)
- [ ] No cookies, localStorage, or sessionStorage accessed
- [ ] No network requests inspected
- [ ] All telemetry fields come from backend (adDecisionId, campaignId, creativeId)
      or from local state (deviceId, sessionId, timestamp, sequenceNumber)
- [ ] `validateBrowserEvent()` called before any event is dispatched
- [ ] `TelemetryEventSchema` parsed before any event is stored

---

## 11. Files delivered

```
apps/browser-extension/src/adapters/chatgpt/
├── chatgpt.selectors.ts          Centralized selectors + hostname list
├── chatgpt.wait-state.ts         MutationObserver-based detector
├── chatgpt.renderer.ts           Fixed-position DOM renderer
├── chatgpt.adapter.ts            IAdapter implementation (deps-injectable)
└── __tests__/
    ├── chatgpt.adapter.test.ts   42 tests: lifecycle, hostname, handlers, health,
    │                             rendering, viewability
    └── chatgpt.privacy.test.ts   15 tests: forbidden fields, schema enforcement
```

---

## 12. Not yet verified (manual smoke test required)

The adapter has been unit-tested in a Node.js vitest environment with mocked DOM
dependencies. It has **not** been manually verified in a real Chrome browser against
live ChatGPT. Per the evidence rule:

> "Do not claim ChatGPT browser support unless extension builds, unit tests pass, can
> be loaded unpacked, manual smoke instructions exist, ChatGPT adapter is exercised
> or clearly marked 'not manually verified'."

Manual verification instructions are in `docs/CHATGPT_BROWSER_LOCAL_SMOKE_TEST.md`.

**Status:** NOT manually verified. ChatGPT browser support is marked "alpha/experimental"
in the README until manual verification is complete.
