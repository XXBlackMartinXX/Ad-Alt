# Pilot Setup Automation Review

**Phase:** Controlled ChatGPT Pilot Setup Automation
**Date:** 2026-07-04

---

## What was automated

- **A formal pilot setup model** (`scripts/lib/pilot-setup.js`): the
  fixed field shape, the fixed-true safety flags
  (`chatgptOnly`/`noPublicRelease`/`noRealPayouts`/
  `manualRevenueRecordRequired`/`finalPreflightRequired`), and a
  forbidden-pattern scanner (`scanForPrivateData`) rejecting emails,
  phone numbers, card-like numbers, bank/card keywords, prompt/response
  content markers, and secret/token-shaped values.
- **An interactive setup wizard**
  (`scripts/setup-controlled-pilot.js`, `pnpm -w run pilot:setup`) that
  asks only the 13 safe questions this mission specified, re-prompts on
  any answer containing forbidden private data, and refuses to create
  an instance at all if the operator declines any of the non-negotiable
  scope confirmations (ChatGPT-only, no public release, no real
  payouts, manual revenue recording, final preflight).
- **A non-interactive template mode** (`--template`) that creates a
  blank, fully sanitized instance with status
  `DRAFT_NEEDS_HUMAN_COMPLETION` — never GO/READY on its own.
- **Four sanitized generated documents per instance**
  (`PILOT_SETUP.md`, `MANUAL_REVENUE_RECORD.md`,
  `PRE_LAUNCH_CHECKLIST.md`, `ROLLBACK_CONFIRMATION.md`) plus one
  machine-readable `PILOT_SETUP.json` sidecar for programmatic
  re-validation.
- **A preflight gate**
  (`scripts/check-controlled-pilot-preflight.js`,
  `pnpm -w run pilot:preflight -- --pilot-id <id>`) that validates the
  instance, negation-aware-scans every generated doc for private data
  and unsupported-platform overclaims, and — only once every cheap local
  check passes — fresh-runs the full readiness gate chain
  (`check:final-internal-pilot`, `check:revenue-pilot`,
  `check:monetization:privacy`, `check:secrets:local`), confirms public
  release remains blocked, and confirms no real payout-execution code
  pattern exists. Prints **GO** or **HOLD**.
- **A launch-day quickstart** (`PILOT_LAUNCH_DAY_QUICKSTART.md`) and an
  **instances README** (`instances/README.md`) documenting the whole
  workflow end to end.

## What remains manual

- **Actually collecting payment** — the operator invoices/collects the
  advertiser's payment entirely outside this codebase (bank transfer,
  check, invoice + ACH), then fills in the real collected amount in
  `MANUAL_REVENUE_RECORD.md` by hand.
- **The rollback owner's actual review** of `PILOT_STOP_ROLLBACK_PLAN.md`
  — the wizard only records a confirmation boolean; it cannot verify a
  human actually read the plan.
- **The real ChatGPT session itself** — the pilot tester uses their own
  real ChatGPT browser session, normally, with no automation of login
  or prompt entry, exactly as every prior sprint's rules require.
- **Post-pilot reconciliation** — filling in the actual collected
  amount, re-running `check:billing:reconciliation -- --mode
  internal-beta`, and completing `PILOT_ACCEPTANCE_CHECKLIST.md`'s
  post-pilot section remain explicit, separate, human steps this
  automation does not (and should not) trigger automatically.

## Why real payment/payout is not automated

Building real payment collection or real payout execution was
explicitly out of scope for this sprint (CANARY 6, CANARY 7) and for
every prior sprint's scope in this repo — no payment processor SDK is
integrated anywhere in `apps/api/src`
(`MONETIZATION_SOURCE_AUDIT.md` Q17-18, re-confirmed this sprint by the
preflight gate's own static source scan for
`stripe.transfers.create`/`paypal...payout`/`processPayout`/
`executePayout` patterns — none found). Automating either would mean
either (a) building and shipping a real money-movement feature without
the security review, PCI-scope consideration, and staging-environment
testing a real payment integration requires, or (b) faking a payment
collection UI with no real backend — both are worse than the current,
honest manual-paper-trail model. The manual model has a real, if
imperfect, safeguard: a human must physically collect and record the
payment, which is a natural circuit-breaker against runaway automated
charging.

## Why ChatGPT-only scope is enforced

`packages/shared`'s adapter allowlist and this pilot's own criteria
(`CONTROLLED_REVENUE_PILOT_CRITERIA.md`) restrict this pilot to
`browser_chatgpt` specifically, even though Claude/Gemini/VS
Code/Claude Code/Codex adapters now exist in this repo at `beta`/
`experimental` levels. The setup model hardcodes `platform` to the
literal string `"ChatGPT browser"` and rejects any other value outright
(`validatePilotSetup`'s first check); the wizard aborts entirely rather
than create an instance if the operator declines the `chatgptOnly`
confirmation; and the preflight gate independently re-confirms
`chatgptOnly === true` and scans every generated doc for the other
platforms' names appearing outside the standard "this pilot does NOT
include X" disclaimer section. Three independent layers, all enforcing
the same constraint, so a mistake in any one layer alone cannot
silently expand pilot scope.

## Privacy review

- Every free-text field the wizard collects (`buyerAlias`, `notes`) is
  scanned by `scanForPrivateData()` before acceptance; the wizard
  re-prompts rather than silently truncating or masking a bad answer.
- The preflight gate re-scans every generated document (not just the
  raw input fields) using the same forbidden-pattern list, made
  negation-aware so the templates' own cautionary boilerplate ("never a
  card/account number") does not trip the scanner while still catching
  genuinely leaked content.
- Two regex false positives were found and fixed during this sprint's
  own testing: the original phone-number pattern matched any long
  digit run, including ISO timestamps (`2026-07-04T11:55:02.622Z`) and
  generated pilot IDs (`pilot-20260704-ab12`) — tightened to require
  actual phone-number-shaped digit grouping (3-3-4, parenthesized area
  code, or a leading `+country code`), with regression tests added for
  both the false-positive cases and real phone-number formats.
- No prompt/response/chat/page/terminal content is ever collected by
  any script in this sprint — the entire pilot-setup surface only ever
  touches the fields listed in this document.

## Billing/revenue review

`MANUAL_REVENUE_RECORD.md` is generated pre-filled with the pilot ID
and budget cap, matching the existing repo-wide manual-record
convention (`MANUAL_REVENUE_RECORD_TEMPLATE.md`). It explicitly states
developer payout status must be `DISABLED`/`SIMULATED ONLY`, never
`PAID`/`SENT`, consistent with every other billing document in this
repo. The preflight gate's static payout-code scan (identical patterns
to `check-final-internal-pilot-readiness.js`'s own scan) found zero
hits in `apps/api/src` during this sprint's testing.

## Rollback review

`ROLLBACK_CONFIRMATION.md` records the rollback owner's initials and
whether the rollback plan was confirmed reviewed. The wizard treats a
"no" answer to the rollback-plan-reviewed question as a **warning**,
not a hard validation error (a human may reasonably want to draft a
pilot instance before finishing that review) — but the pre-launch
checklist and launch-day quickstart both make clear that launch itself
should not proceed until it is confirmed `true`.

## Operator steps

See `PILOT_LAUNCH_DAY_QUICKSTART.md` for the full, numbered sequence.
Summarized: pull → install → `pilot:setup` (or hand-edit a template) →
`pilot:preflight` → confirm budget/manual-record/rollback → launch per
`PILOT_LAUNCH_RUNBOOK.md` → monitor safe diagnostics only → stop on any
S0/S1 → reconcile after.

## Final recommendation

The setup automation built this sprint is real, tested, and
conservative: every path that could silently expand scope (wrong
platform, missing budget cap, missing sign-off, private data, real
payout code appearing) is checked in at least one place, several in
two independent places (wizard-time and preflight-time). It does not
weaken anything the prior "Final Internal Pilot Release-Readiness
Consolidation" sprint established — `check:final-internal-pilot` is
fresh-run as part of every non-trivial preflight, not bypassed.

**Recommendation: ready for the founder to use for the next controlled
ChatGPT pilot instance, subject to the founder actually reviewing and
completing the generated `PILOT_SETUP.md`/`ROLLBACK_CONFIRMATION.md`
for their real (or real test) pilot before running `pilot:preflight`
for the final GO decision.**

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real
buyer contact/payment details, real API keys, or real payment
credentials to this document.**
