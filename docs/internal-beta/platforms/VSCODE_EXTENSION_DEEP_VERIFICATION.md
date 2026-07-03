# VS Code Extension — Deep Verification

**Phase:** Nonbrowser Platform Readiness
**Date:** 2026-07-03
**Current support label: `beta`** (unchanged by this document — see §12)

> This supersedes `VSCODE_EXTENSION_VERIFICATION.md`'s summary with a
> file-by-file audit and closes the test-coverage gap that doc flagged.
> It does not change VS Code's support label — that still requires a
> real e2e host harness and a human-operated live session, neither of
> which exist yet.

---

## 1. Actual implementation files

`apps/extension/` (package name `promptprofit`):

| File | Lines | Role |
|------|-------|------|
| `src/extension.ts` | 23 | Activation entry point; wires 5 commands to `PromptProfitController` |
| `src/controller.ts` | 354 | Full lifecycle orchestrator: sign-in/out, enable/disable, ad-decision request, event construction, viewability timer, click handling, feature-flag refresh/cache |
| `src/adapters/ai-status-bar.adapter.ts` | 108 | Real wait-state heuristic (idle-timer based) |
| `src/adapters/mock.adapter.ts` | 54 | Deterministic test-only adapter (fires a synthetic wait-state every `cycleMs`, default 15s, ending after 8s) |
| `src/adapters/types.ts` | 15 | `IWaitStateAdapter` interface + `WaitStateEvent` type |
| `src/status-bar.ts` | 58 | `AdStatusBar` — renders into VS Code's native status bar |
| `src/event-queue.ts` | 66 | Debounced batch sender with exponential-backoff retry (max 3 attempts) |
| `src/api-client.ts` | 86 | Real HTTP client: `GET /v1/flags`, `GET /v1/ads/decision`, `POST /v1/events` |
| `src/device-id.ts` | 17 | Pseudonymous device ID (`dev_` + SHA-256 of random bytes), persisted in `context.secrets` |

This is a real, wired MVP — not a stub. Every file above is exercised by
the production `activate()` path in `extension.ts`, not dead code.

## 2. Current runtime behavior

On activation, `PromptProfitController.initialize()`:
1. Reads `promptprofit.apiUrl` config (default `https://api.promptprofit.dev`).
2. Gets/creates a pseudonymous device ID via `context.secrets`.
3. Reads a stored API key from `context.secrets` (`promptprofit.apiKey`).
4. Registers the internal `promptprofit._handleAdClick` command.
5. Refreshes feature flags (5-minute cache, `context.globalState`).
6. If kill-switched, shows an informational message and stops — no
   adapter is started.
7. If `promptprofit.enabled` is `true` AND an API key exists, starts the
   configured adapter (`ai_status_bar` by default, or `mock`).

`enable()` shows an explicit, plain-language consent dialog
(`CONSENT_TEXT` in `controller.ts`) before turning anything on — this is
a real, human-readable opt-in gate, not a silent default-on.

## 3. Can it render a sponsored wait-state UX?

Yes — into the VS Code status bar (`AdStatusBar`, `src/status-bar.ts`),
via `vscode.window.createStatusBarItem`. There is no "banner" concept in
VS Code the way there is in a browser DOM; the status bar item is the
platform-appropriate equivalent, and `PLATFORM_ADAPTER_CONTRACT.md`
already treats "VS Code status bar" and "browser banner" as the same
kind of surface for different platform categories.

## 4. Idle-timer heuristic, not real wait-state detection

`AiStatusBarAdapter` (the default, non-mock adapter) does **not** detect
"an AI tool is generating a response." It detects "no editor/selection/
terminal-focus activity occurred for 3 seconds" (`IDLE_THRESHOLD_MS`),
and ends that state either on the next activity event or after 60
seconds (`MAX_WAIT_STATE_MS`), whichever comes first.

This is architecturally different from every browser adapter
(ChatGPT/Claude/Gemini), which detect a genuine structural DOM signal (a
"Stop generating" button's presence). VS Code exposes no equivalent
first-party "an AI extension is currently generating" event today, so
this coarse heuristic is what exists. It will produce false positives
(ordinary human thinking pauses look identical to "AI is generating" to
this adapter) — this is a real product-accuracy limitation, not a
privacy issue (see §6).

## 5. Real API or local mock?

**Real API**, when configured. `ApiClient` calls whatever URL is in the
`promptprofit.apiUrl` setting (default `https://api.promptprofit.dev`) —
there is no local-mock-only mode built into the shipped extension. The
`mock` adapter (`MockAdapter`) only replaces the *wait-state detection*
input with a synthetic timer; it still drives the exact same
`ApiClient.requestAd()`/`sendEvent()` real-network calls as the
`ai_status_bar` adapter would. There is currently no way to exercise the
full pipeline against a local mock API server the way the browser
extension's Playwright suite does (`MockApiServer` in
`apps/browser-extension/e2e/mock-api-server.ts`) — this is the root
cause of the e2e-harness gap in §10.

## 6. Privacy model

Sound by construction, now proven at the unit level for the adapter
itself (see §8, new this sprint):

- `AiStatusBarAdapter` subscribes to `vscode.workspace.onDidChangeTextDocument`,
  `vscode.window.onDidChangeTextEditorSelection`, and
  `vscode.window.onDidChangeActiveTerminal` — but reads **none** of
  their event payloads. Each handler is a zero-argument callback
  (`() => { ... }`); the adapter never inspects `TextDocumentChangeEvent`,
  `TextEditorSelectionChangeEvent`, or `Terminal` object contents. Only
  the fact that *an* event fired is used, to reset an idle timer.
- `device-id.ts` derives the device ID from `crypto.randomBytes` only —
  never from hostname, username, machine ID, or any other identifiable
  source.
- `controller.ts` constructs every outbound event from only
  backend-assigned IDs (`adDecisionId`, `campaignId`, `creativeId`) and
  extension-internal metadata (`deviceId`, `sessionId`,
  `extensionVersion`, `sequenceNumber`, `clientTimestamp`) — never from
  `vscode.window.activeTextEditor`, workspace folders, or any document
  content.
- Click-through uses a server-side redirect
  (`${apiUrl}/v1/ads/click/${adDecisionId}`) so the raw destination URL
  is never exposed to the client — same pattern as the browser adapters.

## 7. Forbidden-data risks

None identified in the current code. The one residual risk is
*process*, not code: because `AiStatusBarAdapter` fires on ANY editor/
terminal-focus activity, a future maintainer could be tempted to "just
peek at the active editor's language ID for better targeting" or
similar — the existing privacy tests (§8) exist specifically to catch
that kind of scope creep before it ships, the same role
`chatgpt.privacy.test.ts` plays for the browser extension.

## 8. Tests present (this sprint added the adapter/controller-level tests; see `VSCODE_EXTENSION_VERIFICATION.md` for what pre-existed)

Pre-existing (unchanged):
- `src/__tests__/privacy.test.ts` — 26 tests, payload-shape mirror tests.
- `src/__tests__/event-queue.test.ts` — 8 tests, retry/backoff/dedupe logic.

New this sprint (see `VSCODE_EXTENSION_DEEP_VERIFICATION.md` §2 in
`check:vscode-extension`'s summary for the live count):
- `src/adapters/__tests__/ai-status-bar.adapter.test.ts` — exercises the
  **real** `AiStatusBarAdapter` class (not a mirror) via a hand-written
  `vscode` module mock (`src/__tests__/test-utils/vscode-mock.ts`,
  aliased in `vitest.config.ts`), covering: activation, the 3s idle
  threshold firing a wait-state start, the 60s max-duration auto-end,
  any-activity-ends-wait-state, deactivation/dispose cleanup, and an
  explicit assertion that the adapter's `WaitStateEvent` payload contains
  only `{ startedAt, adapterName }` — nothing from the triggering
  editor/selection/terminal event.
- `src/adapters/__tests__/mock.adapter.test.ts` — the same treatment for
  `MockAdapter`.
- `src/__tests__/status-bar.test.ts` — `AdStatusBar`'s rendered text/
  tooltip/command wiring for `showAd`/`showSignedOut`/`showEarning`/
  `hide`, confirming only the passed-in `AdInfo` fields are rendered
  (never file/workspace data) and that `showEarning`'s 3-second auto-hide
  fires.
- `src/__tests__/api-client.test.ts` — `ApiClient`'s real request shape:
  `requestAd` sends only `deviceId`/`adapterName`/`extensionVersion` as
  query params and an `Authorization: Bearer` header, never any other
  field; `sendEvent`/`getFlags` behave the same way; all three fail
  closed (return `null`/no-op) on network error, non-2xx, or missing API
  key.
- `src/__tests__/controller.test.ts` — the real `PromptProfitController`
  via the same `vscode` mock plus a fake `ApiClient`, covering: the
  kill-switch path in `initialize()` (adapter never starts when
  kill-switched), `enable()`/`disable()` toggling the adapter and the
  `promptprofit.enabled` setting, and that every event the controller
  enqueues (`impression_requested`/`impression_rendered`/
  `viewability_threshold_met`/`click`) matches exactly the same
  allowed-keys whitelist `privacy.test.ts` already defines — now proven
  against the real code path, not a hand-built mirror.

## 9. Tests still missing

- No test exercises `extension.ts`'s `activate()`/`deactivate()`
  themselves (would require a fuller `vscode.ExtensionContext` mock plus
  asserting all 5 commands register) — a real but lower-value gap, since
  `controller.ts`'s own methods (which those commands merely forward to)
  are now directly tested.
- No test for `device-id.ts` beyond the format assertions already in
  `privacy.test.ts` (its `context.secrets` persistence round-trip is
  untested at the unit level).
- No test proves the sign-in dialog flow end-to-end (API key entry via
  `showInputBox`, storing it, then a subsequent `enable()` succeeding) —
  partially covered by the new controller tests' kill-switch/toggle
  coverage, but the sign-in-specific `showInputBox` validation logic
  (`v.length < 10 ? "Key looks too short" : undefined`) is not directly
  unit-tested.

## 10. E2E gaps

No `@vscode/test-electron` (or equivalent) harness exists — every test
above runs against a hand-written `vscode` module mock in a plain Node
environment, not a real running VS Code extension host. This means:
none of the above tests can catch a real VS Code API behaving
differently than this repo's mock assumes (e.g. if `onDidChangeActiveTerminal`
ever fired with different timing or arguments in a real host). Building
a real e2e harness is a genuinely separate, larger effort (downloading
and driving a real VS Code test instance) and is not attempted this
sprint — see `check:vscode-extension`'s explicit `HOLD` for this exact
gap rather than a false `PASS`.

## 11. Manual verification gaps

No human-operated live session inside a real VS Code window has been
recorded (no DRYRUN-001 equivalent for VS Code). `VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`
(new this sprint) defines exactly how to do this safely, using only a
synthetic/sample workspace and sanitized extension-owned diagnostics
(the status bar item's rendered state) — never real project code,
prompts, or terminal output.

## 12. Support label

**`beta`** — unchanged. This sprint closed the "activation and wait-state
detection are completely untested at the unit level" gap (§8-9), and
added a safe manual verification runbook (§11), but neither of those
closes the two remaining structural gaps for `verified`: a real e2e host
harness (§10) and a human-operated live-session record (§11). Per
`PLATFORM_ADAPTER_CONTRACT.md` §12, `beta` is exactly the correct label
for "fixture/unit-tested, privacy-reviewed, pipeline wired, but not
confirmed on the real live platform."

---

**Privacy warning: Do not add real editor/workspace content, real AI
prompt/response text, real user data, real API keys, or real payment
credentials to this document.**
