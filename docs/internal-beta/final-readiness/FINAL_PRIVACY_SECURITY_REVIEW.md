# Final Privacy and Security Review

**Phase:** Final Internal Pilot Release-Readiness Consolidation
**Date:** 2026-07-03

> This is a final, consolidated review across every surface this repo
> collects data from — not a re-derivation of prior reviews. It
> references and re-verifies `MONETIZATION_PRIVACY_REVIEW.md` and
> `KILL_SWITCH_AND_ROLLBACK_REVIEW.md` (both pre-existing) rather than
> duplicating them, and adds explicit coverage for surfaces added in
> later sprints (Claude/Gemini adapters, the live-verification workflow,
> VS Code's hardened test suite, and the terminal fixture-only
> prototype) that postdate those two documents.

---

## 1. Extension telemetry (ChatGPT / Claude / Gemini)

Reviewed: `ad-event-sender.ts`, and each adapter's event-construction
path. Every event contains only backend-assigned IDs
(`adDecisionId`/`campaignId`/`creativeId`), extension-internal metadata
(`deviceId`, `sessionId`, `sequenceNumber`, `clientTimestamp`,
`extensionVersion`), and structural timing (`displayedDurationMs`,
`thresholdMs`). Confirmed by `chatgpt.privacy.test.ts` (15 tests),
`claude.privacy.test.ts` (15 tests), `gemini.privacy.test.ts` (15
tests), and the embedded forbidden-fields checks inside each platform's
`*-adapter.smoke.spec.ts`. **Finding: none.**

## 2. Platform diagnostics (debug panel / dry-run diagnostics)

`debug-panel.ts`'s `#promptprofit-debug-panel` and
`dryrun-diagnostics.ts`'s diagnostics panel both expose only
boolean/enum extension-internal state (`adapterActive`,
`waitStateDetected`, `sponsoredMomentRendered`, `killSwitchEnabled`,
`lastErrorCode`, etc.) — confirmed by
`dryrun-diagnostics.test.ts` (36 tests) and the dedicated
`diagnostic panel attributes contain no forbidden data` e2e test.
**Finding: none.**

## 3. Billing events

`apps/api`'s event-processing path (`event-processor.ts`) validates
every incoming event against `TelemetryEventSchema`
(`packages/telemetry`), which rejects any forbidden field before
persistence. Confirmed by `check:monetization:privacy`'s schema/fixture
scan (12 schema files + 13 mock/fixture files, 0 forbidden keys) and
`apps/api`'s own event tests. **Finding: none.**

## 4. Ledger reports

`LEDGER_CONFIDENCE_REPORT.md` and `PAYOUT_SIMULATION_REPORT.md` use only
synthetic, hardcoded developer/advertiser IDs and dollar amounts — no
real account data of any kind. Confirmed by
`check:monetization:privacy`'s "Generated billing/ledger/payout reports"
scan (3 reports, 0 forbidden keys). **Finding: none.**

## 5. Claude/Gemini live-verification workflow

Reviewed `LIVE_VERIFICATION_SAFETY_POLICY.md` and all four runbooks/
templates. The workflow:
- Never automates login, CAPTCHA solving, or prompt entry (enforced by
  being 100%-human-driven at the assisted tier, and by the no-login
  launcher script never clicking through any page element after launch).
- Only ever records: platform ID, origin (not full URL), extension
  version/commit, boolean adapter/wait-state/banner/kill-switch state,
  and enum result labels.
- `scripts/launch-no-login-live-smoke.js` uses a fresh, disposable
  Chrome profile (never a reused real profile) and deletes it after the
  session.
- Explicitly disclaims zero account/IP-ban risk (§7 of the safety
  policy) rather than overclaiming safety.
**Finding: none.** (No result logs exist yet — this is expected; see
`FINAL_RISK_REGISTER.md`.)

## 6. VS Code extension behavior

Reviewed `ai-status-bar.adapter.ts`, `controller.ts`, and all 82 unit
tests (up from 34). The idle-timer heuristic reacts only to event
*firing* (`onDidChangeTextDocument`/`onDidChangeTextEditorSelection`/
`onDidChangeActiveTerminal`), never event *payload* — verified
explicitly by a dedicated test asserting the adapter's own
`WaitStateEvent` contains only `{ startedAt, adapterName }`. The kill-
switch/disable bug found and fixed this consolidation's predecessor
sprint (a phantom timer that could render an ad after `disable()`) was
re-confirmed fixed by re-running the full VS Code unit suite fresh in
this sprint (82/82 passing). **Finding: none remaining** (the one real
issue found was already fixed before this review).

## 7. Terminal prototype behavior

Reviewed `scripts/lib/terminal-fixture.js`. Statically confirmed (by
`check:terminal-prototype`'s source scan, re-run fresh this sprint) to
never `require('child_process')`/`http`/`https`/`net`, and to never use
any of the 19 terminal/browser forbidden field names as an object key.
All timestamps/durations are hardcoded fixture constants. **Finding:
none.**

## 8. Generated docs and templates

Scanned every file in `docs/internal-beta/platforms/` and
`docs/internal-beta/final-readiness/` (this sprint's new docs included)
for forbidden field names as data/schema keys and for overclaiming
phrases — same scan `check:platform-certification` and
`check:nonbrowser-platforms` already run fresh on every invocation.
**Finding: none.**

## 9. Confirmations

| Requirement | Confirmed |
|---|---|
| No prompt/response/chat capture | Yes — §1, §5 |
| No DOM/page text capture | Yes — §1, §2, §5 |
| No terminal command/output capture | Yes — §7 |
| No cookies/tokens/storage capture | Yes — §1, §5 (extension only ever reads its own `chrome.storage.local` keys) |
| No screenshots/videos/traces requirement | Yes — every runbook explicitly forbids them |
| No private account data stored | Yes — device IDs are `crypto.randomBytes`-derived, never hostname/username/machine-ID-derived (`device-id.ts` in both `apps/browser-extension` and `apps/extension`) |
| No real payment credentials stored | Yes — no payment processor integrated anywhere (`MONETIZATION_SOURCE_AUDIT.md` Q18) |
| No API key leaks | Yes — `check:secrets:local`, 0 leaks across 491 scanned files |
| Kill-switch behavior documented | Yes — `KILL_SWITCH_AND_ROLLBACK_REVIEW.md` (server + client, ChatGPT), mirrored for Claude/Gemini/VS Code in their respective adapter/controller code and this sprint's VS Code test suite |

## 10. Findings register

| # | Finding | Severity | Status |
|---|---|---|---|
| — | None found this sprint | — | — |

No S0, S1, S2, or S3 issues were identified in this final review. The
one real defect found in this consolidation effort (the VS Code
phantom-timer kill-switch bug) was found and fixed in the immediately
preceding sprint, not this one — it is referenced here as already
resolved, not as an open item.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
