---
# PromptProfit — Stakeholder Decision Checklist

**Phase:** Pre-public-release | **Date:** 2026-07-01

This checklist records decisions required from product, legal, brand, and business stakeholders before public store submission. Engineering cannot proceed on these items without explicit stakeholder input.

---

## 1. LICENSE Decision

**Current status:** BLOCKED — no LICENSE file exists.

**Reference:** `docs/LICENSE_DECISION_REQUIRED.md`

> Engineering note: Do not choose a license as an engineering decision. This has product, legal, and business implications.

Options:

| Option | SPDX | CWS OK | Marketplace OK | Notes |
|--------|------|--------|---------------|-------|
| Proprietary (All Rights Reserved) | UNLICENSED | Yes (with declaration) | Yes | Cannot be forked; commercial use restricted |
| MIT | MIT | Yes | Yes | Free to fork/redistribute; no patent clause |
| Apache-2.0 | Apache-2.0 | Yes | Yes | Patent grant included; compatible with current deps |
| AGPL-3.0 | AGPL-3.0 | Possible | Yes | Network use triggers copyleft; NOT recommended for SaaS backend |
| Delayed | None | NO | NO | Blocks all store submission |

**Required action:**
- [ ] Stakeholder selects license
- [ ] Engineering adds `LICENSE` file to repo root
- [ ] Engineering updates all workspace `package.json` `license` fields
- [ ] Engineering runs `pnpm check:license` to verify consistency
- [ ] Decision recorded in `docs/LICENSE_DECISION_REQUIRED.md`

---

## 2. Final Brand Icons

**Current status:** BLOCKED — placeholder solid-blue icons present.

Placeholder icons (`icon16.png`, `icon48.png`, `icon128.png`) are 79–257 byte solid-color squares (#1D4ED8). They are programmatically generated and clearly identified as beta placeholders.

**Required action:**
- [ ] Design team creates final brand icons at 16×16, 48×48, 128×128 px (PNG, transparent background preferred)
- [ ] Icons reviewed and approved by brand/design stakeholder
- [ ] Engineering replaces placeholder files in `apps/browser-extension/icons/`
- [ ] Engineering runs `pnpm package:browser:zip:audit -- --mode public-release` to confirm non-placeholder icons pass

> Do not submit placeholder icons to the Chrome Web Store.

---

## 3. Chrome Web Store Listing

**Current status:** NOT STARTED.

Required:
- [ ] Extension name (max 45 characters)
- [ ] Short description (max 132 characters)
- [ ] Detailed description
- [ ] Category selection
- [ ] Screenshots (1280×800 or 640×400, no personal data)
- [ ] Promotional tile image (optional)
- [ ] Privacy policy URL (required by CWS)
- [ ] Developer/publisher account registered

---

## 4. VS Code Marketplace Listing

**Current status:** NOT STARTED.

Required:
- [ ] Extension display name
- [ ] Publisher account and publisher ID configured in `apps/extension/package.json`
- [ ] README for Marketplace (existing or separate)
- [ ] Category and tags
- [ ] Icon (128×128 px)
- [ ] License confirmed (depends on Decision 1)

---

## 5. Privacy Policy

**Current status:** NOT STARTED.

Both the Chrome Web Store and VS Code Marketplace require a publicly accessible privacy policy URL.

Required:
- [ ] Privacy policy document written and reviewed
- [ ] Privacy policy published at a stable public URL
- [ ] Privacy policy URL registered with CWS and Marketplace listings
- [ ] Privacy policy reflects actual data collection practices documented in `docs/CHATGPT_BROWSER_PRIVACY_SECURITY_AUDIT.md`

---

## 6. Support / Contact Email

**Current status:** NOT STARTED.

Required for:
- Chrome Web Store developer account
- VS Code Marketplace publisher account
- User bug report channel

- [ ] Support email address assigned and monitored

---

## 7. Source-Map Policy (VSIX)

**Current status:** ENGINEERING DECISION PENDING CONFIRMATION.

The `.vscodeignore` has been updated to exclude `dist/**/*.map`. The existing VSIX (`promptprofit-0.1.0.vsix`) still contains a source map because it was built before this change.

Required:
- [ ] Engineering rebuilds VSIX with updated `.vscodeignore`
- [ ] Engineering runs `pnpm package:vscode:vsix:audit -- --mode public-release` to confirm 0 maps
- [ ] Stakeholder confirms: source maps may NOT be included in the Marketplace VSIX (engineering default: exclude)

---

## 8. Staging Environment Approval

**Current status:** BLOCKED — no staging environment configured.

Required for production billing sign-off:
- [ ] Stakeholder approves provisioning of a staging environment
- [ ] Staging API deployed (separate from production)
- [ ] Staging database seeded with test campaigns
- [ ] Billing reconciler deployed to staging
- [ ] Engineering runs full reconciliation per `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md`

---

## 9. Billing Reconciliation Sign-Off

**Current status:** LOCAL ONLY — staging/production not run.

Required before production billing:
- [ ] Staging billing reconciliation complete and signed off (see `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md`)
- [ ] Fraud guard rules tested and approved
- [ ] Reviewer signs off on audit log in `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md`
- [ ] Rollback plan approved

---

## 10. Fraud/Risk Tolerance

**Current status:** UNDEFINED — no fraud mitigation implemented.

Required:
- [ ] Click fraud mitigation strategy defined (rate limits, dedup, threshold)
- [ ] Risk tolerance for impression fraud defined
- [ ] Fraud escalation path documented

---

## 11. Public Beta vs Private Beta Decision

**Current status:** UNDECIDED.

Options:
- **Private beta:** Controlled list of testers; no public listing
- **Public beta (unlisted CWS):** Anyone with link can install; still requires CWS approval
- **Public beta (listed CWS):** Full store listing; requires all public-release blockers resolved

- [ ] Stakeholder decides distribution approach

---

## 12. Launch Owner and Rollback Owner

Required before any public distribution:
- [ ] Launch owner identified (person who approves go/no-go)
- [ ] Rollback owner identified (person who can pull the release)
- [ ] Escalation path documented

---

## Decision Log

| Decision | Status | Decided By | Date | Notes |
|----------|--------|-----------|------|-------|
| LICENSE | PENDING | — | — | |
| Final icons | PENDING | — | — | |
| CWS listing | PENDING | — | — | |
| Marketplace listing | PENDING | — | — | |
| Privacy policy | PENDING | — | — | |
| Source-map policy | CONFIRMED (exclude) | Engineering | 2026-07-01 | .vscodeignore updated; re-build needed |
| Staging environment | PENDING | — | — | |
| Billing sign-off | PENDING | — | — | |
| Fraud tolerance | PENDING | — | — | |
| Beta approach | PENDING | — | — | |
| Launch owner | PENDING | — | — | |
