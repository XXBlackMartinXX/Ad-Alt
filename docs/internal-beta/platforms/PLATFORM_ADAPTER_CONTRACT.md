# PromptProfit — Platform Adapter Contract

**Phase:** Multi-Platform Professional Completeness Sprint
**Date:** 2026-07-03

> This contract documents the REAL, currently-implemented `IAdapter`
> interface (`packages/platform-core/src/adapter.types.ts`) — proven
> against the ChatGPT browser adapter, the only platform that has passed
> every requirement below. It supersedes the aspirational interface in
> `docs/CROSS_PLATFORM_STRATEGY.md` §3 where they differ (this one is
> what the code actually implements today).

---

## 1. Platform ID

Every adapter's `adapterId` MUST come from the canonical allowlist in
`packages/shared/src/schemas/adapters.ts` (`ALLOWED_ADAPTER_IDS`). The
API rejects any event whose `adapterName` is not in this list — this is
enforced, not just documented (`EventValidator` / `TelemetryEventSchema`
in `packages/telemetry`). Adding a new platform requires adding its ID to
the relevant group array (`VSCODE_ADAPTER_IDS`, `BROWSER_ADAPTER_IDS`,
`DESKTOP_ADAPTER_IDS`) in that one file — never inline elsewhere.

## 2. Platform detection method

Detection must use only environment-identification signals that do not
require reading page/document content:

- **Browser**: hostname only (`window.location.hostname`), matched
  against a static map — see `detectPlatformFromHostname()` in
  `apps/browser-extension/src/content/platform-detector.ts`. Never reads
  path, query string, or page content.
- **VS Code**: VS Code extension API context (`vscode.window`,
  `vscode.workspace` presence) — no file content inspection.
- **Desktop/terminal** (not yet implemented): MUST use an
  environment-identification signal with equivalent restraint — e.g. a
  process/window title check, never screen-reading or OCR (explicitly
  forbidden by `docs/CROSS_PLATFORM_STRATEGY.md` §10).

## 3. Safe wait-state detection

Must use only **structural** signals — presence/absence of a specific
element (e.g. a "Stop generating" button), never text content:

- Implemented via `MutationObserver` on a per-platform selector list
  (`PROCESSING_SELECTORS` in `apps/browser-extension/src/content/
  wait-state-detector.ts` for the generic path; `chatgpt.wait-state.ts`
  for the ChatGPT-specific, verified path).
- All selectors MUST be wrapped in try/catch; a selector that throws or
  matches nothing must fail closed (no sponsored moment shown), never
  throw an unhandled exception.
- A selector must be **verified against the real live platform** before
  the platform can be marked `verified` or `beta` — an unverified guessed
  selector (like Claude/Gemini's current entries in
  `PROCESSING_SELECTORS`) keeps that platform at `placeholder`.

## 4. Forbidden data fields

No adapter, at any support-status level (including `placeholder` and
`experimental`), may read, capture, store, or transmit:

```
prompt text, response text, chat history, source code, file paths,
file contents, DOM text, page title, full URL (beyond origin at
install-time platform detection), query params, conversation IDs,
cookies, auth tokens, localStorage, sessionStorage, clipboard content,
screenshots, videos, traces, terminal content, private APIs
```

This is the canonical list already enforced by
`packages/platform-core/src/privacy-guard.ts`'s
`TELEMETRY_FORBIDDEN_FIELDS` and cross-checked by
`scripts/check-monetization-privacy.js`. Any new adapter's event
construction must be scanned against this exact list before merge.

## 5. Allowed diagnostic fields

Internal-beta-only diagnostics (never shipped in a production build —
enforced by `scripts/audit-browser-extension-zip.js` Check 3b) may
report only extension-owned boolean/enum state, e.g.:
`extension_loaded`, `platform_detected`, `adapter_active`,
`ad_decision_requested`, `ad_decision_received`, `banner_rendered`,
`banner_visible`, `wait_state_detected`, `kill_switch_active`,
`last_error_code`. See `apps/browser-extension/src/diagnostics/
dryrun-diagnostics.ts` for the full, currently-shipped field set (the
ChatGPT-verified reference implementation).

## 6. Banner/render eligibility

`renderSponsoredMoment()` must NOT be called unless:
1. `canActivate()` returned true for the current environment.
2. The kill switch check (`CHECK_ADAPTER_STATUS`) returned `disabled: false`.
3. A wait-state has genuinely started (verified via the structural
   detector, not assumed).
4. An ad decision was actually received from the backend (or, in
   internal-beta demo mode only, the forced fallback path).

A render must never display content not present in the `SponsoredMoment`
argument (no adapter-side content generation).

## 7. Kill-switch behavior

Every adapter must honor two independent kill-switch layers:
1. **Server-side, per-event** (`isAdapterKillSwitched` in
   `apps/api/src/services/event-processor.ts`) — stops billing
   immediately, cannot be bypassed by any adapter.
2. **Client-side, per-session** (`CHECK_ADAPTER_STATUS` message to the
   service worker before the adapter starts) — the local cache now syncs
   from the backend within 5 minutes via `syncFlagsFromBackend()` (fixed
   in the prior phase; see `docs/internal-beta/monetization/
   KILL_SWITCH_AND_ROLLBACK_REVIEW.md`).

A new adapter must call `CHECK_ADAPTER_STATUS` with its own `adapterId`
before starting, exactly like `chatgpt.ts` does, and must return early
(no rendering) if the response is unreachable (fail closed).

## 8. Monetization event format

Every billable event must validate against `TelemetryEventSchema`
(`packages/telemetry`) and use only the fields already proven safe in
`docs/EVENT_LEDGER_DEDUP_REVIEW.md` §5: `eventId` (client-generated
UUID), `adapterName`, `deviceId` (pseudonymous), `sessionId`,
`sequenceNumber`, `clientTimestamp`, `extensionVersion`, plus
event-type-specific backend-assigned IDs (`adDecisionId`, `campaignId`,
`creativeId`) and structural timing data (`displayedDurationMs`,
`thresholdMs`). No adapter may add a new field without checking it
against `TELEMETRY_FORBIDDEN_FIELDS` first.

## 9. Privacy requirements

Before any platform can move past `placeholder`:
1. A dedicated privacy test file proving forbidden fields are absent
   (pattern: `chatgpt.privacy.test.ts`).
2. A fixture-based e2e smoke test proving no forbidden field appears in
   an actual constructed event or diagnostics payload (pattern:
   `privacy.smoke.spec.ts`).
3. `scripts/check-monetization-privacy.js` passing with the new
   platform's schema/fixture files included in its scan scope.

## 10. Fixture test requirements

A platform cannot be marked `beta` or `verified` without:
1. A fixture HTML page simulating the platform's relevant DOM structure
   (pattern: `apps/browser-extension/e2e/fixtures/`), used instead of
   real login/real platform automation (CANARY 8).
2. Adapter unit tests covering `canActivate`, wait-state start/end,
   render/remove, and kill-switch suppression (pattern:
   `chatgpt.adapter.test.ts`'s 27 cases).
3. Fixture-based e2e smoke tests proving the full pipeline against the
   fixture page (pattern: `chatgpt-adapter.smoke.spec.ts`'s 12+ cases).

## 11. Verification requirements

A platform reaches `verified` only after ALL of:
1. Every item in §9-10 passes.
2. A real, human-operated session against the REAL platform (not a
   fixture) — logged in manually by a human, never automated (CANARY 8)
   — confirms the adapter activates, detects a wait-state, and renders
   correctly, following the same evidentiary standard as
   `docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md`.
3. That real-session evidence is recorded in a dated result log, the same
   way DRYRUN-001 recorded ChatGPT's.

## 12. Support-status labels

| Label | Meaning | Requirements met |
|-------|---------|--------------------|
| `verified` | Proven on the real platform with a dated evidence record | §1-11 all complete, plus a real-session log |
| `beta` | Fixture-tested, privacy-reviewed, pipeline wired, but not yet confirmed on the real live platform | §1-10 complete, §11 item 2-3 pending |
| `experimental` | Adapter code exists and is wired to the pipeline, but tests/privacy review are incomplete | Partial §1-8 |
| `placeholder` | Platform ID reserved and/or detection stub exists, but no working pipeline | Current state of Claude, Gemini, `antigravity`, `copilot_status` |
| `disabled` | Was previously beta/verified but intentionally turned off (e.g. via kill switch) | N/A currently |
| `not supported` | No code exists; requires research or a separate integration model | Codex, Claude Code desktop, Claude Code terminal, generic terminal AI tools |

**No platform may be labeled `verified` in any doc, code comment, or
external communication without a dated real-session evidence record.**
This is enforced by `scripts/check-platform-support-readiness.js`
(Phase 7).

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
