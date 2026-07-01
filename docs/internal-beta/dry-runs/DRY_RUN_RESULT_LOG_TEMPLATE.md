# PromptProfit -- Dry-Run Result Log Template

**Dry-Run ID:** [DRYRUN-NNN]
**Status: NOT RUN**
**Date:** [DATE TBD] | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

> INSTRUCTIONS: Copy this template once per dry-run session.
> Rename the copy: DRY_RUN_RESULT_LOG_DRYRUN-NNN.md
> Replace all [PLACEHOLDER] values. Do NOT delete the privacy rules section.
> Allowed status values: NOT RUN / PASS / PASS WITH ISSUES / BLOCKED / FAILED

---

## 1. Summary

| Field | Value |
|-------|-------|
| Dry-Run ID | [DRYRUN-NNN] |
| Date | [DATE TBD] |
| Tester | [TESTER TBD] |
| Tester Track | [Track A -- non-engineer / Track B -- engineer] |
| Owner | [OWNER TBD] |
| Release Commit | [COMMIT TBD] |
| Package Artifact | [e.g. promptprofit-browser-beta-2026-07-01T...zip] |
| Package Audit | [PASS / FAIL] |
| Overall Status | NOT RUN |
| Decision | PENDING |

---

## 2. Status

**Current Status: NOT RUN**

Allowed values:

| Status | Meaning |
|--------|---------|
| NOT RUN | Session not yet executed |
| PASS | All exit criteria met; no blocking issues |
| PASS WITH ISSUES | Session completed; minor issues found; go decision possible |
| BLOCKED | Session could not complete due to a blocking issue |
| FAILED | Critical issue found; stop distribution; rollback required |

---

## 3. Environment

| Field | Value |
|-------|-------|
| OS | [TBD] |
| Chrome Version | [TBD] |
| VS Code Version | [TBD -- if tested] |
| Node.js Version | [TBD -- engineers only] |
| pnpm Version | [TBD -- engineers only] |
| Docker Running | [Yes / No / N/A] |
| VPN Active | [Yes / No] |
| Other Extensions | [List or None] |

---

## 4. Commands Run (Engineer Track)

List every command run and its exit code:

| Command | Exit Code | Notes |
|---------|-----------|-------|
| pnpm install --frozen-lockfile | [TBD] | |
| pnpm -r build | [TBD] | |
| pnpm --filter @ad-alt/browser-extension test:unit | [TBD] | |
| pnpm --filter @ad-alt/browser-extension test:e2e | [TBD] | |
| pnpm -w run check:secrets:local | [TBD] | |
| pnpm -w run package:browser:beta | [TBD] | |
| pnpm -w run package:browser:zip:audit -- --mode internal-beta | [TBD] | |
| pnpm -w run smoke:billing:local | [TBD or N/A] | |
| pnpm -w run smoke:billing:click:local | [TBD or N/A] | |

---

## 5. Package Artifacts Used

| Artifact | Source | Passed Audit |
|----------|--------|-------------|
| Browser extension ZIP | apps/browser-extension/dist-package/ | [Yes / No / TBD] |
| VSIX | apps/extension/ | [Yes / No / N/A] |

---

## 6. Tester Actions

Describe what the tester did in sequence. Do NOT include ChatGPT prompt/response content
except the approved safe prompt.

1. [ACTION]
2. [ACTION]
3. Used safe prompt: "Count slowly from 1 to 10." (approved)
4. [ACTION]
...

---

## 7. Observed Results

Describe what was observed. No personal data. No ppft_ keys. No ChatGPT content.

| Observation | Result |
|-------------|--------|
| Extension loaded in Chrome | [YES / NO / TBD] |
| Extension icon appeared in toolbar | [YES / NO / TBD] |
| Overlay banner appeared during response | [YES / NO / TBD] |
| Banner content: placeholder only (no real data) | [YES / NO / TBD] |
| Banner close button worked | [YES / NO / TBD] |
| No personal data in banner | [YES / NO / TBD] |
| Disable turned off banner | [YES / NO / TBD] |
| Remove uninstalled cleanly | [YES / NO / TBD] |

Additional notes (no personal data, no ppft_ keys, no ChatGPT content):
[FREE TEXT]

---

## 8. Issues Found

List all issues observed. Use ISSUE_TEMPLATES.md for each filed issue.

| # | Title | Severity | Area | Status | GitHub Issue # |
|---|-------|----------|------|--------|----------------|
| 1 | [TBD] | [S0/S1/S2/S3/S4] | [area] | [status] | [#NNN or TBD] |

If no issues found: "No issues found during this dry-run session."

---

## 9. Privacy and Security Observations

- Were any privacy rules violated during the session? [YES / NO]
- Was any ppft_ key visible in any shared output? [YES / NO]
- Did the tester share any ChatGPT prompt or response content? [YES / NO]
- Did any screenshot contain personal or private data? [YES / NO]
- Did any network request contain forbidden fields (promptText, pageUrl, domText, chatHistory, cookies)? [YES / NO]
- Any S0 event triggered? [YES / NO]

If any answer is YES: describe action taken (redact, rotate key, notify Privacy Owner):
[DESCRIBE]

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**

---

## 10. Billing and Ledger Observations

Applicable only if billing smoke was run (requires Docker).

- Billing smoke run: [YES / NO]
- Invariant holds: developer_credit + platform_fee == advertiser_charge: [YES / NO / N/A]
- Click billing invariant holds: [YES / NO / N/A]
- Any billing anomaly observed: [YES / NO / describe]

---

## 11. Rollback / Uninstall Result

- Disable procedure tested: [YES / NO]
- Disable verified (no banner after disabling): [YES / NO]
- Remove procedure tested: [YES / NO]
- Remove verified (extension gone from chrome://extensions): [YES / NO]
- Full rollback triggered: [YES / NO] (reason if yes: [DESCRIBE])

---

## 12. Tester Feedback

Record tester observations without including personal data or ChatGPT content.

- Experience rating (1-5): [TBD]
- Steps that caused confusion: [LIST]
- Errors or unexpected behaviors: [LIST]
- Top 3 feedback items:
  1. [TBD]
  2. [TBD]
  3. [TBD]
- Tester's overall assessment: [TBD]

---

## 13. Triage Outcome

Triage completed: [YES / NO]

| Issue # | Severity | Priority | Assigned To | Target Fix |
|---------|----------|----------|-------------|-----------|
| [#NNN] | [S0-S4] | [P0-P3] | [OWNER TBD] | [DATE TBD] |

---

## 14. Next Action

Based on this dry-run result:

| Next Action | Details | Owner | Target Date |
|-------------|---------|-------|------------|
| [e.g. Proceed to Day 2-3 small beta] | [TBD] | [OWNER TBD] | [DATE TBD] |

---

## 15. Sign-Off Table

| Role | Approved | Date |
|------|---------|------|
| Dry-Run Owner | [YES / NO / TBD] | [DATE TBD] |
| QA Owner | [YES / NO / TBD] | [DATE TBD] |
| Privacy Owner | [YES / NO / TBD] | [DATE TBD] |
| Release Owner | [YES / NO / TBD] | [DATE TBD] |
