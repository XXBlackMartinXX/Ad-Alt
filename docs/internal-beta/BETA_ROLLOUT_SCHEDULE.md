# PromptProfit -- Beta Rollout Schedule

**INTERNAL BETA ONLY. Not a public release.**
**Date:** 2026-07-01 | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

## Overview

This schedule covers Internal Beta 1 for the PromptProfit ChatGPT adapter.
ChatGPT (chatgpt.com) is the ONLY supported platform in this release.
All dates are [DATE TBD] until the Release Owner sets a start date.

---

## Rollout Summary

| Day | Phase | Goal |
|-----|-------|------|
| Day 0 | Preparation | Artifacts built, audited, and distributed to dry-run owner |
| Day 1 | First Tester Dry Run | One tester completes install + test; go/no-go decision |
| Day 2-3 | Small Internal Beta | 3-5 testers install and test; issues triaged daily |
| Day 4-5 | Triage and Fixes | S0/S1/S2 issues addressed; docs updated if needed |
| Day 6 | Stakeholder Review | Engineering summary distributed; pending decisions reviewed |
| Day 7 | Go/No-Go Decision | Decision: continue beta / hold / stop / begin public release prep |

---

## Day 0 -- Preparation

**Start Date:** [DATE TBD]
**Owner:** [OWNER TBD] (Release Owner)

### Automated Verification

Run all of the following. Every check must exit 0 before distribution:

  pnpm install --frozen-lockfile
  pnpm -r build
  pnpm --filter @ad-alt/browser-extension test:e2e
  pnpm --filter @ad-alt/browser-extension test:unit
  pnpm -w run check:ps1
  pnpm -w run check:secrets:local
  pnpm -w run check:license -- --mode internal-beta
  pnpm -w run package:browser:beta
  pnpm -w run package:browser:zip:audit -- --mode internal-beta
  pnpm -w run package:vscode:vsix:audit -- --mode internal-beta
  pnpm -w run check:billing:reconciliation -- --mode internal-beta
  pnpm -w run check:internal-beta-packet
  pnpm -w run check:internal-beta-rollout

### Pre-Distribution Checks

- [ ] All automated checks above exit 0
- [ ] Confirm: no LICENSE file committed (BLOCKED -- pending stakeholder decision)
- [ ] Confirm: no ppft_ key in any committed or distributed file (check:secrets:local: 0 leaks)
- [ ] Confirm: beta ZIP does NOT contain dist-test/, .js.map, .env, node_modules, screenshots
- [ ] Confirm: beta ZIP DOES contain manifest.json, background/service-worker.js, content/chatgpt.js, icons/
- [ ] Brief dry-run owner on FIRST_TESTER_DRY_RUN.md
- [ ] Confirm dry-run tester has signed NDA or internal agreement
- [ ] Distribute beta ZIP to dry-run owner via secure internal channel (NOT unencrypted email)

**Day 0 sign-off:** [OWNER TBD] -- [DATE TBD]

---

## Day 1 -- First Tester Dry Run

**Date:** [DATE TBD]
**Owner:** [OWNER TBD] (Dry-Run Facilitator)
**Tester:** [TESTER TBD]

### Procedure

Follow FIRST_TESTER_DRY_RUN.md exactly.

Safe test prompt for tester: Count slowly from 1 to 10.

### Exit Criteria

All must be true to proceed to Day 2-3:
- [ ] Tester installed package without direct repo access
- [ ] Tester observed the overlay banner using the safe test prompt
- [ ] No privacy leakage observed
- [ ] No S0 or S1 issue discovered
- [ ] Install guide was understandable
- [ ] Disable/remove procedure worked
- [ ] Tester filed feedback

**Day 1 result:** GO / NO-GO / [TBD]
**Issues filed:** [NUMBER] (S0: [N], S1: [N], S2: [N], S3: [N])
**Day 1 sign-off:** [OWNER TBD] -- [DATE TBD]

---

## Day 2-3 -- Small Internal Beta

**Dates:** [DATE TBD] -- [DATE TBD]
**Owner:** [OWNER TBD]
**Tester count:** 3-5 internal testers
**Prerequisite:** Day 1 was GO

### Distribution

- Distribute beta ZIP to testers via secure internal channel
- Send TESTER_INVITATION_TEMPLATES.md Template 2 or 3 as appropriate
- Send TESTER_QUICK_START_CHECKLIST.md (Track A or B per tester)
- Send PRIVACY_SECURITY_ONE_PAGER.md summary
- Confirm each tester has agreed to internal beta terms

### Daily Triage

Each day:
- [ ] Review new GitHub issues with release:internal-beta label
- [ ] Apply severity + area labels per TRIAGE_LABELS.md
- [ ] Escalate any S0 immediately to Privacy Owner
- [ ] Route billing invariant issues to Billing Owner
- [ ] Track issue counts (S0: [N], S1: [N], S2: [N])

### Day 2-3 Tracking

| Tester | Track | Status | Issues Filed |
|--------|-------|--------|-------------|
| [TESTER 1] | [A/B] | [In Progress / Complete] | [N] |
| [TESTER 2] | [A/B] | [In Progress / Complete] | [N] |
| [TESTER 3] | [A/B] | [In Progress / Complete] | [N] |

**Day 2-3 sign-off:** [OWNER TBD] -- [DATE TBD]

---

## Day 4-5 -- Triage and Fixes

**Dates:** [DATE TBD] -- [DATE TBD]
**Owner:** [OWNER TBD] (QA Owner + Triage Owner)

### Objectives

- Resolve all S0 issues (required)
- Triage and assign all S1 issues (required)
- Triage S2 issues and add to backlog
- Update any documentation that testers found confusing

### After Any Code Change

Re-run:
  pnpm -w run check:secrets:local
  pnpm --filter @ad-alt/browser-extension test:e2e
  pnpm --filter @ad-alt/browser-extension test:unit
  pnpm -w run check:internal-beta-packet
  pnpm -w run check:internal-beta-rollout

- [ ] All S0 issues resolved or escalated
- [ ] All S1 issues triaged (fix assigned or backlogged with justification)
- [ ] All S2 issues triaged
- [ ] Docs updated for any confusing steps found during beta
- [ ] Re-verified: check:secrets:local still exits 0 after any code changes

**Day 4-5 sign-off:** [OWNER TBD] -- [DATE TBD]

---

## Day 6 -- Stakeholder Review

**Date:** [DATE TBD]
**Owner:** [OWNER TBD] (Communications Owner)

### Action

Send stakeholder update using STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md.

Must include:
- Total issues found by severity
- Total issues resolved
- Known limitations surfaced during beta
- Go/no-go recommendation for continued beta
- Public-release blockers still unresolved and still correctly gated:
  - LICENSE decision required
  - Final brand icons required
  - VSIX source-map confirmation required
  - Staging billing reconciliation required
  - Production billing not verified

**Day 6 sign-off:** [OWNER TBD] -- [DATE TBD]

---

## Day 7 -- Go/No-Go Decision

**Date:** [DATE TBD]
**Decision Owner:** [OWNER TBD] (Stakeholder Decision Owner)

### Decision Criteria

| Question | Answer |
|----------|--------|
| Were all S0 issues resolved? | [TBD] |
| Were all S1 issues triaged and assigned? | [TBD] |
| Is the privacy model confirmed safe by testers? | [TBD] |
| Is the install experience acceptable (< 2 testers blocked)? | [TBD] |
| Are public-release blockers correctly documented and gated? | [TBD] |
| Check:secrets:local still exits 0? | [TBD] |

### Allowed Decisions

| Decision | Criteria |
|----------|---------|
| GO -- Continue beta | No S0 open; S1s assigned; install acceptable; privacy safe |
| HOLD -- Fix and re-run | One or more S1 open with no owner; install blocked for multiple testers |
| STOP -- Pause all beta | Any unresolved S0; critical privacy issue; billing invariant unresolved |
| ESCALATE TO PUBLIC PREP | All S0/S1 resolved; stakeholders decide to begin public release prep (requires resolving all documented blockers: LICENSE, icons, staging, VSIX confirmation) |

**Day 7 decision:** [GO / HOLD / STOP / ESCALATE TO PUBLIC PREP / TBD]
**Day 7 sign-off:** [OWNER TBD] -- [DATE TBD]

---

## Public Release Blockers (Not Affected by This Schedule)

These blockers are SEPARATE from the beta rollout schedule. The internal beta can GO even
with these blockers open. They must be resolved BEFORE any public release.

| Blocker | Status |
|---------|--------|
| LICENSE decision | BLOCKED -- stakeholder decision required |
| Final brand icons | BLOCKED -- pending brand review |
| VSIX source-map-free rebuild | PARTIAL -- .vscodeignore updated; rebuild + re-audit needed |
| Staging billing reconciliation | BLOCKED -- staging environment not yet run |
| Production billing readiness | BLOCKED -- requires staging first |
