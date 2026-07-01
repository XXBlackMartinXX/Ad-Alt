---
# PromptProfit Internal Beta Release Notes

**Release:** Internal Beta 1
**Date:** 2026-07-01
**Commit:** `5979b4e`
**Label:** Internal beta release candidate; public release blockers documented and gated.

---

## What's in This Release

### ChatGPT Browser Adapter

The PromptProfit ChatGPT adapter detects when the ChatGPT model is generating a response (the "wait state") and renders a sponsored ad moment in an extension-owned overlay. The ad is dismissed automatically when the model finishes generating.

**Key capabilities verified in this release:**
- Wait-state detection: the extension identifies the correct moment to show an ad without reading page content
- Sponsored moment rendering: a banner is injected into an extension-owned UI overlay
- Viewability tracking: the viewability threshold fires after 5 seconds of exposure
- Kill switch: a server-side kill switch stops all events immediately when triggered
- Impression billing: a full billing ledger entry (advertiser_charge / developer_credit / platform_fee) is created per verified impression
- Click billing: a click event creates a 10x rate billing entry with the same invariant
- Privacy: no ChatGPT content, no URLs, no cookies, no personal data is ever read or transmitted

### VS Code Extension

An internal beta VSIX is available for manual installation. The VS Code extension is in early packaging stage.

### Beta Packaging and Audit Infrastructure

- Browser extension ZIP is created by `pnpm package:browser:beta` (excludes source maps)
- ZIP and VSIX contents are verified by artifact-level audit scripts that read binary archives directly
- All audit scripts support `--mode internal-beta` (warn) and `--mode public-release` (fail)

---

## Engineering Verification Summary

| Area | Status | Evidence |
|------|--------|---------|
| Fixture E2E (13/13) | PASS | Automated |
| Unit tests (105/105) | PASS | Automated |
| TypeScript/lint | PASS | Automated |
| Impression billing (local) | PASS | Smoke report + ledger query |
| Click billing (local) | PASS | Smoke report + ledger query |
| Privacy guard | PASS | 3 fixture E2E tests |
| Secret scan | PASS | 333 files, 0 leaks |
| ZIP artifact audit | PASS | Internal-beta mode |
| VSIX artifact audit | PASS | Internal-beta mode |

---

## Tester Instructions (Summary)

1. Build: `pnpm -r build`
2. Package: `pnpm -w run package:browser:beta`
3. Extract ZIP → Load unpacked in Chrome
4. Configure local API key
5. Navigate to chatgpt.com; submit a harmless generic prompt (e.g. "Count from 1 to 10")
6. Verify: ad overlay appears during model generation
7. Report issues without including prompt/response text or personal data

Full instructions: `docs/internal-beta/BETA_TESTER_INSTALLATION_GUIDE.md`

---

## Known Limitations

- **ChatGPT only.** No Claude, Gemini, Desktop, or other platform support.
- **Local API only.** Production API integration is not verified in this release.
- **Placeholder icons.** Browser extension icons are solid-color placeholders; not final brand assets.
- **No LICENSE file.** Distribution is restricted to internal testers pending a license decision.
- **Staging billing not verified.** Billing is verified with local Docker only; staging/production reconciliation has not been run.
- **ChatGPT UI drift.** If ChatGPT updates its DOM structure, adapter selectors may need updating.
- **VS Code Marketplace.** VSIX is for manual installation only; not submitted to the Marketplace.
- **No store listings.** No Chrome Web Store or VS Code Marketplace submission has been made.

---

## Blockers Before Public Release

| Blocker | Owner |
|---------|-------|
| LICENSE decision | Stakeholder/Legal |
| Final brand icons | Design |
| VSIX source-map confirmation | Engineering |
| Staging billing reconciliation | Ops/Billing |
| Production billing verification | Ops/Billing |

See `docs/internal-beta/STAKEHOLDER_DECISION_CHECKLIST.md` for decision tracking.
