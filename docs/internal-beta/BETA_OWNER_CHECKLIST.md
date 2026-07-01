# PromptProfit -- Beta Owner Checklist

**INTERNAL BETA ONLY. Not a public release.**
**Date:** 2026-07-01 | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

## Purpose

Every critical beta responsibility must be assigned to a named owner before the Day 1 dry
run begins. An unassigned role with no backup is a Day 0 blocker. The Release Owner must
confirm all roles are filled before distributing any beta package.

---

## Owner Roster

| Role | Owner | Backup | Assigned Date |
|------|-------|--------|--------------|
| Release Owner | [OWNER TBD] | [OWNER TBD] | [DATE TBD] |
| QA Owner | [OWNER TBD] | [OWNER TBD] | [DATE TBD] |
| Privacy Owner | [OWNER TBD] | [OWNER TBD] | [DATE TBD] |
| Billing Owner | [OWNER TBD] | [OWNER TBD] | [DATE TBD] |
| Triage/Support Owner | [OWNER TBD] | [OWNER TBD] | [DATE TBD] |
| Rollback Owner | [OWNER TBD] | [OWNER TBD] | [DATE TBD] |
| Stakeholder Decision Owner | [OWNER TBD] | [OWNER TBD] | [DATE TBD] |
| Communications Owner | [OWNER TBD] | [OWNER TBD] | [DATE TBD] |

---

## Role Responsibilities

### Release Owner

Responsibilities:
- Final authority on all Go/No-Go decisions (Day 0, Day 1, Day 7)
- Approves beta distribution to each wave of testers
- Ensures no LICENSE file is committed without explicit stakeholder decision
- Ensures no generated artifacts (ZIPs, VSIXs, dist/, dist-test/, test-results/) are committed
- Ensures no ppft_ key appears in any committed file (check:secrets:local: 0 leaks)
- Signs off on Day 0, Day 7

### QA Owner

Responsibilities:
- Verifies all automated checks pass before Day 0 distribution
- Required commands (all must exit 0):
  pnpm -r build
  pnpm --filter @ad-alt/browser-extension test:e2e
  pnpm --filter @ad-alt/browser-extension test:unit
  pnpm -w run check:secrets:local
  pnpm -w run package:browser:beta
  pnpm -w run package:browser:zip:audit -- --mode internal-beta
  pnpm -w run check:internal-beta-packet
  pnpm -w run check:internal-beta-rollout
- Signs off on all test and package audit results before Day 0
- Monitors for regressions after any Day 4-5 code changes

### Privacy Owner

Responsibilities:
- Reviews any issue labeled beta:s0-privacy-security before it is closed
- Checks tester feedback for any possible data leakage or unexpected page reading
- Confirms no ppft_ key or personal data appears in any shared artifact
- Verifies check:secrets:local exits 0 before and after any code change
- Has final authority to halt the beta for a privacy incident (S0)
- Must be reachable within 1 business hour during active beta window

Privacy rule enforced: no extension reads of promptText, pageUrl, pageTitle, domText,
chatHistory, cookies, authToken, sessionCookie, or any ChatGPT DOM content.

### Billing Owner

Responsibilities:
- Reviews billing smoke evidence before Day 0:
  pnpm -w run smoke:billing:local
  pnpm -w run smoke:billing:click:local
- Verifies billing invariant holds: developer_credit + platform_fee == advertiser_charge
- Triages all issues labeled area:billing-ledger
- Escalates any invariant failure immediately (stop billing smoke, notify Release Owner)
- Reviews BILLING_VERIFICATION_SUMMARY.md and confirms it accurately reflects test state
- Does NOT claim production billing is verified (staging not run)

### Triage/Support Owner

Responsibilities:
- Reviews all new GitHub issues with release:internal-beta label within 1 business day
- Applies severity labels (beta:s0 through beta:s4) per TRIAGE_LABELS.md rules
- Applies area labels and status labels
- Escalates S0 to Privacy Owner immediately
- Escalates billing invariant failures to Billing Owner immediately
- Routes status:needs-repro issues back to the reporter with clarifying questions
- Keeps triage board current (no stale status:needs-triage issues > 1 business day)

### Rollback Owner

Responsibilities:
- Knows the rollback procedure in ROLLBACK_AND_DISABLE_GUIDE.md
- Can reach all active testers via the tester distribution channel within 2 hours
- Can instruct testers to disable the extension: chrome://extensions -> toggle OFF
- Can stop Docker billing services if needed: docker compose down
- Available (reachable) during active beta window (Days 1-5)
- Executes full rollback if instructed by Privacy Owner or Release Owner

### Stakeholder Decision Owner

Responsibilities:
- Receives the Day 6 stakeholder update (STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md)
- Makes or escalates the following pending decisions:
  - LICENSE type selection (see docs/LICENSE_DECISION_REQUIRED.md)
  - Final brand icon approval
  - Staging environment scheduling
  - Privacy policy (external, user-facing)
  - Support/contact email for CWS
- Makes the Day 7 Go/No-Go decision
- Owns the escalation path for public release readiness

### Communications Owner

Responsibilities:
- Sends tester invitations using TESTER_INVITATION_TEMPLATES.md
- Sends follow-up and thank-you messages per schedule
- Manages the internal tester distribution list
- Does NOT share beta artifacts beyond the approved tester list
- Does NOT forward beta materials to any external party
- Sends the Privacy-Safe Evidence Reminder before testers begin sessions

---

## Pre-Beta Readiness Sign-Off

The Release Owner may not distribute the beta package until all roles are confirmed:

| Role | Owner Confirmed? | Sign-Off Date |
|------|-----------------|--------------|
| Release Owner | [TBD] | [DATE TBD] |
| QA Owner | [TBD] | [DATE TBD] |
| Privacy Owner | [TBD] | [DATE TBD] |
| Billing Owner | [TBD] | [DATE TBD] |
| Triage/Support Owner | [TBD] | [DATE TBD] |
| Rollback Owner | [TBD] | [DATE TBD] |
| Stakeholder Decision Owner | [TBD] | [DATE TBD] |
| Communications Owner | [TBD] | [DATE TBD] |

**All roles confirmed. Ready to proceed to Day 0:** [YES / NO / TBD]

---

## Decision Log

Record all significant decisions made during the beta here.

| Date | Decision | Decided By | Notes |
|------|----------|-----------|-------|
| [DATE TBD] | [TBD] | [OWNER TBD] | |

---

## Emergency Contact Protocol

If any of the following occurs, the Privacy Owner and Release Owner must be contacted
immediately via PRIVATE channel (not GitHub, not group chat):

- A ppft_ API key appears in any shared log, screenshot, report, or GitHub issue
- Personal data or ChatGPT content appears in any shared artifact
- A tester reports that the extension overlay shows their chat content
- Billing invariant failure: developer_credit + platform_fee != advertiser_charge
- Any S0 severity event of any kind

**Private escalation channel:** [CHANNEL TBD -- set by Release Owner before Day 0]
