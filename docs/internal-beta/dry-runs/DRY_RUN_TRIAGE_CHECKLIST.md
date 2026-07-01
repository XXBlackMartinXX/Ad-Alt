# PromptProfit -- Dry-Run Triage Checklist

**For use after DRYRUN-001 session. Run triage within 24 hours of session completion.**
**INTERNAL BETA ONLY. Branch:** claude/ecstatic-maxwell-h0d8d8

---

> Triage is the structured review of all issues found during the dry-run.
> The Triage Owner leads this meeting. Privacy Owner must attend if any S0 event occurred.

---

## Triage Meeting

| Field | Value |
|-------|-------|
| Dry-Run ID | [DRYRUN-NNN] |
| Triage Meeting Date | [DATE TBD] |
| Triage Owner | [OWNER TBD] |
| Attendees | [LIST] |
| Issues to triage | [N issues from dry-run session] |

---

## Agenda (estimated 30-60 minutes)

1. Review dry-run result log (DRY_RUN_RESULT_LOG_TEMPLATE.md)
2. Assign severity to each issue
3. Assign priority to each issue
4. Escalate any S0 issues immediately
5. Route billing invariant issues to Billing Owner
6. Assign owners for S1/S2 issues
7. Backlog S3/S4 issues
8. Update BETA_ROLLOUT_SCHEDULE.md with triage results
9. Record decision in GO_NO_GO_DECISION_RECORD.md
10. Brief stakeholders if needed

---

## Issue Severity Assignment

Apply TRIAGE_LABELS.md severity rules to every issue. Review in this order:

1. First: check for S0 (privacy, security, API key exposure, personal data leakage)
2. Second: check for S1 (beta blocker -- affects all testers)
3. Third: classify S2/S3/S4

| Issue # | Title | Proposed Severity | Confirmed Severity | Owner |
|---------|-------|------------------|--------------------|-------|
| [#] | [TITLE] | [S0-S4] | [S0-S4] | [OWNER TBD] |

---

## P0/P1 Escalation Path

### P0 Escalation (Any S0 Event)

If any S0 issue is present:
1. Privacy Owner and Release Owner must be notified IMMEDIATELY via private channel.
2. Beta distribution must STOP until Privacy Owner reviews and clears.
3. If a ppft_ API key was exposed in any shared artifact:
   a. Rotate the key (contact Release Owner for production key procedures).
   b. Edit or remove any GitHub issue comment containing the key.
   c. Do NOT file or reference the raw key in any tracking document.
4. File a private incident report (not a public GitHub issue).
5. Record in GO_NO_GO_DECISION_RECORD.md: STOP.

### P1 Escalation (S1 Blocker)

If any S1 issue is present:
1. Notify QA Owner same business day.
2. Assign to engineer with a target fix date.
3. Re-run dry-run (new DRYRUN-NNN) after fix is verified.
4. Record in GO_NO_GO_DECISION_RECORD.md: HOLD until fixed.

---

## Privacy Incident Handling Checklist

If any tester shared, or was about to share, private data:

- [ ] Identify what was shared or nearly shared
- [ ] Redact any GitHub issue comments containing personal data immediately
- [ ] Do NOT save or forward any screenshot containing personal data
- [ ] Notify Privacy Owner via private channel
- [ ] Privacy Owner decides: S0 or acceptable near-miss
- [ ] If S0: follow P0 escalation above
- [ ] If near-miss: document in dry-run result log as a privacy observation
- [ ] Update RISK_REGISTER.md if warranted

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**

---

## Billing Invariant Failure Handling

If tester reported billing invariant failure (developer_credit + platform_fee != advertiser_charge):

- [ ] STOP all billing smoke tests immediately
- [ ] Record the exact amounts (without ppft_ keys) in the triage log
- [ ] Notify Billing Owner immediately
- [ ] File GitHub issue: area:billing-ledger + beta:s1-blocker
- [ ] Record in GO_NO_GO_DECISION_RECORD.md: HOLD
- [ ] Do NOT proceed to wider beta until Billing Owner verifies the invariant

---

## Install Failure Handling

If tester could not install the extension:
- [ ] Identify which step failed (Track A or B)
- [ ] Classify severity: S1 if blocking all testers, S2 if only this environment
- [ ] Check if issue is Chrome version, OS-specific, or general
- [ ] Update TESTER_QUICK_START_CHECKLIST.md or BETA_TESTER_INSTALLATION_GUIDE.md
- [ ] Record in result log
- [ ] If S1: HOLD decision, fix guide before re-run

---

## Documentation Confusion Handling

If tester was confused by any doc step:
- [ ] Record which step caused confusion and why
- [ ] Classify: S3 (confusing but workable) or S2 (caused failure)
- [ ] Update the relevant document
- [ ] Confirm the fix makes the step clearer without adding unnecessary complexity
- [ ] Record in result log

---

## Unsupported Platform Request Handling

If tester asked for Claude, Gemini, Desktop, or other platform support:
- [ ] Apply label: beta:s4-suggestion + out-of-scope:platform-expansion
- [ ] Do NOT escalate as a bug
- [ ] Do NOT add to sprint for this release
- [ ] Acknowledge the request and note it is out of scope for this phase
- [ ] Record as S4 in triage log

---

## Issue Disposition

After assigning severity and priority, mark each issue with one of:

| Disposition | Meaning |
|-------------|---------|
| Accepted | Confirmed issue; assigned to sprint or backlog |
| Needs Repro | Cannot reproduce; request more detail from reporter |
| Fixed | Fix committed and ready for verification |
| Deferred | Known issue; not blocking beta; track for public release |
| Wontfix-Beta | Known issue; will not fix during internal beta phase; documented |
| Out of Scope | Platform expansion or post-public-release request |

---

## Post-Triage Document Updates

After triage meeting, update these documents:

- [ ] DRY_RUN_RESULT_LOG_TEMPLATE.md: fill in triage outcome section
- [ ] GO_NO_GO_DECISION_RECORD.md: record decision and rationale
- [ ] DRY_RUN_STATUS_TRACKER.md: update DRYRUN-001 row
- [ ] BETA_ROLLOUT_SCHEDULE.md: update Day 1 result and sign-off
- [ ] BETA_OWNER_CHECKLIST.md: update Day 1 sign-off block
- [ ] RISK_REGISTER.md: add any new risks surfaced during dry-run
- [ ] STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md: prepare Day 6 update with dry-run results

If go decision: notify Day 2-3 tester group.
If hold decision: assign fix owners and target dates.
If stop decision: execute rollback and notify stakeholders.
