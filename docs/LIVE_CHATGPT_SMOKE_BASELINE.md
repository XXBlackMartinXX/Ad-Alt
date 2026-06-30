# Live ChatGPT Smoke Test — Baseline Verification

This document records the baseline state that was verified before the live
smoke test infrastructure was committed. It serves as a reference: a passing
live smoke run should produce results consistent with this baseline.

---

## Environment

| Item | Baseline |
|------|---------|
| Extension version | 0.0.1 (MV3, unpacked dist-test/) |
| Adapter | ChatGPTAdapter (chatgpt.com / chat.openai.com) |
| Event pipeline | content-script → POST_EVENT → service-worker → POST /v1/events |
| E2E suite (fixture) | 12 passed, 0 skipped, 0 failed |
| Unit tests | All passing |
| TypeScript | 0 errors |
| Build | dist/ and dist-test/ both build clean |
| Lint | 0 errors, 0 warnings |
| VSIX | Packages cleanly (for VS Code extension; unrelated to browser ext) |

---

## Fixture E2E Results (Baseline)

Run with: `pnpm --filter @ad-alt/browser-extension test:e2e`

```
✓ chatgpt-adapter.smoke.spec.ts (N tests)
✓ privacy.smoke.spec.ts (N tests)

12 passed, 0 skipped
```

All privacy event-pipeline tests pass:
- `impression_requested` sent before banner render
- `impression_rendered` sent after banner enters DOM
- `viewability_threshold_met` fires after BILLABLE_DURATION_MS of visibility
- Events contain no forbidden private fields
- Kill-switch prevents all event sending when active
- Missing API URL causes graceful no-op (no events, no crash)

---

## Debug Panel Baseline

`DebugPanelState` unit tests: **16 passed**

Default state:
| Field | Default |
|-------|---------|
| adapterActive | false |
| waitStateDetected | false |
| sponsoredMomentRendered | false |
| lastEventType | null |
| killSwitchEnabled | false |
| apiConfigured | false |

Data attributes emitted by `DebugPanel.mount()`:
- `data-adapter-active`
- `data-wait-state`
- `data-banner-rendered`
- `data-last-event`
- `data-kill-switch`
- `data-api-configured`

Privacy: state keys contain none of the 14 forbidden field names defined in
`apps/browser-extension/src/__tests__/debug-panel.test.ts`.

---

## Event Schema Baseline

Events POSTed to `/v1/events` follow this structure (no private fields):

```json
{
  "eventType": "impression_requested",
  "adDecisionId": "<uuid>",
  "campaignId": "<uuid>",
  "creativeId": "<uuid>",
  "adapterId": "chatgpt",
  "sessionId": "<uuid>",
  "sequenceNumber": 0,
  "timestamp": "<ISO-8601>"
}
```

`viewability_threshold_met` additionally carries:
```json
{
  "durationMs": 1234,
  "thresholdMs": 1000
}
```

**Never present in events:** pageUrl, pageTitle, domText, promptText,
aiResponse, chatHistory, cookies, authToken, sessionCookie.

---

## Known Limitations

1. **Live test requires human interaction** — ChatGPT login cannot be automated.
   See `docs/LIVE_CHATGPT_SMOKE_TEST.md` for the step-by-step checklist.

2. **dist-test/ required for localhost** — Production `dist/` has empty
   `host_permissions` and cannot POST events to a local mock API.
   The live smoke test always loads `dist-test/`.

3. **Mock API has no auth** — The embedded `MockApiServer` accepts all
   `POST /v1/events` requests without an `Authorization` header. The real
   API (run via `pnpm dev:api`) requires a valid bearer token; the DB seed
   does not create one, so `-UseLocalApi` mode may produce 401 errors on
   event POST unless a key is manually seeded.

4. **No screenshots/videos/traces by default** — These are suppressed per
   privacy rules. Pass `-Headed` to observe the browser visually.

---

## Reproduction Steps

To reproduce the baseline E2E results:

```powershell
# Windows
.\scripts\live-chatgpt-smoke.ps1 -UseMockApi -SkipDocker

# macOS / Linux
pwsh scripts/live-chatgpt-smoke.ps1 -UseMockApi -SkipDocker
```

Or directly:
```bash
pnpm --filter @ad-alt/browser-extension test:e2e
```

Expected: **12 passed, 0 skipped, 0 failed**.
