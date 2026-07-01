---
# PR Description Template

Use this template when opening a pull request from `claude/ecstatic-maxwell-h0d8d8` into the base branch.

---

## Summary

Internal beta release candidate for the PromptProfit ChatGPT browser adapter.

This PR contains:
- ChatGPT browser adapter: wait-state detection, sponsored moment rendering, viewability tracking, impression and click billing event pipeline
- Impression and click billing smoke tests with local Docker API
- Binary ledger invariant verification: developer_credit + platform_fee == advertiser_charge
- Artifact-level ZIP and VSIX content audits (pure Node.js, no external tools)
- License decision workflow (gated; no LICENSE created)
- Placeholder icon generation (documented as beta-only; requires brand review)
- Public-release hard gates (fail with exit 1 on unresolved blockers in --mode public-release)
- Internal beta release packet (docs/internal-beta/)

---

## Verified Checks

| Check | Result |
|-------|--------|
| check:ps1 (ASCII) | PASS 10/10 |
| check:secrets:local | PASS 333 files, 0 leaks |
| check:report-ascii | PASS |
| check:license (internal-beta) | PASS/WARN (no LICENSE — documented) |
| Fixture E2E | PASS 13/13 |
| Unit tests | PASS 105/105 |
| TypeScript + lint | PASS |
| Build | PASS |
| Impression billing smoke | PASS (local Docker) |
| Click billing smoke | PASS (local Docker) |
| Billing invariant | PASS (both smokes) |
| Browser beta ZIP audit | PASS (internal-beta) |
| VSIX artifact audit | PASS (internal-beta) |
| Beta packet check | PASS |

---

## Packages Produced

| Artifact | Location | Status |
|----------|----------|--------|
| Browser extension ZIP | `apps/browser-extension/dist-package/promptprofit-browser-beta-*.zip` | PASS — internal beta only |
| VS Code VSIX | `apps/extension/promptprofit-0.1.0.vsix` | PASS — internal beta only |

> Generated artifacts are NOT committed (gitignored).

---

## Privacy Guarantees

- No ChatGPT prompt or response text collected
- No page title, full URL, cookies, tokens, or auth data collected
- Events contain only backend-assigned IDs and anonymous extension metadata
- PrivacyGuard enforces forbidden fields on every outbound event
- 3 fixture E2E tests verify privacy compliance
- Secret scan: 333 files, 0 leaks

See `docs/internal-beta/PRIVACY_SECURITY_ONE_PAGER.md`.

---

## Billing Verification

| Item | Result |
|------|--------|
| Impression billing (local) | PASS |
| Click billing (local) | PASS |
| Billing invariant | PASS (both events) |
| Staging reconciliation | NOT RUN — blocked |
| Production billing | NOT CLAIMED |

See `docs/internal-beta/BILLING_VERIFICATION_SUMMARY.md`.

---

## Known Blockers (Public Release)

1. LICENSE decision required (stakeholder)
2. Final brand icons required (design)
3. VSIX source-map confirmation after next rebuild (engineering)
4. Staging billing reconciliation not run (ops)
5. Production billing not verified (ops)

Public-release gates correctly exit 1 for each blocker:
```bash
pnpm check:license -- --mode public-release          # FAIL: no LICENSE
pnpm package:browser:zip:audit -- --mode public-release  # FAIL: placeholder icons
pnpm package:vscode:vsix:audit -- --mode public-release  # FAIL: .js.map + no LICENSE
pnpm check:billing:reconciliation -- --mode public-release # FAIL: staging not run
```

---

## Reviewer Checklist

- [ ] No raw API keys (ppft_) in diff
- [ ] No generated artifacts committed (ZIP, VSIX, dist-package/)
- [ ] No page content reads in any changed file
- [ ] No new platform support added (Claude/Gemini/Desktop)
- [ ] Public-release blockers still documented and gated
- [ ] check:internal-beta-packet passes

---

## Screenshots / Evidence Policy

- Do NOT include screenshots with ChatGPT prompt or response text
- Do NOT include screenshots with personal data
- Console error screenshots are acceptable if redacted
- Test output (terminal) is acceptable

---

## Rollout Plan

Internal beta only:
1. Reviewer merges this PR
2. Release manager runs package:browser:beta and package:vscode:vsix:audit
3. ZIP and VSIX distributed to internal testers only
4. Testers install unpacked (Chrome) or via VSIX (VS Code)
5. No store submission

---

## Rollback Plan

1. Testers disable extension via chrome://extensions (immediate)
2. If merged: revert PR or cherry-pick fix
3. No CWS or Marketplace rollback needed (not published)
