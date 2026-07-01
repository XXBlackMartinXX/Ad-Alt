# PromptProfit -- First Tester Dry-Run Procedure

**INTERNAL BETA ONLY. Run this before inviting multiple testers.**
**Date:** 2026-07-01 | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

## Purpose

This document governs the first tester dry-run session. The dry run is a single controlled
session with ONE internal tester, completed before distributing the beta to a wider group.
Its purpose is to confirm that the install guide, test plan, feedback process, and rollback
procedure work end-to-end in a real (non-automated) session.

If the dry run reveals any S0 or S1 issue, do NOT proceed to wider beta distribution until
the issue is resolved and a re-run passes all exit criteria.

---

## Dry-Run Owner

**Dry-Run Facilitator:** [OWNER TBD]
**QA Observer (optional):** [OWNER TBD]

The dry-run owner schedules the session, provides the beta package, observes the tester
(without prompting), and captures the result checklist.

---

## Date and Time

**Date:** [DATE TBD]
**Time:** [TIME TBD]
**Duration:** Estimated 60-90 minutes
**Format:** In-person or video call (screen sharing preferred for observation)

---

## Tester Profile

The dry-run tester should be:
- An internal team member (engineer or product -- either track works)
- NOT the person who built the extension
- Has access to Chrome and a chatgpt.com account
- Has agreed to the internal beta terms (NDA or equivalent internal agreement)
- Has NOT already read the installation guide (to test it cold)

---

## Pre-Dry-Run Environment Checklist

The dry-run owner must complete this checklist BEFORE the session begins.

**Automated verification:**
- [ ] git branch --show-current -> claude/ecstatic-maxwell-h0d8d8 (confirmed)
- [ ] git log --oneline -3 -> 6145fc7 in the log (confirmed)
- [ ] pnpm -r build -> exit 0 (confirmed)
- [ ] pnpm --filter @ad-alt/browser-extension test:e2e -> 13/13 (confirmed)
- [ ] pnpm --filter @ad-alt/browser-extension test:unit -> 105/105 (confirmed)
- [ ] pnpm -w run check:secrets:local -> 0 leaks (confirmed)
- [ ] pnpm -w run package:browser:beta -> exit 0 (confirmed)
- [ ] pnpm -w run package:browser:zip:audit -- --mode internal-beta -> PASS (confirmed)
- [ ] pnpm -w run check:internal-beta-packet -> PASS (confirmed)
- [ ] pnpm -w run check:internal-beta-rollout -> PASS (confirmed)

**Distribution readiness:**
- [ ] Beta package ZIP is prepared and ready to share via secure internal channel
- [ ] ZIP confirmed: does NOT contain dist-test/, source maps, .env files, node_modules
- [ ] Tester has been briefed: this is internal beta only, not public release
- [ ] Tester has signed NDA or equivalent internal agreement
- [ ] Tester has received and read the privacy rules (PRIVACY_SECURITY_ONE_PAGER.md or summary)
- [ ] FIRST_TESTER_DRY_RUN.md is printed or available to the dry-run owner during the session

---

## Package Artifact to Use

Use the ZIP produced by:
  pnpm -w run package:browser:beta

Default output location: apps/browser-extension/dist-package/

**Do NOT distribute:**
- The dist/ directory directly (only for engineers with repo access)
- The dist-test/ directory (test fixture bundle -- NOT for beta distribution)
- Any VSIX file for Chrome browser testing
- Any ZIP that has not passed package:browser:zip:audit -- --mode internal-beta

---

## Tester Instructions

The tester follows TESTER_QUICK_START_CHECKLIST.md.
- Non-engineer testers: Track A.
- Engineer testers: Track B.

The dry-run owner observes silently unless the tester is completely stuck for more than
5 minutes on a single step. Note every point where the tester hesitates or asks a question
-- these are documentation gaps to fix.

---

## Expected Success Path

1. Tester receives the beta ZIP via secure channel.
2. Tester unzips to a local folder.
3. Tester opens chrome://extensions and enables Developer Mode.
4. Tester clicks "Load unpacked" and selects the dist/ folder.
5. Extension icon appears in Chrome; "PromptProfit" shows in extensions list.
6. Tester navigates to https://chatgpt.com.
7. Tester types the safe test prompt: Count slowly from 1 to 10.
8. While ChatGPT generates the response, a blue overlay/banner appears in the
   bottom-right of the viewport.
9. The banner displays: placeholder headline, body text, display URL.
10. Tester clicks the X button on the banner. Banner disappears immediately.
11. No personal data is visible anywhere in the banner content.
12. Tester disables the extension: chrome://extensions -> toggle OFF.
13. After disabling, no banner appears on the next ChatGPT prompt.
14. Tester files a test feedback report (even if everything worked).

---

## Safe Test Prompt

Testers must use ONLY this prompt during the dry run. Do not substitute another prompt.

  Count slowly from 1 to 10.

Rationale: This prompt causes ChatGPT to generate a slow, predictable response, giving
the tester time to observe the banner. It contains no personal or sensitive content.

Do NOT use:
- Real work prompts
- Prompts containing names, locations, or sensitive topics
- Prompts that generate content the tester does not want observed

---

## Validation Commands (Engineer Track Only)

If the tester is an engineer, ask them to run these and capture the sanitized output:

  pnpm -w run check:secrets:local
  # Expected: exit 0, 0 leaks

  pnpm --filter @ad-alt/browser-extension test:e2e
  # Expected: 13/13 pass

  pnpm -w run package:browser:zip:audit -- --mode internal-beta
  # Expected: PASS, exit 0

Attach sanitized output to the dry-run result issue (check for ppft_ keys before attaching).

---

## Feedback Capture Checklist (Dry-Run Owner Records)

Record these observations during or immediately after the session:

- [ ] Install succeeded without assistance: yes / no
- [ ] Tester found the Load unpacked step confusing: yes / no
- [ ] Banner appeared on first attempt: yes / no
- [ ] Banner content was clearly placeholder (not real data): yes / no
- [ ] Close button worked immediately: yes / no
- [ ] Disable worked (no banner after disabling): yes / no
- [ ] Track A guide was followable without engineering help: yes / no
- [ ] Steps where tester hesitated or asked questions: [list]
- [ ] Any error messages observed: [list]
- [ ] Privacy check: did tester accidentally share sensitive info? [describe any near-miss]
- [ ] Time spent on installation (minutes): [record]
- [ ] Time spent on testing (minutes): [record]
- [ ] Tester experience rating 1-5: [record]
- [ ] Tester's top 3 feedback items: [record]
- [ ] Tester filed a GitHub issue: yes / no (issue number: [record])

---

## Dry-Run Exit Criteria

ALL of the following must be true before inviting additional testers:

- [ ] Tester installed the package without direct repository access
- [ ] Tester completed the safe test prompt and observed the overlay banner
- [ ] No privacy leakage occurred (no ChatGPT content shared, no API key in logs)
- [ ] No raw ppft_ key appeared in any shared log or screenshot
- [ ] No S0 or S1 critical blocker was discovered during the session
- [ ] The installation guide was understandable without significant intervention
- [ ] The disable/remove procedure worked as documented
- [ ] Tester submitted feedback (a GitHub issue or written summary)

**If any exit criterion is NOT met:** do not proceed to wider beta. Resolve the issue, update
the relevant document, and schedule a follow-up dry run.

---

## Rollback Steps

If the dry run reveals an S0 or S1 issue:

1. Ask the tester to disable the extension immediately:
   chrome://extensions -> find PromptProfit -> toggle to OFF.
2. If the tester loaded from ZIP: chrome://extensions -> click Remove.
3. Do NOT share or file any log that contains personal data, ppft_ keys, or session tokens.
4. If S0: contact Privacy Owner via private channel. Do NOT file a public GitHub issue.
5. If S1: file a GitHub issue with beta:s1-blocker + status:needs-triage.
6. Do NOT invite additional testers until the issue is resolved and a re-run passes.

---

## Post-Dry-Run Triage Steps

After the session:
1. Review all feedback items collected during the session.
2. Triage each item using TRIAGE_LABELS.md.
3. File GitHub issues for all S0, S1, and S2 findings (use ISSUE_TEMPLATES.md).
4. Update BETA_ROLLOUT_SCHEDULE.md: fill in the Day 1 result.
5. Update BETA_OWNER_CHECKLIST.md: mark Day 1 sign-off.
6. Make the Day 1 go/no-go decision.
   - GO: proceed to Day 2-3 small beta.
   - NO-GO: resolve issues, re-run dry run.
7. Send the Completion / Thank-You message to the tester (see TESTER_INVITATION_TEMPLATES.md).

---

## Dry-Run Result Record

Fill this in after the session:

| Criterion | Result | Notes |
|-----------|--------|-------|
| Install succeeded | [TBD] | |
| Banner appeared | [TBD] | |
| Banner content correct (placeholder only) | [TBD] | |
| Close button worked | [TBD] | |
| Privacy clean (no leakage) | [TBD] | |
| No S0/S1 blocker | [TBD] | |
| Guide understandable | [TBD] | |
| Disable/remove worked | [TBD] | |
| Feedback filed | [TBD] | |
| **Overall: Go / No-Go** | **[TBD]** | |

**Facilitator sign-off:** [OWNER TBD] -- [DATE TBD]
