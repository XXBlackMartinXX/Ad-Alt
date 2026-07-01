# PromptProfit -- Privacy-Safe Issue Capture Form

**For use during dry-run sessions. Copy one form per issue.**
**INTERNAL BETA ONLY. Branch:** claude/ecstatic-maxwell-h0d8d8

---

> BEFORE FILING: Verify ALL privacy checkboxes below are checked.
> Do NOT file this form without completing the Evidence Safety section.
> If this is an S0 issue: do NOT file publicly. Contact Privacy Owner directly.

---

## Issue Identification

- **Issue Title:** [Short, descriptive title -- no personal data in the title]
- **Captured During:** Dry-Run DRYRUN-[NNN] | Date: [DATE TBD]
- **Reporter:** [TESTER TBD]
- **Captured By:** [OWNER TBD]

---

## Severity and Priority

| Field | Value |
|-------|-------|
| Severity | [S0 Security/Privacy / S1 Blocker / S2 Major / S3 Minor / S4 Suggestion] |
| Priority | [P0 Immediate Stop / P1 Fix Before Next Beta / P2 Fix Before Release / P3 Backlog] |
| Area | [area:browser-extension / area:vscode-extension / area:billing-ledger / area:privacy / area:packaging / area:docs / area:windows-dx] |

Note: Any issue involving privacy, security, or a ppft_ key is automatically S0/P0 until
reviewed by the Privacy Owner.

---

## Environment

| Field | Value |
|-------|-------|
| OS | [TBD] |
| Chrome Version | [TBD] |
| Extension Version | [from chrome://extensions -> PromptProfit -> Details] |
| Extension Loaded From | [ZIP / dist/] |
| Node.js Version | [TBD or N/A] |

---

## Steps to Reproduce

1. [Action]
2. [Action]
3. [Include only the approved safe prompt if relevant: "Count slowly from 1 to 10."]
4. [Observed result]

---

## Expected Behavior

[What should have happened]

---

## Actual Behavior

[What actually happened -- no ChatGPT content, no personal data]

---

## Privacy and Security Impact

- Does this issue involve potential leakage of ChatGPT content? [YES / NO]
- Does this issue involve potential exposure of an API key? [YES / NO]
- Does this issue involve unexpected DOM reads? [YES / NO]
- Does this issue involve unexpected network requests? [YES / NO]
- Does this issue require immediate escalation (S0)? [YES / NO]

If any answer is YES: classify as S0 and contact Privacy Owner via private channel.
Do NOT file a public GitHub issue for S0 events.

---

## Billing and Ledger Impact

- Does this issue affect billing event generation? [YES / NO]
- Does this issue affect the billing invariant? [YES / NO]
  (invariant: developer_credit + platform_fee == advertiser_charge)
- If invariant is violated: [describe amounts without ppft_ key]

---

## Rollback Needed?

- [ ] YES -- initiate rollback per ROLLBACK_AND_DISABLE_GUIDE.md
- [ ] NO -- not blocking; proceed after filing

---

## Safe Evidence

Describe the evidence attached. Confirm it is privacy-safe before attaching.

| Evidence Type | Attached? | Privacy-Safe? |
|---------------|-----------|--------------|
| Screenshot of extension overlay only (no chat content) | [YES / NO / N/A] | [YES / NO] |
| Sanitized console log (ppft_ keys removed) | [YES / NO / N/A] | [YES / NO] |
| Sanitized network request structure (personal data removed) | [YES / NO / N/A] | [YES / NO] |
| Sanitized pnpm command output | [YES / NO / N/A] | [YES / NO] |

---

## Evidence Safety Verification

Complete ALL checkboxes before filing this form:

- [ ] No ChatGPT prompt text is included in this form or any attachment.
- [ ] No ChatGPT response text is included in this form or any attachment.
- [ ] No screenshot containing personal or private data is attached.
- [ ] No API key (ppft_ or other) is included in this form or any attachment.
- [ ] No .env file is attached.
- [ ] No cookies, tokens, or storage exports are included.
- [ ] No raw logs containing secret patterns are attached.
- [ ] No full browser URL (with session IDs) is included.
- [ ] All attached evidence has been manually reviewed for the above.

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**

---

## Triage Assignment

| Field | Value |
|-------|-------|
| Assigned To | [OWNER TBD] |
| Status | [needs-triage / needs-repro / accepted / blocked / fixed / wontfix-beta] |
| GitHub Issue # | [#NNN or TBD] |
| Target Fix Date | [DATE TBD or N/A] |
| Escalated To | [OWNER TBD or N/A] |

---

## Resolution

| Field | Value |
|-------|-------|
| Resolution | [TBD] |
| Resolved By | [OWNER TBD] |
| Resolved Date | [DATE TBD] |
| Verified By | [OWNER TBD] |
| Notes | [TBD] |
