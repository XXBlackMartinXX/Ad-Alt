---
# PromptProfit — Internal Beta Risk Register

**Date:** 2026-07-01 | **Branch:** `claude/ecstatic-maxwell-h0d8d8`

---

## Risk Table

| ID | Risk | Category | Severity | Likelihood | Current Mitigation | Remaining Action | Owner | Status |
|----|------|----------|----------|------------|-------------------|-----------------|-------|--------|
| R01 | LICENSE not chosen | Legal | HIGH | CERTAIN | Documented blocker; check:license gates public release | Stakeholder decision required before store submission | Product/Legal | BLOCKED FOR PUBLIC RELEASE |
| R02 | Placeholder icons used | Brand | HIGH | CERTAIN | Documented; audit warns in internal-beta; FAILs in public-release mode | Final brand assets required before CWS submission | Design | BLOCKED FOR PUBLIC RELEASE |
| R03 | Source maps in public VSIX | Packaging | HIGH | LIKELY | .vscodeignore updated; audit FAILs in public-release mode | Rebuild VSIX and confirm via package:vscode:vsix:audit --mode public-release | Engineering | BLOCKED FOR PUBLIC RELEASE |
| R04 | Staging billing reconciliation not run | Billing | HIGH | CERTAIN | Documented; check:billing:reconciliation FAILs in public-release mode | Run full staging reconciliation per PRODUCTION_BILLING_RECONCILIATION_PLAN.md | Billing/Ops | REQUIRES STAGING |
| R05 | Production billing not verified | Billing | HIGH | CERTAIN | Not claimed; matrix shows BLOCKED | Requires R04 staging to pass first | Billing/Ops | REQUIRES STAGING |
| R06 | ChatGPT UI selector drift | Adapter | MEDIUM | POSSIBLE | Fixture E2E tests cover selectors; selectors are DOM-structural (not text-based) | Monitor ChatGPT releases; update selectors when needed | Engineering | OPEN |
| R07 | Browser extension store review rejection | Publishing | MEDIUM | POSSIBLE | Internal beta only; no submission attempted | Resolve all blockers then submit to CWS review | Product | BLOCKED FOR PUBLIC RELEASE |
| R08 | Privacy regression | Privacy | HIGH | LOW | Privacy guard enforces forbidden fields; 3 E2E privacy fixture tests; secret scan on every commit | Re-run check:secrets:local and privacy fixture tests before any build | Engineering | MITIGATED FOR INTERNAL BETA |
| R09 | Local-only assumptions in scripts | DX | MEDIUM | POSSIBLE | Scripts validate PROMPTPROFIT_API_URL is localhost; exit 3 if production URL detected | Review scripts before staging deployment | Engineering | MITIGATED FOR INTERNAL BETA |
| R10 | Duplicate / replay billing | Billing | MEDIUM | POSSIBLE | eventId is per-event UUID; dedup reviewed in EVENT_LEDGER_DEDUP_REVIEW.md | Validate idempotency under load in staging | Billing/Ops | REQUIRES STAGING |
| R11 | Click fraud / rate-limit risk | Billing | HIGH | POSSIBLE | Click billing rate set at 10x impression; no rate-limit logic implemented yet | Define and implement click fraud mitigation before production | Billing/Ops | OPEN |
| R12 | API key leakage | Security | CRITICAL | LOW | ppft_ keys never printed; cleared post-run; secret scan on 333 files passes; CANARY 7 enforced | Maintain secret scan on every build | Engineering | MITIGATED FOR INTERNAL BETA |
| R13 | Windows PowerShell compatibility | DX | LOW | LOW | PS5.1 ASCII-only confirmed; StatusTag() helper fixes inline-if bug; check:ps1 passes 10/10 | Re-test on each PS1 change | Engineering | MITIGATED FOR INTERNAL BETA |
| R14 | Package artifact contamination | Packaging | HIGH | LOW | ZIP/VSIX artifact audits check for forbidden patterns; dist-package/ gitignored; CANARY 11 enforced | Run artifact audits before every tester handoff | Engineering | MITIGATED FOR INTERNAL BETA |
| R15 | Unsupported platform confusion | Product | MEDIUM | POSSIBLE | Docs and UI explicitly say ChatGPT-only; no Claude/Gemini/Desktop/Antigravity code paths enabled | Keep docs current; reject unsupported platform requests | Product | MITIGATED FOR INTERNAL BETA |
| R16 | Rollback difficulty | Operations | MEDIUM | LOW | Extension is unpacked / VSIX manually installed; disable or remove via chrome://extensions or VS Code | Document rollback steps in beta packet | Engineering | MITIGATED FOR INTERNAL BETA |
| R17 | Fraud guard not tested in staging | Billing | HIGH | CERTAIN | Not applicable to local Docker smoke | Run fraud guard validation in staging per PRODUCTION_BILLING_RECONCILIATION_PLAN.md | Billing/Ops | REQUIRES STAGING |

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| OPEN | Risk is known; no mitigation yet or mitigation insufficient |
| MITIGATED FOR INTERNAL BETA | Mitigation in place and sufficient for internal beta distribution |
| BLOCKED FOR PUBLIC RELEASE | Risk blocks public release; mitigation exists but decision/action outstanding |
| REQUIRES STAGING | Cannot be mitigated locally; requires staging/production environment |
| CLOSED | Risk resolved; no further action needed |

---

## Top Actions Required Before Public Release

1. **R01** — Get LICENSE decision from stakeholders
2. **R02** — Commission and approve final brand icons
3. **R03** — Rebuild VSIX and confirm source maps excluded
4. **R04 / R05 / R10 / R17** — Run full staging reconciliation and fraud guard tests
5. **R07** — Submit to CWS review after R01–R05 resolved
6. **R11** — Define click fraud mitigation strategy
