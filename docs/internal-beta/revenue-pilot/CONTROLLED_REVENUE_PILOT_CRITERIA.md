# PromptProfit — Controlled Revenue Pilot Criteria

**Phase:** Fast Controlled Revenue Pilot Launch Sprint
**Date:** 2026-07-03
**Branch:** claude/windows-release-pipeline-fix-xfj0sw

> This document defines the EXACT allowed shape of the first controlled
> revenue pilot. Any deviation from this document requires explicit owner
> re-approval before proceeding — do not silently expand scope mid-pilot.

---

## The exact allowed pilot

| Dimension | Limit |
|-----------|-------|
| Advertisers | Exactly 1 — founder-managed test advertiser, or one real, consenting small-business advertiser |
| Campaigns | Exactly 1, `status: "active"`, seeded per `packages/database/src/seed.ts`'s pattern |
| Developer/app surfaces | Exactly 1 — `browser_chatgpt` adapter only (current MVP scope) |
| Testers | 1 (the pilot participant) plus the operator |
| Budget cap | **[BUDGET CAP PLACEHOLDER — owner to fill in before launch, e.g. $10.00-$25.00 total, low daily cap]** |
| Payment collection | Manual invoice or manual record only — recorded via `MANUAL_REVENUE_RECORD_TEMPLATE.md` |
| Developer payout | Disabled — no real payout; `simulate:payouts` classification only |
| Environment | Local Docker stack (`docker-compose.yml`) or a single controlled host running the same stack — not a public deployment |

---

## Allowed actions

- Seeding one real advertiser + one campaign + one approved creative,
  following `packages/database/src/seed.ts`'s exact data shape.
- Issuing one API key via `POST /v1/auth/exchange` for the one pilot
  developer/tester device.
- Running the browser extension against the pilot API instance on real
  chatgpt.com, with the pilot tester's own real (but not automated)
  ChatGPT session.
- Recording real billable impression/click events through the existing,
  verified event pipeline.
- Reviewing ledger entries and reconciliation output after the pilot.
- Manually invoicing/collecting payment from the advertiser outside this
  codebase, and recording that collection via
  `MANUAL_REVENUE_RECORD_TEMPLATE.md`.
- Running `simulate:payouts` to classify what a hypothetical developer
  payout status would be — informational only.

## Forbidden actions

- Automating ChatGPT login or prompt entry (CANARY 8).
- Reading, storing, or logging ChatGPT prompt text, response text, chat
  history, full URLs, page content, DOM text, cookies, tokens,
  localStorage, sessionStorage, clipboard, screenshots, videos, traces,
  or any private API (CANARY 9).
- Executing any real payout (CANARY 7, CANARY 11) — no such code path
  exists; do not add one this phase.
- Processing real card/bank/payment credentials anywhere in this
  codebase (CANARY 10).
- Adding a second advertiser, campaign, or developer surface without
  re-approving this document.
- Submitting to the Chrome Web Store or VS Code Marketplace, or any other
  public distribution (public release remains blocked — CANARY 12).
- Enabling Claude, Gemini, VS Code, desktop, or terminal support for any
  real user during this pilot. (Note: separate, later platform-expansion
  work has since added Claude/Gemini browser adapters and hardened the
  VS Code extension — see `docs/internal-beta/platforms/PLATFORM_SUPPORT_MATRIX.md`
  — but all of that remains `beta`/kill-switch-disabled and entirely
  outside this pilot's scope. This pilot is `browser_chatgpt` only, full
  stop, regardless of what other platform code exists in the repo.)

## Required checks (must all PASS immediately before launch)

```bash
pnpm -w run check:revenue-pilot
```

(Fresh-runs `pilot:rehearsal`, `check:ledger:confidence`,
`check:monetization:privacy`, `simulate:payouts`,
`check:billing:reconciliation -- --mode internal-beta`,
`check:dryrun:001`, `check:secrets:local`, and verifies the pilot docs
package exists — see `PILOT_LAUNCH_RUNBOOK.md` for the full sequence.)

## Budget cap placeholder

**[OWNER TO FILL IN before every pilot launch]**

| Field | Value |
|-------|-------|
| Total campaign budget | $____ |
| Daily budget cap | $____ |
| CPM bid | $____ |
| Expected max spend if fully exhausted | Must equal total campaign budget, enforced atomically by `apps/api/src/services/ledger.service.ts` (`campaign.spentMicrocents + chargeAmount > campaign.budgetMicrocents` check) |

## Participant requirements

- Advertiser: aware this is a controlled pilot, not a production ad
  platform; aware payment is manually invoiced, not auto-charged; has
  approved the budget cap above.
- Developer/tester: aware this is a controlled pilot; aware no real
  payout will be sent for any earnings generated; has read and
  acknowledged the privacy constraints in
  `PILOT_LAUNCH_RUNBOOK.md` §13-14.
- Operator: has run `check:revenue-pilot` and confirmed PASS immediately
  before launch; is the assigned rollback owner (see below).

## Rollback conditions

See `PILOT_STOP_ROLLBACK_PLAN.md` for the full trigger list and rollback
action sequence. Summary: any privacy leak, duplicate billing, ledger
imbalance, budget-cap breach, or extension runtime regression triggers
immediate rollback.

## Stop conditions

- Any S0/S1 issue discovered (per
  `docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md` severity
  guide).
- Budget cap reached (campaign auto-transitions to `"exhausted"` —
  expected, not itself a stop condition, but confirm no further spend
  occurred after exhaustion).
- Operator or advertiser requests a stop for any reason.

## Owner sign-off placeholders

| Role | Approved | Date |
|------|---------|------|
| Founder/Owner | [PENDING] | |
| Engineering owner | [PENDING] | |
| Rollback owner (see `PILOT_STOP_ROLLBACK_PLAN.md`) | [PENDING] | |

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
