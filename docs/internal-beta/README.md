---
# PromptProfit — Internal Beta Release Packet

**Release:** Internal Beta 1
**Date:** 2026-07-01
**Commit:** `5979b4e`
**Branch:** `claude/ecstatic-maxwell-h0d8d8`
**Label:** Internal beta release candidate; public release blockers documented and gated.

---

## What This Is

An internal distribution packet for the PromptProfit ChatGPT browser adapter.
This is NOT a public release. It is NOT available on the Chrome Web Store or VS Code Marketplace.

---

## What Is Included

| Component | Status | Notes |
|-----------|--------|-------|
| ChatGPT browser adapter (Chrome extension) | INTERNAL BETA | Load unpacked or install ZIP manually |
| VS Code extension | INTERNAL BETA | Install VSIX manually |
| Impression billing smoke | VERIFIED LOCAL | Requires Docker + local API |
| Click billing smoke | VERIFIED LOCAL | Requires Docker + local API |
| Fixture E2E test suite (13/13) | PASS | |
| Unit tests (105/105) | PASS | |

## What Is NOT Included

| Item | Status |
|------|--------|
| Chrome Web Store listing | NOT STARTED — blocked |
| VS Code Marketplace listing | NOT STARTED — blocked |
| Production billing | NOT VERIFIED |
| Staging reconciliation | NOT RUN |
| Claude platform adapter | OUT OF SCOPE |
| Gemini platform adapter | OUT OF SCOPE |
| Desktop adapter | OUT OF SCOPE |
| Final brand icons | PLACEHOLDER ONLY |
| LICENSE file | DECISION PENDING |
| Privacy policy (external) | NOT STARTED |
| Support/contact email | NOT STARTED |

---

## Supported Platform

**ChatGPT (chatgpt.com) only.**

The extension detects the ChatGPT wait-state (model is thinking), renders a sponsored moment in the extension-owned overlay, tracks viewability, fires events, and records billing ledger entries. No other platform is implemented or enabled.

---

## Verified Checks

| Check | Result | Command |
|-------|--------|---------|
| PS1 files ASCII-clean | PASS 10/10 | `pnpm check:ps1` |
| Secret leak scan | PASS 333 files | `pnpm check:secrets:local` |
| Report templates ASCII | PASS | `pnpm check:report-ascii` |
| License gate (internal-beta) | PASS/WARN | `pnpm check:license -- --mode internal-beta` |
| Fixture E2E | PASS 13/13 | `pnpm smoke:chatgpt:fixture` |
| Unit tests | PASS 105/105 | `pnpm test:unit` (in browser-extension) |
| TypeScript/lint | PASS | `pnpm verify` |
| Build | PASS | `pnpm -r build` |
| Impression billing smoke | PASS (local) | `pnpm smoke:billing:local` |
| Click billing smoke | PASS (local) | `pnpm smoke:billing:click:local` |
| Browser beta ZIP | PASS (internal-beta) | `pnpm package:browser:beta` |
| Browser ZIP artifact audit | PASS (internal-beta) | `pnpm package:browser:zip:audit -- --mode internal-beta` |
| VSIX artifact audit | PASS (internal-beta) | `pnpm package:vscode:vsix:audit -- --mode internal-beta` |
| Billing reconciliation gate | PASS/WARN (internal-beta) | `pnpm check:billing:reconciliation -- --mode internal-beta` |
| Beta packet completeness | PASS | `pnpm check:internal-beta-packet` |

---

## Package Artifact Commands

```bash
# Browser extension beta ZIP (excludes source maps)
pnpm -w run package:browser:beta

# Verify ZIP contents
pnpm -w run package:browser:zip:audit -- --mode internal-beta

# VS Code extension VSIX
pnpm --filter promptprofit package

# Verify VSIX contents
pnpm -w run package:vscode:vsix:audit -- --mode internal-beta
```

---

## Known Blockers Before Public Release

| Blocker | Category | Path to Resolve |
|---------|----------|----------------|
| LICENSE decision required | Legal | Stakeholder choice needed — see `docs/LICENSE_DECISION_REQUIRED.md` |
| Final brand icons required | Brand | Replace placeholder PNGs — see `docs/internal-beta/STAKEHOLDER_DECISION_CHECKLIST.md` |
| VSIX source-map exclusion confirmation | Packaging | Re-build VSIX after `.vscodeignore` update; verify with `package:vscode:vsix:audit -- --mode public-release` |
| Staging billing reconciliation | Billing/Ops | Run staging smoke — see `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md` |
| Production billing readiness | Billing/Ops | Requires staging pass first |

---

## Risk Summary

See `docs/internal-beta/RISK_REGISTER.md` for full risk register.

**Highest severity open risks:**
- LICENSE unresolved — blocks all store submissions
- Staging reconciliation not run — blocks production billing claims
- Placeholder icons — blocks CWS submission

---

## How to Report Issues

- File a GitHub issue on this branch with label `internal-beta`
- Include: OS, Chrome version, exact repro steps, console errors, network errors
- Do NOT include: ChatGPT prompt/response text, personal data, API keys, screenshots with personal content

---

## Rollback Instructions

1. Disable the extension in Chrome: `chrome://extensions` → disable PromptProfit
2. The extension is loaded unpacked or via ZIP — no uninstall of a store listing is required
3. Service worker can be stopped from `chrome://extensions` → Details → Service worker → Unregister

---

## Rollout Execution Docs

The following documents are ready for use in the active beta rollout:

| Document | Purpose |
|----------|---------|
| [TESTER_INVITATION_TEMPLATES.md](./TESTER_INVITATION_TEMPLATES.md) | 7 message templates for inviting testers and following up |
| [TESTER_QUICK_START_CHECKLIST.md](./TESTER_QUICK_START_CHECKLIST.md) | Short install + test checklist (Track A: product, Track B: engineer) |
| [FEEDBACK_INTAKE.md](./FEEDBACK_INTAKE.md) | Severity levels, bug template, privacy evidence policy, escalation rules |
| [ISSUE_TEMPLATES.md](./ISSUE_TEMPLATES.md) | 8 GitHub issue templates by type |
| [TRIAGE_LABELS.md](./TRIAGE_LABELS.md) | Full label set with triage and escalation rules |
| [FIRST_TESTER_DRY_RUN.md](./FIRST_TESTER_DRY_RUN.md) | Procedure for the first tester dry-run session |
| [BETA_ROLLOUT_SCHEDULE.md](./BETA_ROLLOUT_SCHEDULE.md) | Day 0-7 rollout schedule |
| [BETA_OWNER_CHECKLIST.md](./BETA_OWNER_CHECKLIST.md) | Role assignments and pre-beta sign-off |
| [ROLLBACK_AND_DISABLE_GUIDE.md](./ROLLBACK_AND_DISABLE_GUIDE.md) | Disable, remove, rollback, and incident response |
| [STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md](./STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md) | Fill-in-the-blank Day 6 stakeholder update |

Verify rollout packet: `pnpm -w run check:internal-beta-rollout`

### DRYRUN-001 Semi-Automated Conductor

| Command | When to Run |
|---------|------------|
| `pnpm -w run dryrun:001:prepare` | Before the tester session: checks, package, draft, human steps |
| `pnpm -w run dryrun:001:finalize` | After the session: interactive results recording |
| `pnpm -w run check:dryrun:001` | Anytime: validate DRYRUN-001 state |
| `pnpm -w run dryrun:001:diagnose` | When banner not observed: check dist/, ZIP, manifest, Chrome load path |

These commands automate all safe owner-side steps. ChatGPT interaction, login, and tester
observation remain human-only and cannot be automated.

---

## Go/No-Go Table

| Gate | Status | Notes |
|------|--------|-------|
| Internal beta distribution | GO | All internal-beta checks pass |
| First tester dry-run | READY | See FIRST_TESTER_DRY_RUN.md |
| Public beta / CWS submission | HOLD | LICENSE, icons, staging reconciliation required |
| Production billing | HOLD | Staging must pass first |
| VS Code Marketplace | HOLD | LICENSE and source-map confirmation required |
