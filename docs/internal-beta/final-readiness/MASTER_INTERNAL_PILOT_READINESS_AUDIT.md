# Master Internal Pilot Readiness Audit

**Phase:** Final Internal Pilot Release-Readiness Consolidation, Hardening, and Review
**Date:** 2026-07-03
**Branch:** `claude/windows-release-pipeline-fix-xfj0sw`
**Baseline commit:** `b549a8f` (this sprint continues from it)

> This is a consolidation and hardening pass, not a feature sprint. No
> support label in this document changes unless new evidence in this repo
> justifies the change. Read this alongside
> `FINAL_PLATFORM_STATUS_FREEZE.md` (per-platform detail),
> `PILOT_EXECUTION_PACKET_REVIEW.md` (pilot docs review),
> `FINAL_PRIVACY_SECURITY_REVIEW.md`, `FINAL_BILLING_LEDGER_REVIEW.md`,
> `FINAL_RISK_REGISTER.md`, and `GO_NO_GO_FINAL_INTERNAL_PILOT.md`.

---

## 1. Executive summary

PromptProfit's ChatGPT browser extension has a real, tested, privacy-
reviewed monetization pipeline and is the one platform this repo can
honestly call **verified**. Everything needed to run one tiny, founder-
operated, ChatGPT-only controlled revenue pilot exists and passes fresh
verification today: the extension, the ledger/billing math, the
kill-switch, the manual-revenue-recording process, and the rollback
plan. Nothing about this pilot requires new code.

Separately, and without blocking or being blocked by that pilot, this
repo has also built genuine (not fake) `beta`-level support for Claude
and Gemini browser adapters and hardened the VS Code extension — both
fixture/unit-tested and privacy-reviewed, neither human-live-verified.
Terminal, Claude Code, and Codex remain correctly unimplemented beyond a
tool-agnostic fixture-only architecture prototype. None of this
secondary work is enabled for real users, and none of it is part of the
pilot's scope.

Public release, production readiness, and real payout execution all
remain — correctly and deliberately — blocked. Nothing in this
consolidation sprint attempts to unblock any of them.

## 2. Current verified platform status

| Platform | Status |
|---|---|
| ChatGPT browser | **verified** — full pipeline, 42 unit + 27 e2e tests, real ledger writes confirmed, both kill-switch layers confirmed |

This is the only platform this repo may honestly call `verified`
anywhere (`scripts/check-platform-support-readiness.js` enforces this
mechanically, not just by convention).

## 3. Current beta platform status

| Platform | Status | Why not verified |
|---|---|---|
| Claude browser | `beta` | Fixture-tested (25 unit + 15 privacy + 7 e2e), live-wired into the shipped content script, kill-switch-capable — but no human-operated live session against real claude.ai exists |
| Gemini browser | `beta` | Same shape as Claude, built from scratch this multi-sprint effort — no human-operated live session against real gemini.google.com exists |
| VS Code extension | `beta` | Real idle-timer wait-state heuristic (not a stub), 82 unit tests (up from 34 after this consolidation's predecessor sprint) covering activation/wait-state/status-bar/API-client/controller/kill-switch — but no real `@vscode/test-electron`-style e2e harness and no human-operated live session exist |

Live verification for Claude/Gemini is **intentionally deferred** by
explicit user decision in a prior sprint — this is not a technical
blocker and is not being chased in this consolidation pass (CANARY 7).

## 4. Fixture-only / experimental status

| Item | Status |
|---|---|
| Claude Code terminal (architecture prototype) | `fixture-only` — `scripts/lib/terminal-fixture.js` proves the safe lifecycle-only pattern with zero real process/command/output access; 14 unit tests |
| Generic terminal AI tools (architecture prototype) | `fixture-only` / `experimental` — same prototype, intentionally tool-agnostic |

## 5. Unsupported / separate-integration status

| Platform | Status |
|---|---|
| Claude Code terminal (real product) | `requires separate integration` — no safe stdio-passthrough wrapper built; explicitly decided not to build one this sprint (see `TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` §6) |
| Claude Code desktop | `requires separate integration` — no safe integration point known (no confirmed extension/plugin API) |
| Codex CLI | `requires separate integration` — same reasoning as Claude Code terminal |
| Codex IDE/editor | `requires separate integration` — unresearched product surface |

None of these are supported, and none of this repo's documentation
claims otherwise (mechanically enforced by
`scripts/check-nonbrowser-platform-readiness.js`).

## 6. Revenue pilot status

`check:revenue-pilot` passes fresh, every time this was re-verified in
this sprint. The pilot's own criteria doc
(`docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md`)
and go/no-go record
(`docs/internal-beta/revenue-pilot/GO_NO_GO_CONTROLLED_REVENUE_PILOT.md`)
were reviewed this sprint (see `PILOT_EXECUTION_PACKET_REVIEW.md`) and
found sound, with one stale phrase corrected (the "forbidden actions"
list previously read as if Claude/Gemini/VS Code code must not exist at
all, which is no longer true now that beta, kill-switch-disabled code
for them exists from separate sprints — the fix clarifies that
*enabling* any of them for real users during this pilot is what remains
forbidden, not the mere existence of that unrelated code).

## 7. Billing/ledger status

`check:ledger:confidence` (17/17), `simulate:payouts` (invariant holds,
zero real payout code exists anywhere), and
`check:billing:reconciliation --mode internal-beta` all pass fresh. See
`FINAL_BILLING_LEDGER_REVIEW.md` for the detailed review. No S0/S1
billing issues were found.

## 8. Privacy/security status

`check:monetization:privacy` (6/6) and `check:secrets:local` (0 leaks
across 491 scanned files) both pass fresh. See
`FINAL_PRIVACY_SECURITY_REVIEW.md` for the full walkthrough of every
telemetry/diagnostics/live-verification/terminal-prototype surface. No
S0/S1 privacy issues were found this sprint.

## 9. Packaging status

`package:browser:zip:audit --mode public-release` and
`package:vscode:vsix:audit --mode public-release` both still correctly
**FAIL** (missing LICENSE, placeholder icons, and other public-release-
only requirements) — this is expected and required; this sprint made no
change to packaging.

## 10. Public-release blockers

Unchanged and still correctly blocking (per
`docs/PUBLIC_RELEASE_READINESS_MATRIX.md` and
`docs/LICENSE_DECISION_REQUIRED.md`): no LICENSE file, placeholder icons,
no staging billing reconciliation evidence. `check:license --mode
public-release` fails, as required.

## 11. Real-payout blockers

Unchanged: no payout-execution code path exists anywhere in
`apps/api/src` (confirmed by static scan in
`check-controlled-revenue-pilot-readiness.js` and by
`MONETIZATION_SOURCE_AUDIT.md` Q18). `payouts`/`payout_batches` tables
exist in the schema only; nothing ever writes to them. No payment
processor (Stripe, PayPal, or otherwise) is integrated anywhere.

## 12. Known risks

See `FINAL_RISK_REGISTER.md` for the full table. Highest-relevance
summary: Claude/Gemini and VS Code live verification are pending (not
blockers for the ChatGPT-only pilot); manual revenue recording is a
human-process risk, not a code risk; the generated-report dirty-tree
workflow issue was found and fixed this sprint (see
`GENERATED_REPORT_WORKFLOW_REVIEW.md`).

## 13. What can be done now

1. Run the controlled ChatGPT browser revenue pilot exactly as scoped in
   `CONTROLLED_REVENUE_PILOT_CRITERIA.md` — one advertiser, one campaign,
   a tiny owner-filled budget cap, manual revenue recording, no real
   payout.
2. Optionally, separately and later, a human operator can run the
   no-login/assisted-manual live-verification workflows for Claude/
   Gemini, or the VS Code assisted-manual runbook — none of this is
   required for, or blocks, the ChatGPT pilot.

## 14. What must not be claimed

- Public release ready. (Blocked — §10.)
- Production ready. (Never claimed anywhere in this repo's docs.)
- Real payout ready. (Blocked — §11; no code path exists.)
- Claude, Gemini, or VS Code verified. (All `beta` — §3.)
- Claude Code, Codex, or desktop supported. (All `requires separate
  integration` — §5.)
- Zero account/IP-ban risk from any live-verification activity, should
  it later occur. (`LIVE_VERIFICATION_SAFETY_POLICY.md` explicitly
  disclaims this.)
- All platforms verified. (Only ChatGPT is.)

## 15. Final go/no-go recommendation for controlled internal pilot

**GO — for a founder-operated, ChatGPT-browser-only, tiny-capped-budget,
manual-revenue-recorded controlled pilot only.** See
`GO_NO_GO_FINAL_INTERNAL_PILOT.md` for the full decision record and
exact evidence trail. This recommendation carries forward, unchanged in
substance, the GO decision already recorded in
`docs/internal-beta/revenue-pilot/GO_NO_GO_CONTROLLED_REVENUE_PILOT.md`
— this consolidation sprint found no new evidence that would change it,
and confirmed every gate it depends on still passes fresh.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
