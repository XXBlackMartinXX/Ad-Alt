# Cross-Platform Strategy and Safety Spec

> **Status:** Draft — pre-implementation design document.
> All platform entries marked with a current readiness level.
> Do not claim support for any platform not listed as "MVP ready."

---

## 1. Product Goal

PromptProfit is a privacy-first, opt-in monetization layer for verified AI wait-states.
A "wait-state" is a moment when an AI tool is visibly processing (streaming, loading, thinking)
and the user is not reading or typing — the ideal moment to surface a sponsored message that
does not interrupt the primary workflow.

The goal of cross-platform expansion is to surface sponsored moments across every major AI
environment where wait-states are predictable, detectable without privacy invasion, and
viewable in a clearly labeled, non-intrusive way.

**Expansion must never compromise:**
- User privacy (no prompt text, response text, code, paths, clipboard, DOM text)
- Platform stability (no brittle selectors without fallback, no private APIs)
- Advertiser trust (no fake impressions, accurate viewability, honest fraud scoring)
- User control (opt-in, easy disable, kill-switch support)

---

## 2. Supported Platform Targets

### Priority order for safe implementation:

| # | Platform | Surface | Mechanism | Status |
|---|----------|---------|-----------|--------|
| 1 | VS Code | Status bar | VS Code Extension API | ✅ MVP shipped |
| 2 | Browser mock | Overlay | Browser extension (MV3) | 🔧 Foundation planned |
| 3 | ChatGPT browser | Overlay | Browser extension (MV3) | 🔬 Skeleton only |
| 4 | Claude browser | Overlay | Browser extension (MV3) | 🔬 Skeleton only |
| 5 | Gemini browser | Overlay | Browser extension (MV3) | 🔬 Skeleton only |
| 6 | ChatGPT desktop | System | TBD — research phase | 📋 Research only |
| 7 | Claude desktop | System | TBD — research phase | 📋 Research only |
| 8 | Antigravity | Plugin | Research phase | 📋 Research only |

---

## 3. Adapter Architecture

All platforms implement the `IAdapter` contract (see Phase 2 — `packages/platform-core`).

### Core abstraction layers:

```
┌─────────────────────────────────────────────────────┐
│                    API backend                       │
│  (event ingestion, fraud, ledger, balances, flags)  │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS · privacy-safe event schema
     ┌─────────────┴─────────────┐
     │      Event client          │  (@ad-alt/platform-core)
     │  (queue, retry, dedup)     │
     └─────────────┬─────────────┘
                   │
     ┌─────────────┴─────────────┐
     │   Platform adapter layer   │
     │  (per-platform detection,  │
     │   rendering, viewability)  │
     └─────────────┬─────────────┘
                   │
     ┌─────────────┴─────────────┐
     │  Host environment runtime  │
     │  (VS Code API / Browser    │
     │   DOM / Desktop app)       │
     └────────────────────────────┘
```

### Adapter contract methods:

```typescript
interface IAdapter {
  readonly adapterId: string;         // strict allowlist value
  readonly platformName: string;
  readonly capabilities: PlatformCapabilities;

  canActivate(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;

  // Wait-state lifecycle
  onWaitStateStart(handler: () => void): Disposable;
  onWaitStateEnd(handler: () => void): Disposable;

  // Sponsored moment rendering
  renderSponsoredMoment(moment: SponsoredMoment): Promise<void>;
  removeSponsoredMoment(): Promise<void>;

  // Viewability
  verifyViewability(): Promise<ViewabilityResult>;

  // Status
  getHealth(): AdapterHealth;
}
```

**Hard contract rules:**
- Adapters must NEVER expose or capture: prompt text, response text, source code, file paths, DOM text, clipboard, cookies, auth tokens.
- Adapters must fail closed — no rendering if wait-state cannot be verified.
- Adapters must honor kill switches from feature flags within 5 seconds of flag change.
- All adapter IDs must come from a strict allowlist (`packages/platform-core/src/adapter-ids.ts`).

---

## 4. Privacy Model per Platform

### 4.1 VS Code

**Detection method:** VS Code stable extension APIs only.
- `onDidChangeTextDocument` — typing activity signal (timestamp only, no content)
- `onDidChangeTextEditorSelection` — editing activity signal (timestamp only, no position/content)
- `onDidChangeActiveTerminal` — terminal activity signal (no content)
- Absence of the above for ≥3000ms → wait-state start
- Explicit activity → wait-state end

**What is transmitted:** Event type, timestamps, adapter ID, decision/impression/click IDs, device ID (SHA-256 of random bytes, not hardware fingerprint), extension version, display duration.

**What is NEVER transmitted:** File content, file names, file paths, terminal content, code, editor language, workspace name.

**Risk level: LOW.** VS Code API gives explicit access only to what is requested.

### 4.2 Browser Extension (ChatGPT / Claude / Gemini)

**Detection method:** Structural DOM signals only — no content capture.
- Observe presence/absence of loading/spinner elements using MutationObserver
- Observe structural CSS class changes indicating AI is processing
- Observe specific element visibility (e.g., "stop generating" button)
- NO reading of text nodes, input values, textarea content, or response text

**What is transmitted:** Same safe schema as VS Code. Platform name added.

**What is NEVER transmitted:** Page title, URL path (only origin for platform detection at install time), any text from the page DOM, prompt content, response content.

**Risk level: MEDIUM.** Selectors may break on platform updates. Must fail closed.

### 4.3 Desktop Platforms (ChatGPT, Claude desktop)

**Status:** Research only. No implementation until safe approach confirmed.

Candidate approaches (safe):
- Official plugin/extension mechanisms if available
- Accessibility APIs restricted to known safe signals (not content)

Forbidden approaches:
- Screen scraping
- OCR
- Screenshot capture
- Clipboard monitoring
- Process memory inspection
- UI automation that clicks or types

---

## 5. Allowed Detection Methods

| Method | Allowed | Platforms |
|--------|---------|-----------|
| VS Code stable API event listeners | ✅ | VS Code |
| DOM MutationObserver on structural elements | ✅ | Browser |
| Checking presence of specific CSS classes (no text) | ✅ | Browser |
| IntersectionObserver for viewability | ✅ | Browser |
| Timer-based idle detection (no content) | ✅ | All |
| Official plugin/extension API | ✅ | Desktop (when available) |
| Checking a known public network request (timing only) | ✅ | Browser (structural) |

---

## 6. Forbidden Detection Methods

| Method | Why Forbidden |
|--------|---------------|
| Reading prompt textarea / input content | Privacy — captures user prompts |
| Reading AI response text nodes | Privacy — captures AI output |
| Reading page `document.title` | Privacy — may contain prompt fragments |
| Reading `window.location.href` path | Privacy — may contain conversation IDs |
| Capturing screenshots | Privacy — captures visible content |
| OCR on any surface | Privacy — captures visible content |
| XHR/fetch interception to read request bodies | Privacy — intercepts prompt data |
| XHR/fetch interception to read response bodies | Privacy — intercepts AI output |
| Reading clipboard | Privacy — may contain arbitrary user data |
| Process memory inspection | Privacy + safety |
| Accessibility APIs reading text content | Privacy — reads screen content |
| `window.performance` to infer token count | Privacy — may infer response length |

---

## 7. Viewability Verification Model

A sponsored moment is **viewable** when all of the following hold:
1. The ad element is in the DOM and visible (opacity > 0, display != none)
2. The host environment reports the user is in a wait-state (adapter signal)
3. The ad has been visible for ≥ 3000ms (viewability threshold)
4. No kill-switch flags are active

Verification mechanism per platform:
- **VS Code:** Status bar item is always visible when set; duration tracked by extension timer
- **Browser:** IntersectionObserver with ≥50% threshold + timer; hidden tabs suspended
- **Desktop:** TBD — must be researched per platform

The `displayedDurationMs` and `thresholdMs` fields in the `viewability_threshold_met` event encode the duration locally. The backend verifies the threshold is ≥ 3000ms server-side.

---

## 8. Sponsored Message Rendering Model

### Rendering constraints:

| Constraint | Rule |
|------------|------|
| Labeling | Every sponsored moment MUST be labeled "Sponsored" or similar |
| Placement | Must not overlap primary AI content |
| Size | Non-intrusive; max 1 status-bar line or small overlay |
| Behavior | No auto-play video, no sound, no animation beyond subtle fade |
| Targeting | Based only on platform type and adapter ID — never user content |
| Clearing | Removed immediately on wait-state end or user dismiss |

### Per-platform rendering:

| Platform | Rendering surface | Label |
|----------|------------------|-------|
| VS Code | Status bar item | "Sponsored · {headline}" |
| Browser | Fixed-position overlay (bottom-right or injected container) | "Sponsored" chip |
| Desktop | TBD | TBD |

---

## 9. User Opt-In / Disable Model

| Level | Mechanism | Scope |
|-------|-----------|-------|
| Global opt-in | Developer profile `optedInAt` + consent version | Account-level |
| Per-platform pause | Feature flag per adapter ID | Per-platform |
| Global kill switch | `kill_switch_all_ads` feature flag | All platforms |
| Per-adapter kill switch | `kill_switch_{adapterId}` feature flag | Per-adapter |
| Local disable | Extension settings / browser extension toggle | Device-level |
| Uninstall | Remove extension / browser extension | Permanent |

The extension must check kill-switch flags at startup and on each wait-state start (via `/v1/flags` polling). If the kill switch is active, no ad decision is requested and no ad is rendered.

---

## 10. Platform-Specific Risks

### VS Code
- **Risk:** VS Code updates breaking stable APIs (LOW — stable APIs are versioned)
- **Risk:** User has multiple AI extensions running simultaneously → false wait-state signals (LOW — detection is conservative)
- **Mitigation:** Unit tests for all adapter behaviors; mock adapter for reproducibility

### ChatGPT browser
- **Risk:** OpenAI changes DOM structure → selectors break (HIGH — frequent deploys)
- **Risk:** OpenAI terms of service may restrict automated extensions (MEDIUM)
- **Mitigation:** Centralize selectors with stability-risk comments; fail closed on selector miss; legal review of ToS before shipping

### Claude browser
- **Risk:** Anthropic changes DOM structure (HIGH)
- **Risk:** Anthropic's ToS and policies (MEDIUM — review required)
- **Mitigation:** Same as ChatGPT; additional: only inject into user-consented extension context

### Gemini browser
- **Risk:** Google changes DOM structure (HIGH)
- **Risk:** Google ToS (MEDIUM)
- **Mitigation:** Same as above

### Desktop (ChatGPT, Claude)
- **Risk:** No official extension API available → must use OS-level hooks (HIGH safety risk)
- **Risk:** Any OS-level hook that reads content violates privacy rules
- **Mitigation:** Blocked until official APIs exist or safe approach confirmed

### Antigravity
- **Risk:** Product may not have a public extension mechanism (UNKNOWN)
- **Mitigation:** Research phase; blocked until mechanism confirmed

---

## 11. Terms of Service Risk Assessment

| Platform | ToS Status | Risk | Action Required |
|----------|-----------|------|-----------------|
| VS Code | No marketplace ToS restriction on event listeners | LOW | None |
| ChatGPT browser | OpenAI ToS Section 3 restricts "automated access" — browser extensions used by consenting users are a gray area | MEDIUM | Legal review before shipping |
| Claude browser | Anthropic ToS similar restrictions | MEDIUM | Legal review before shipping |
| Gemini browser | Google ToS, similar concerns | MEDIUM | Legal review before shipping |
| Desktop platforms | No official extension API = uncharted territory | HIGH | Blocked pending research |
| Antigravity | Unknown | HIGH | Blocked pending research |

**Non-negotiable:** Browser platform adapters must clearly disclose to users what signals are observed. The opt-in flow must include a specific statement that no prompt text, response text, or page content is transmitted.

---

## 12. Testing Requirements per Platform

### VS Code (current — must maintain)
- [ ] Adapter starts/stops correctly
- [ ] Wait-state fires after 3000ms idle
- [ ] Wait-state ends on activity
- [ ] Kill switch suppresses ad rendering
- [ ] No forbidden fields in event payload
- [ ] Mock adapter produces deterministic events

### Browser (required before any browser platform ships)
- [ ] Platform detector correctly identifies ChatGPT / Claude / Gemini from URL
- [ ] MutationObserver fires on loading → idle transition
- [ ] MutationObserver does NOT capture any text content
- [ ] IntersectionObserver tracks viewability correctly
- [ ] Kill switch respected within 5s
- [ ] No forbidden fields in any event sent to API
- [ ] Selectors fail gracefully (no exception, no ad shown)
- [ ] Hidden tab suspends wait-state detection
- [ ] Browser extension options page saves/loads API key safely
- [ ] CSP compliance (no eval, no inline scripts)
- [ ] Manifest V3 background service worker lifecycle
- [ ] Extension popup shows opt-in status correctly

### API platform filtering (required before multi-platform events go live)
- [ ] Unknown `adapterId` rejected
- [ ] Disabled platform events rejected
- [ ] Platform kill switch blocks events
- [ ] Platform field does not carry private data
- [ ] Existing VS Code events remain compatible

---

## 13. Rollout Order

```
Phase A (done):     VS Code + API + Web dashboard MVP
Phase B (current):  Shared adapter architecture refactor (non-breaking)
Phase C:            Browser extension foundation (packaged, not published)
Phase D:            API multi-platform hardening
Phase E:            Browser extension beta (ChatGPT, Claude, Gemini — opt-in only)
Phase F:            Desktop platform research complete → decision point
Phase G:            Desktop adapter (only if safe approach found)
Phase H:            Antigravity and other adapters
```

---

## 14. Platform Support Matrix

| Platform | MVP Now | Research Needed | Unsafe/Not Supported | Approach | Privacy Risk | Brittleness | Tests Required |
|----------|---------|----------------|---------------------|----------|-------------|------------|----------------|
| VS Code | ✅ Shipped | — | — | VS Code Extension API | LOW | LOW | ✅ Exists |
| Browser mock | 🔧 Phase C | — | — | MV3 content script, no real platform | NONE | NONE | Phase C |
| ChatGPT browser | 🔬 Skeleton | DOM stability research | — | MV3 content script, structural DOM | LOW | HIGH | Phase C/D |
| Claude browser | 🔬 Skeleton | DOM stability research | — | MV3 content script, structural DOM | LOW | HIGH | Phase C/D |
| Gemini browser | 🔬 Skeleton | DOM stability research | — | MV3 content script, structural DOM | LOW | HIGH | Phase C/D |
| ChatGPT desktop | — | ✅ Required | Screen scraping, OCR | TBD | TBD | TBD | Phase F |
| Claude desktop | — | ✅ Required | Screen scraping, OCR | TBD | TBD | TBD | Phase F |
| Antigravity | — | ✅ Required | Unknown | Plugin API (if exists) | UNKNOWN | UNKNOWN | Phase H |
| Future (Cursor, Windsurf, etc.) | — | Per platform | Per platform | Per platform | Per platform | Per platform | Per platform |

---

*Last updated: 2026-06-29. Review before Phase C implementation.*
