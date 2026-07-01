# PromptProfit -- Internal Beta Tester Invitation Templates

**For internal use only. Do NOT distribute outside the team.**
**Date:** 2026-07-01 | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

## How to Use These Templates

- Replace ALL [PLACEHOLDERS] before sending. No placeholder should survive in a sent message.
- Do NOT send automatically. Review each message individually before sending.
- Do NOT send to anyone who has not signed an NDA or equivalent internal agreement.
- These are internal-only communications. Do not forward externally.
- Remove the "[ Subject: ... ]" line and put the subject in your email/message subject field.

---

## Template 1: Short Invitation Message

[Subject: You are invited -- PromptProfit Internal Beta]

Hi [TESTER_NAME],

We are running a small internal beta for PromptProfit, a ChatGPT browser adapter. This is an
INTERNAL BETA ONLY -- it is NOT a public release, and it is NOT available on the Chrome Web Store
or VS Code Marketplace. We would like your help testing it before we move toward public release.

The session takes approximately 30-45 minutes. Installation is straightforward. You will receive
a separate installation guide with step-by-step instructions.

To participate, reply to this message by [DATE TBD] and I will send you the package and instructions.

Privacy note: Do not share ChatGPT prompt text, response text, screenshots containing personal
or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.

Thank you,
[SENDER_NAME]
[SENDER_ROLE]

---

## Template 2: Technical Tester Invitation

[Subject: PromptProfit Internal Beta -- Technical Tester Invitation]

Hi [TESTER_NAME],

You are invited to participate in an internal engineering beta for PromptProfit, a ChatGPT
browser adapter. This is an INTERNAL BETA. It is NOT a public release. It is NOT on the
Chrome Web Store or VS Code Marketplace.

Expected time commitment: 60-90 minutes, including installation, validation commands, and
filing a brief feedback report.

What you will test:
- ChatGPT browser adapter overlay behavior (banner display, close button, timing)
- Viewability event firing
- Impression and click billing events (requires Docker -- optional)
- Extension install and uninstall procedure

What you must NOT test:
- Claude, Gemini, Desktop, or any other platform adapter (not implemented in this release)
- Production API (only local Docker API is supported for this beta)
- Automating ChatGPT login or prompt submission
- Any ChatGPT features unrelated to the extension overlay

How to report issues:
File a GitHub issue on the repository with label: release:internal-beta
Use the FEEDBACK_INTAKE.md template when filing.

Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.

I will send you the package ZIP and TESTER_QUICK_START_CHECKLIST.md once you confirm.

Please confirm by replying to this message by [DATE TBD].

Thank you,
[SENDER_NAME]
[SENDER_ROLE]

---

## Template 3: Product/Stakeholder Reviewer Invitation

[Subject: PromptProfit Internal Beta -- Product Review Invitation]

Hi [TESTER_NAME],

We would like to invite you to review PromptProfit as a product stakeholder. PromptProfit is
a ChatGPT browser adapter currently in INTERNAL BETA. This is NOT a public release. It is NOT
on the Chrome Web Store.

This is a no-code review. You will install the extension from a ZIP file using Chrome's
developer mode and observe how it behaves during a ChatGPT session.

Expected time commitment: 30-45 minutes.

What you will observe:
- Whether the sponsored moment overlay appears at the right time (while ChatGPT is responding)
- Whether the overlay text is clear and appropriately displayed
- Whether the close button works as expected
- Whether the extension is unobtrusive when not active

What you should NOT do:
- Test Claude, Gemini, or any other platform (only ChatGPT is supported in this release)
- Use real work-related prompts that contain sensitive information
- Share any ChatGPT conversation content as part of your feedback

How to report your observations:
Reply to this message or use the feedback form I will provide. No GitHub account required.

Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.

I will send you the package and a simple one-page install guide.

Please confirm your participation by [DATE TBD].

Thank you,
[SENDER_NAME]
[SENDER_ROLE]

---

## Template 4: Follow-Up Reminder

[Subject: Reminder -- PromptProfit Internal Beta Invitation]

Hi [TESTER_NAME],

Just a quick reminder about the PromptProfit internal beta invitation I sent on [DATE SENT].

This is an INTERNAL BETA only -- not a public release. The session takes approximately
30-45 minutes and your feedback would be very helpful.

If you are interested, please reply by [NEW DEADLINE DATE] and I will send you the package
and instructions.

If you are unable to participate at this time, no problem at all -- just let me know and
I will remove you from the list.

Thank you,
[SENDER_NAME]
[SENDER_ROLE]

---

## Template 5: Completion / Thank-You Message

[Subject: Thank you -- PromptProfit Internal Beta]

Hi [TESTER_NAME],

Thank you for completing the PromptProfit internal beta session. Your feedback is valuable
as we continue to develop this product.

Summary of what you tested:
- PromptProfit ChatGPT browser adapter, INTERNAL BETA 1
- Branch: claude/ecstatic-maxwell-h0d8d8
- Date tested: [DATE TBD]

Next steps:
- We will triage all feedback received and respond to any issues you filed within [TIME FRAME].
- The beta package you received is for internal use only. Please do not share it externally.
- If you discover any additional issues after your session, please file them as GitHub issues
  with label: release:internal-beta.

Reminder: Do not share any session artifacts (screenshots, logs, the ZIP package) outside
the team. Do not share ChatGPT prompt text, response text, screenshots containing personal
or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.

Thank you again for your time.

[SENDER_NAME]
[SENDER_ROLE]

---

## Template 6: Bug-Report Request Message

[Subject: PromptProfit Beta -- Following Up on Your Report]

Hi [TESTER_NAME],

Thank you for filing issue #[ISSUE_NUMBER]: [ISSUE_TITLE].

To help us reproduce and fix this issue, could you please provide:

1. Exact steps to reproduce (numbered, starting from a fresh browser session)
2. Chrome version (from chrome://settings/help)
3. OS and version
4. Extension version (from chrome://extensions)
5. Frequency: does this happen every time, sometimes, or only once?

If you have a sanitized screenshot or log:
- Remove or blur any ChatGPT prompt/response text before attaching.
- Check that no ppft_ API keys or other secrets are visible.
- Only attach if doing so is safe (see FEEDBACK_INTAKE.md for guidance).

Privacy reminder: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.

Thank you,
[SENDER_NAME]
[SENDER_ROLE]

---

## Template 7: Privacy-Safe Evidence Reminder

[Subject: PromptProfit Beta -- Evidence Safety Reminder]

Hi [TESTER_NAME],

Before you capture any screenshots, logs, or other evidence during your beta session,
please read this reminder.

WHAT IS SAFE TO SHARE:
- Screenshots showing ONLY the extension overlay/banner (no chat text visible).
- Chrome DevTools Network tab request structure (blur or remove any personal data fields).
- Console error messages that do not contain API keys or tokens.
- Sanitized pnpm command output (checked for ppft_ keys).

WHAT IS NEVER SAFE TO SHARE:
- Any ChatGPT prompt you typed.
- Any ChatGPT response text.
- Full browser screenshots that include the URL bar (it may contain session IDs).
- .env files or any file containing API keys.
- Browser storage (cookies, localStorage, sessionStorage).
- Any file containing ppft_ key patterns.

Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.

If you are unsure whether something is safe to share, ask before attaching it to a report.

Thank you,
[SENDER_NAME]
[SENDER_ROLE]
