---
# PromptProfit — Internal Beta Release Packet Index

**Version:** Internal Beta 1 | **Date:** 2026-07-01 | **Commit:** `5979b4e`

---

## Start Here

[README.md](./README.md) — Main beta handoff document: what is included, what is verified, known blockers, go/no-go table

---

## For Beta Testers

| Document | Purpose |
|----------|---------|
| [BETA_TESTER_INSTALLATION_GUIDE.md](./BETA_TESTER_INSTALLATION_GUIDE.md) | How to install the browser extension and VSIX; privacy warnings |
| [BETA_TEST_PLAN.md](./BETA_TEST_PLAN.md) | Full test plan with commands, pass/fail criteria, bug report template |
| [PRIVACY_SECURITY_ONE_PAGER.md](./PRIVACY_SECURITY_ONE_PAGER.md) | What data is collected and never collected; how to verify |

---

## For Stakeholders / Decision Makers

| Document | Purpose |
|----------|---------|
| [STAKEHOLDER_DECISION_CHECKLIST.md](./STAKEHOLDER_DECISION_CHECKLIST.md) | Decisions required before public release: LICENSE, icons, privacy policy, staging |
| [BILLING_VERIFICATION_SUMMARY.md](./BILLING_VERIFICATION_SUMMARY.md) | Local billing smoke results; what is and is NOT verified |
| [RISK_REGISTER.md](./RISK_REGISTER.md) | Risk table with severity, mitigation status, and required actions |

---

## For Release Managers / Engineering

| Document | Purpose |
|----------|---------|
| [RELEASE_MANAGER_CHECKLIST.md](./RELEASE_MANAGER_CHECKLIST.md) | Step-by-step pre-release verification checklist with commands |
| [PR_DESCRIPTION_TEMPLATE.md](./PR_DESCRIPTION_TEMPLATE.md) | PR description template for reviewer checklist and evidence |
| [INTERNAL_BETA_RELEASE_NOTES.md](./INTERNAL_BETA_RELEASE_NOTES.md) | Concise release notes for testers and stakeholders |

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
| [../EVENT_LEDGER_DEDUP_REVIEW.md](../EVENT_LEDGER_DEDUP_REVIEW.md) | Event dedup and billing invariant review |

---

## Quick Commands

```bash
# Verify all internal-beta gates
pnpm -w run check:internal-beta-packet

# Run full pre-release check
pnpm -w run check:ps1 && pnpm -w run check:secrets:local && pnpm -w run smoke:chatgpt:fixture && pnpm --filter @ad-alt/browser-extension test:unit

# Package browser extension
pnpm -r build && pnpm -w run package:browser:beta && pnpm -w run package:browser:zip:audit -- --mode internal-beta

# Package VS Code extension
pnpm --filter promptprofit package && pnpm -w run package:vscode:vsix:audit -- --mode internal-beta

# Verify public-release gates still block (expected exit 1)
pnpm -w run check:license -- --mode public-release
pnpm -w run package:browser:zip:audit -- --mode public-release
pnpm -w run check:billing:reconciliation -- --mode public-release
```
