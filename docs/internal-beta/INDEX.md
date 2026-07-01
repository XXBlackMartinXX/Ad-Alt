# PromptProfit -- Internal Beta Packet Index

**Version:** Internal Beta 1 | **Date:** 2026-07-01 | **Commit:** 6145fc7
**Label:** Internal beta rollout packet ready for first tester dry-run.

**This is an INTERNAL BETA. NOT a public release. NOT on the Chrome Web Store.**

---

## Start Here

[README.md](./README.md) -- Main beta handoff document: what is included, what is verified, known blockers, go/no-go table.

---

## Installation and Testing (For Testers)

| Document | Purpose |
|----------|---------|
| [TESTER_QUICK_START_CHECKLIST.md](./TESTER_QUICK_START_CHECKLIST.md) | Short actionable checklist -- Track A (non-engineer) and Track B (engineer) |
| [BETA_TESTER_INSTALLATION_GUIDE.md](./BETA_TESTER_INSTALLATION_GUIDE.md) | Full installation guide with privacy warnings |
| [BETA_TEST_PLAN.md](./BETA_TEST_PLAN.md) | Full test plan with commands, pass/fail criteria, bug report template |
| [FIRST_TESTER_DRY_RUN.md](./FIRST_TESTER_DRY_RUN.md) | Dry-run procedure: run before inviting multiple testers |

---

## Dry-Run Execution Documents

The `dry-runs/` subdirectory contains detailed execution documents for DRYRUN-001.
**Status: NOT RUN YET. Decision: PENDING.**

| Document | Purpose |
|----------|---------|
| [dry-runs/FIRST_TESTER_DRY_RUN_WORKSHEET.md](./dry-runs/FIRST_TESTER_DRY_RUN_WORKSHEET.md) | Session-by-session execution worksheet with pre-run, install, test, and uninstall checklists |
| [dry-runs/ONE_TESTER_EXECUTION_RUNBOOK.md](./dry-runs/ONE_TESTER_EXECUTION_RUNBOOK.md) | Step-by-step runbook for the dry-run owner (before, during, after) |
| [dry-runs/DRY_RUN_RESULT_LOG_TEMPLATE.md](./dry-runs/DRY_RUN_RESULT_LOG_TEMPLATE.md) | Template for recording session results (copy once per session) |
| [dry-runs/PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md](./dry-runs/PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md) | Privacy-safe issue capture form with evidence safety checklist |
| [dry-runs/GO_NO_GO_DECISION_RECORD.md](./dry-runs/GO_NO_GO_DECISION_RECORD.md) | Decision record for DRYRUN-001 (PENDING until execution) |
| [dry-runs/DRY_RUN_TRIAGE_CHECKLIST.md](./dry-runs/DRY_RUN_TRIAGE_CHECKLIST.md) | Post-session triage agenda, severity assignment, escalation paths |
| [dry-runs/DRY_RUN_STATUS_TRACKER.md](./dry-runs/DRY_RUN_STATUS_TRACKER.md) | All dry-run sessions and their current status |
| [dry-runs/DRYRUN-001_OWNER_READY_NOTE.md](./dry-runs/DRYRUN-001_OWNER_READY_NOTE.md) | DRYRUN-001 owner-ready note: current state, commands, checklist, criteria |

---

## Feedback and Triage

| Document | Purpose |
|----------|---------|
| [FEEDBACK_INTAKE.md](./FEEDBACK_INTAKE.md) | Feedback categories, severity levels, bug report template, privacy evidence policy |
| [ISSUE_TEMPLATES.md](./ISSUE_TEMPLATES.md) | Copy-paste GitHub issue templates for 8 issue types |
| [TRIAGE_LABELS.md](./TRIAGE_LABELS.md) | Full label set with triage rules and escalation matrix |
| [TESTER_INVITATION_TEMPLATES.md](./TESTER_INVITATION_TEMPLATES.md) | 7 ready-to-use invitation and follow-up message templates |

---

## Risk, Privacy, and Billing

| Document | Purpose |
|----------|---------|
| [PRIVACY_SECURITY_ONE_PAGER.md](./PRIVACY_SECURITY_ONE_PAGER.md) | What data IS and IS NOT collected; how to verify |
| [BILLING_VERIFICATION_SUMMARY.md](./BILLING_VERIFICATION_SUMMARY.md) | Local billing smoke results; what is and is NOT verified |
| [RISK_REGISTER.md](./RISK_REGISTER.md) | Risk table with severity, mitigation status, and required actions |

---

## Release Management

| Document | Purpose |
|----------|---------|
| [BETA_ROLLOUT_SCHEDULE.md](./BETA_ROLLOUT_SCHEDULE.md) | Day 0-7 rollout schedule with owner slots and sign-off blocks |
| [BETA_OWNER_CHECKLIST.md](./BETA_OWNER_CHECKLIST.md) | Role roster: Release, QA, Privacy, Billing, Triage, Rollback, Stakeholder, Comms |
| [ROLLBACK_AND_DISABLE_GUIDE.md](./ROLLBACK_AND_DISABLE_GUIDE.md) | How to disable, remove, rollback, and respond to incidents |
| [RELEASE_MANAGER_CHECKLIST.md](./RELEASE_MANAGER_CHECKLIST.md) | Step-by-step pre-release verification checklist with commands |
| [PR_DESCRIPTION_TEMPLATE.md](./PR_DESCRIPTION_TEMPLATE.md) | PR description template with reviewer checklist and evidence |
| [INTERNAL_BETA_RELEASE_NOTES.md](./INTERNAL_BETA_RELEASE_NOTES.md) | Concise release notes for testers and stakeholders |

---

## Stakeholder Handoff

| Document | Purpose |
|----------|---------|
| [STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md](./STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md) | Fill-in-the-blank Day 6 status update template |
| [STAKEHOLDER_DECISION_CHECKLIST.md](./STAKEHOLDER_DECISION_CHECKLIST.md) | 12 decisions required before public release: LICENSE, icons, privacy policy, staging |

---

## Supporting Engineering Docs

| Document | Purpose |
|----------|---------|
| [../CHATGPT_BROWSER_BETA_READINESS_CHECKLIST.md](../CHATGPT_BROWSER_BETA_READINESS_CHECKLIST.md) | Full engineering readiness checklist |
| [../CHATGPT_BROWSER_PRIVACY_SECURITY_AUDIT.md](../CHATGPT_BROWSER_PRIVACY_SECURITY_AUDIT.md) | Full privacy and security audit |
| [../PUBLIC_RELEASE_READINESS_MATRIX.md](../PUBLIC_RELEASE_READINESS_MATRIX.md) | Status matrix across all release stages |
| [../PRODUCTION_BILLING_RECONCILIATION_PLAN.md](../PRODUCTION_BILLING_RECONCILIATION_PLAN.md) | Staging billing reconciliation checklist |
| [../LICENSE_DECISION_REQUIRED.md](../LICENSE_DECISION_REQUIRED.md) | License decision options and blockers |
| [../RELEASE_PACKAGE_HYGIENE.md](../RELEASE_PACKAGE_HYGIENE.md) | Package artifact hygiene and audit scripts |

---

## Quick Commands

```bash
# DRYRUN-001 semi-automated conductor
pnpm -w run dryrun:001:prepare    # Before session: all checks + package + create draft + print human steps
pnpm -w run dryrun:001:finalize   # After session: interactive CLI to record results and update docs
pnpm -w run check:dryrun:001      # Validate DRYRUN-001 state at any time

# Verify internal beta packet
pnpm -w run check:internal-beta-packet

# Verify rollout execution packet
pnpm -w run check:internal-beta-rollout

# Verify first dry-run packet
pnpm -w run check:first-dry-run-packet

# Full pre-distribution check
pnpm -r build
pnpm --filter @ad-alt/browser-extension test:e2e
pnpm --filter @ad-alt/browser-extension test:unit
pnpm -w run check:secrets:local
pnpm -w run package:browser:beta
pnpm -w run package:browser:zip:audit -- --mode internal-beta
pnpm -w run package:vscode:vsix:audit -- --mode internal-beta
pnpm -w run check:billing:reconciliation -- --mode internal-beta

# Verify public-release gates still block (expected exit 1 -- correct)
pnpm -w run check:license -- --mode public-release
pnpm -w run package:browser:zip:audit -- --mode public-release
pnpm -w run check:billing:reconciliation -- --mode public-release
```
