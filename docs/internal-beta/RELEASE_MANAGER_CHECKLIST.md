---
# PromptProfit — Release Manager Checklist

**Version:** Internal Beta 1 | **Date:** 2026-07-01

This checklist must be completed before distributing packages to internal beta testers.

---

## 1. Pre-Release Local Verification

```bash
pnpm install --frozen-lockfile
pnpm -w run check:ps1
pnpm -w run check:secrets:local
pnpm -w run check:report-ascii
pnpm -w run check:license -- --mode internal-beta
pnpm -w run smoke:chatgpt:fixture
pnpm --filter @ad-alt/browser-extension test:unit
pnpm -w run verify
pnpm -r build
```

Expected results:

| Check | Expected |
|-------|---------|
| check:ps1 | 10/10 ASCII-clean |
| check:secrets:local | 0 leaks / 333 files |
| check:report-ascii | All templates ASCII-clean |
| check:license (internal-beta) | Exit 0, WARN acceptable |
| smoke:chatgpt:fixture | 13/13 PASS |
| test:unit | 105/105 PASS |
| verify | 0 TS errors, 0 lint errors |
| build | All workspaces build clean |

- [ ] All pre-release checks passed

---

## 2. Billing Verification (requires Docker)

```bash
pnpm -w run smoke:billing:local
pnpm -w run smoke:billing:click:local
pnpm -w run check:billing:reconciliation -- --mode internal-beta
```

Expected: both smokes PASS; invariant confirmed; reconciliation gate PASS/WARN.

- [ ] Impression billing smoke: PASS
- [ ] Click billing smoke: PASS
- [ ] Billing invariant verified in both reports

---

## 3. Package Creation

```bash
pnpm -r build
pnpm -w run package:browser:beta
```

Browser extension ZIP located at:
```
apps/browser-extension/dist-package/promptprofit-browser-beta-<timestamp>.zip
```

VS Code extension VSIX:
```bash
pnpm --filter promptprofit package
```
Located at: `apps/extension/promptprofit-0.1.0.vsix`

- [ ] Browser extension ZIP created and non-empty
- [ ] VSIX created and non-empty

---

## 4. Package Audit

```bash
pnpm -w run package:browser:audit -- --mode internal-beta
pnpm -w run package:browser:zip:audit -- --mode internal-beta
pnpm -w run package:vscode:audit -- --mode internal-beta
pnpm -w run package:vscode:vsix:audit -- --mode internal-beta
```

Expected: all audits PASS.

- [ ] Browser package audit: PASS
- [ ] Browser ZIP artifact audit: PASS
- [ ] VS Code package audit: PASS
- [ ] VSIX artifact audit: PASS

---

## 5. Beta Packet Completeness

```bash
pnpm -w run check:internal-beta-packet
```

Expected: all required docs present, no overclaiming detected.

- [ ] Beta packet check: PASS

---

## 6. Privacy Review

- [ ] check:secrets:local: 0 leaks
- [ ] No API keys in ZIP (confirmed by ZIP audit)
- [ ] No API keys in VSIX (confirmed by VSIX audit)
- [ ] Privacy one-pager reviewed: `docs/internal-beta/PRIVACY_SECURITY_ONE_PAGER.md`
- [ ] Tester instructions include privacy warning

---

## 7. Billing Review

- [ ] Billing verification summary reviewed: `docs/internal-beta/BILLING_VERIFICATION_SUMMARY.md`
- [ ] Production billing not claimed anywhere in handoff docs
- [ ] Staging reconciliation status documented as NOT RUN

---

## 8. Known Blockers Review

Confirm the following are documented and gated:

- [ ] LICENSE missing — public-release check FAILs
- [ ] Placeholder icons — public-release ZIP audit FAILs
- [ ] VSIX source maps — public-release VSIX audit FAILs (existing VSIX)
- [ ] Staging reconciliation not run — public-release check FAILs

Verify public-release checks still fail correctly:
```bash
pnpm -w run check:license -- --mode public-release           # expect exit 1
pnpm -w run package:browser:zip:audit -- --mode public-release  # expect exit 1
pnpm -w run package:vscode:vsix:audit -- --mode public-release  # expect exit 1
pnpm -w run check:billing:reconciliation -- --mode public-release # expect exit 1
```

- [ ] All public-release checks fail for correct documented reasons

---

## 9. Artifact Hygiene

Confirm these are NOT committed:

- [ ] `apps/browser-extension/dist-package/` not in git
- [ ] No .zip files committed
- [ ] No .vsix files committed (except intentional beta VSIX if applicable)
- [ ] No test-results committed
- [ ] No dist/ committed
- [ ] No .env files committed
- [ ] No raw ppft_ keys committed

---

## 10. Rollback Readiness

- [ ] Rollback instructions in README reviewed and accurate
- [ ] Extension can be disabled via chrome://extensions without code changes
- [ ] VSIX can be uninstalled from VS Code Extensions panel

---

## 11. Post-Test Triage

After beta testers submit reports:
- [ ] Triage each bug report for forbidden content (API keys, personal data)
- [ ] Redact any forbidden content before adding to issue tracker
- [ ] Classify: UI regression, billing regression, privacy concern, or DX issue
- [ ] Privacy concerns escalated immediately

---

## 12. Go / No-Go Decision

| Decision | Gate | Status |
|----------|------|--------|
| GO for internal beta distribution | All sections 1–10 pass | CONFIRM BELOW |
| HOLD for public beta / CWS submission | LICENSE + icons + staging resolved | BLOCKED |
| HOLD for production billing | Staging reconciliation + sign-off | BLOCKED |

**Release manager sign-off:**

- [ ] I confirm all internal-beta checks pass
- [ ] I confirm no generated artifacts or secrets are committed
- [ ] I confirm public-release blockers are documented and gated
- [ ] I confirm billing smoke passed locally
- [ ] I confirm production billing is NOT claimed

**Sign-off:** _________________________ | **Date:** _________________________
