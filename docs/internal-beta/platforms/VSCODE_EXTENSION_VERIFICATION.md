# VS Code Extension — Verification Record

**Phase:** Complete Multi-Platform Support Before Pilot Execution
**Date:** 2026-07-03
**Current support label: `beta`** (unchanged this sprint — see §6)

---

## 1. Current implementation status

`apps/extension` (package name `promptprofit`) is a **real, functioning
VS Code extension**, not a stub or placeholder:

| File | Role |
|------|------|
| `src/extension.ts` | Activation entry point, registers commands |
| `src/controller.ts` | Full lifecycle: sign-in/out, enable/disable, ad-decision request, event enqueue, viewability timer, click handling via server-side redirect, feature-flag refresh with 5-minute cache |
| `src/adapters/ai-status-bar.adapter.ts` | Real wait-state heuristic (see §2) |
| `src/adapters/mock.adapter.ts` | Deterministic test-only adapter |
| `src/status-bar.ts` | Renders the sponsored moment in the VS Code status bar |
| `src/event-queue.ts` | Batches and sends telemetry via `ApiClient` |
| `src/api-client.ts` | Real HTTP client for `/v1/ads/decision`, `/v1/events`, `/v1/flags` |
| `src/device-id.ts` | Pseudonymous device ID persisted in extension storage |

This is functionally further along than Claude/Gemini were before this
sprint — it has a real API client, a real consent dialog
(`CONSENT_TEXT` in `controller.ts`, explicit opt-in, states plainly what
is and is not collected), and a real kill-switch flag cache.

## 2. Exact runtime behavior

`AiStatusBarAdapter` (`src/adapters/ai-status-bar.adapter.ts`):

- Listens to three VS Code lifecycle events:
  `vscode.workspace.onDidChangeTextDocument`,
  `vscode.window.onDidChangeTextEditorSelection`,
  `vscode.window.onDidChangeActiveTerminal`.
- On any of these firing, it records `Date.now()` as `lastActivityAt` and
  ends any in-progress wait-state.
- It schedules a 3-second idle check (`IDLE_THRESHOLD_MS`); if no
  activity event fires within that window, it declares a wait-state
  start. A wait-state auto-ends after 60 seconds (`MAX_WAIT_STATE_MS`)
  if no activity resumes.
- **This is a coarse idle-timer heuristic, not a true "AI is generating"
  signal.** It cannot distinguish "the user is thinking" from "an AI tool
  is generating a response" — both look identical to this adapter (no
  activity for 3+ seconds). This is architecturally different from the
  browser adapters, which detect a genuine structural DOM signal (a
  "Stop generating" button appearing). VS Code has no equivalent
  first-party signal exposed by GitHub Copilot or other AI extensions
  today, which is why this heuristic exists.

## 3. Can it render sponsored wait-state UX safely?

Yes — `AdStatusBar` (`src/status-bar.ts`) renders into VS Code's native
status bar, a UI surface with no access to editor/terminal content. The
extension never reads file content, terminal buffer content, or any AI
extension's output; it only reacts to lifecycle event *firing*, never
event *payloads*.

## 4. Can it detect safe wait states without reading code, prompts, terminal content, or private files?

Yes — by construction, none of the three subscribed VS Code events (`onDidChangeTextDocument`, `onDidChangeTextEditorSelection`, `onDidChangeActiveTerminal`) are read for their content in this adapter; only their *firing* is observed, exactly matching the browser-extension's "structural presence, never text content" privacy pattern.

## 5. Test coverage

`pnpm --filter promptprofit test:unit` (run from `apps/extension`):

- `src/__tests__/privacy.test.ts` — 26 tests.
- `src/__tests__/event-queue.test.ts` — 8 tests.
- **Total: 34 tests, all passing.**

**Gap:** No end-to-end test exists that actually launches a real VS Code
extension host and confirms `AiStatusBarAdapter` fires correctly against
real editor events. The browser-extension has Playwright +
`chromium.launchPersistentContext()` for this; VS Code's equivalent is
`@vscode/test-electron`, which is **not currently a dependency** of
`apps/extension`. Adding it is a real, non-trivial effort (spinning up a
downloaded VS Code test instance) and is explicitly out of scope for this
sprint (mission Phase 4 says "verify VS Code extension support separately
if existing code allows it" — the existing code does not include this
harness, so this sprint documents the gap rather than building new
test infrastructure for it).

## 6. Blockers

1. No `@vscode/test-electron` (or equivalent) e2e harness exists to prove
   `AiStatusBarAdapter` behaves correctly inside a real running VS Code
   window — only unit-level mocked-`vscode`-module tests exist.
2. No human-operated live-session record (a DRYRUN-001 equivalent for VS
   Code) exists proving the status bar actually renders correctly during
   a real coding session with a real AI extension active.
3. The idle-timer heuristic's false-positive rate (declaring a wait-state
   during ordinary human thinking pauses, not AI generation) has not been
   measured against real usage.

None of these blockers are privacy blockers — they are reliability/UX
verification gaps. The privacy model itself (§4) is sound and already
proven at the unit level.

## 7. Support label

**Support label: `beta`** — unchanged from the existing
`PLATFORM_SUPPORT_MATRIX.md` entry ("implemented, not DRYRUN-verified").
This sprint did not change any `apps/extension` code; it only produced
this dedicated verification record confirming the existing label is
still accurate and documenting exactly what would be required to reach
`verified` (§6). VS Code is **not** claimed as `verified` — no e2e
harness and no live-session record exist.

---

**Privacy warning: Do not add real editor content, real AI
prompt/response text, real user data, real API keys, or real payment
credentials to this document.**
