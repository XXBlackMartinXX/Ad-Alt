# PromptProfit -- Triage Labels

**INTERNAL BETA ONLY.**
**Date:** 2026-07-01 | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

## How to Apply Labels

Apply labels when triaging an incoming GitHub issue. Every issue must have:
- At minimum one severity label (beta:sN-...)
- At minimum one area label (area:...)
- release:internal-beta on every issue
- A status label (start with status:needs-triage for all new issues)

---

## Severity Labels

| Label | Suggested Color | Description |
|-------|----------------|-------------|
| beta:s0-privacy-security | #FF0000 (red) | Security or privacy incident -- immediate response required; stop beta if warranted |
| beta:s1-blocker | #FF6600 (orange) | Beta blocker -- prevents core functionality for all testers; fix same business day |
| beta:s2-major | #FFAA00 (amber) | Major issue -- significant usability or reliability problem; fix before next beta wave |
| beta:s3-minor | #FFDD00 (yellow) | Minor issue -- non-blocking, cosmetic, or low-frequency; add to backlog |
| beta:s4-suggestion | #AAAAAA (gray) | Suggestion or nit -- enhancement request; out of scope for beta fixes |

---

## Area Labels

| Label | Description |
|-------|-------------|
| area:browser-extension | Chrome extension behavior: overlay, banner, close button, service worker, timing |
| area:vscode-extension | VS Code extension packaging, activation, or functionality |
| area:billing-ledger | Impression or click billing events, ledger entries, invariant checks |
| area:privacy | Privacy guard behavior, data collection, event payload contents |
| area:packaging | ZIP or VSIX artifact contents, source map inclusion, dist hygiene |
| area:docs | Documentation gaps, errors, confusing steps, or broken links |
| area:windows-dx | Windows-specific installation, path handling, or developer experience |

---

## Status Labels

| Label | Description |
|-------|-------------|
| status:needs-triage | Newly filed -- not yet reviewed by triage owner |
| status:needs-repro | Cannot reproduce -- awaiting more detail or reproduction steps from reporter |
| status:accepted | Confirmed issue -- added to sprint or backlog |
| status:blocked | Blocked by a documented public-release blocker (LICENSE, icons, staging reconciliation) |
| status:fixed | Fix committed -- awaiting verification by reporter or QA |
| status:wontfix-beta | Known issue, will not fix during internal beta phase; documented |

---

## Release Labels

| Label | Description |
|-------|-------------|
| release:internal-beta | Filed during internal beta phase -- apply to every issue |
| release:public-blocker | Must be resolved before any public store submission |

---

## Out-of-Scope Label

| Label | Description |
|-------|-------------|
| out-of-scope:platform-expansion | Request for Claude, Gemini, Desktop, or other unsupported platform -- not in this release |

---

## Triage Rules

Apply these rules to every incoming issue. The triage owner is responsible for enforcement.

### Rule 1: Privacy/Security Issues Are P0 Until Reviewed
Any issue labeled beta:s0-privacy-security is P0 status until the Privacy Owner reviews it.
Do not close, dismiss, or mark wontfix without Privacy Owner sign-off.

### Rule 2: API Key Leaks Are P0 -- Stop Immediately
If any issue comment, attachment, screenshot, or log contains a ppft_ API key pattern:
1. Edit the comment or remove the attachment immediately.
2. Contact the Privacy Owner via private channel.
3. Do not continue triaging the issue until the key is confirmed revoked.
4. Do not comment on the issue publicly until the key is secured.

### Rule 3: Billing Invariant Failures Are P0/P1
If a tester reports: developer_credit + platform_fee != advertiser_charge:
1. Label: area:billing-ledger + beta:s1-blocker.
2. Notify the Billing Owner immediately.
3. Do not proceed with further billing smoke testing until the invariant is verified.

### Rule 4: Platform Expansion Requests Are Out of Scope
Any request for Claude, Gemini, Desktop adapter, or any platform not in this release:
1. Label: beta:s4-suggestion + out-of-scope:platform-expansion.
2. Do NOT escalate as a bug.
3. Do NOT add to the sprint for this release.
4. Politely acknowledge the request and explain it is out of scope for internal beta.

### Rule 5: All New Issues Get status:needs-triage First
No issue transitions from "filed" to "accepted" without a triage owner review.

### Rule 6: Documentation Issues Are S3 Unless They Block Install
If a documentation issue causes testers to be unable to install or run the extension:
escalate to beta:s2-major + release:public-blocker.

---

## Triage Checklist (Apply to Every New Issue)

- [ ] Correct severity label applied (beta:s0 through beta:s4)
- [ ] Correct area label applied (area:...)
- [ ] release:internal-beta applied
- [ ] status:needs-triage removed; status:needs-repro or status:accepted applied
- [ ] Privacy check: does the issue body or any comment contain a ppft_ API key,
      personal data, ChatGPT content, or session tokens? (If yes: redact immediately)
- [ ] If beta:s0: Privacy Owner notified; beta paused if warranted
- [ ] If billing invariant failure: Billing Owner notified
- [ ] If out-of-scope platform request: out-of-scope:platform-expansion applied; no sprint scheduling
- [ ] If blocked by documented blocker: status:blocked applied; note which blocker

---

## Triage Escalation Matrix

| Issue Type | Immediate Action | Owner |
|------------|----------------|-------|
| ppft_ key in any artifact | Remove key, notify Privacy Owner, consider key rotation | Privacy Owner |
| Personal data in issue | Redact immediately, notify reporter, notify Privacy Owner | Privacy Owner |
| ChatGPT content in report | Request reporter re-file without content, redact if present | Triage Owner |
| Billing invariant failure | Stop billing smoke, notify Billing Owner | Billing Owner |
| Extension reads page content | File S0, stop beta, investigate immediately | Privacy Owner |
| S1 blocker (all testers affected) | Notify QA Owner same business day | QA Owner |
| Cannot reproduce after 2 attempts | Apply status:needs-repro, ask reporter for more detail | Triage Owner |
