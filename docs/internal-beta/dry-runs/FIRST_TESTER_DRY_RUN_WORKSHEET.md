# PromptProfit -- First Tester Dry-Run Worksheet

**Dry-Run ID:** DRYRUN-001
**Status: BLOCKED -- see DRYRUN-001_RESULT_LOG.md (decision: HOLD)**
**Branch:** claude/ecstatic-maxwell-h0d8d8

> Rerun after commit 682276f: `pnpm -w run dryrun:001:selftest` PASSED before this session
> (banner confirmed to render in the packaged artifact via demo mode, no API config needed).
> The real ChatGPT session still did NOT show the banner -- this is a CONFIRMED S1/P1 blocker
> (DRYRUN-001-ISSUE-001), not an inconclusive/setup result. See "Triage Correction" in that issue
> file: an earlier pass had misclassified this at S4/P3, which is incorrect.

---

> This worksheet is PREPARED but not yet executed.
> A human tester and a dry-run owner must run this session together.
> Do NOT mark any checkbox as complete unless the action physically happened.
> Do NOT automate ChatGPT login or prompt entry.

---

## Session Identification

| Field | Value |
|-------|-------|
| Dry-Run ID | DRYRUN-001 |
| Date | [DATE TBD] |
| Start Time | [TIME TBD] |
| End Time | [TIME TBD] |
| Release Commit | [COMMIT TBD] (expected: 9adb441 or later) |
| Package Artifact | [ARTIFACT PATH TBD] |
| Package Audit Passed | [YES / NO / TBD] |
| Format | [In-person / Video call with screen share / TBD] |

---

## Participants

| Role | Name |
|------|------|
| Dry-Run Owner / Facilitator | [OWNER TBD] |
| QA Observer | [OWNER TBD] |
| Tester | [TESTER TBD] |
| Tester Role | [Non-engineer (Track A) / Engineer (Track B)] |

---

## Tester Environment

| Field | Value |
|-------|-------|
| OS | [e.g. Windows 11 22H2 / macOS 14.5 / Ubuntu 22.04] |
| Chrome Version | [e.g. 126.0.0.6478.127 -- from chrome://settings/help] |
| VS Code Version | [e.g. 1.90.0 -- from Help -> About, if testing VSIX] |
| Node.js Version | [e.g. v22.2.0 -- engineers only] |
| pnpm Version | [e.g. 9.4.0 -- engineers only] |
| Docker Running | [Yes / No / N/A] |
| VPN Active | [Yes / No] |
| Other Chrome Extensions Active | [List or "None"] |
| Extension Loaded From | [ZIP (load unpacked) / dist/ directly] |

---

## PRE-RUN CHECKLIST (Dry-Run Owner Completes Before Session)

Verify all automated checks pass before distributing the package:

- [ ] git branch --show-current -> claude/ecstatic-maxwell-h0d8d8
- [ ] git log --oneline -1 -> 9adb441 or later
- [ ] pnpm -r build -> exit 0
- [ ] pnpm --filter @ad-alt/browser-extension test:unit -> all pass
- [ ] pnpm -w run check:secrets:local -> 0 leaks
- [ ] pnpm -w run package:browser:beta -> exit 0
- [ ] pnpm -w run package:browser:zip:audit -- --mode internal-beta -> PASS
- [ ] pnpm -w run check:internal-beta-packet -> PASS
- [ ] pnpm -w run check:internal-beta-rollout -> PASS
- [ ] pnpm -w run dryrun:001:selftest -> PASS (packaged artifact renders banner without API config)
- [ ] pnpm -w run dryrun:001:live-checklist -> read and shared with the tester
- [ ] Beta ZIP confirmed: does NOT contain dist-test/, .js.map, .env, node_modules
- [ ] Beta ZIP confirmed: DOES contain manifest.json, background/service-worker.js, content/chatgpt.js, icons/
- [ ] Tester has agreed to NDA or internal beta terms
- [ ] Tester has read privacy rules (PRIVACY_SECURITY_ONE_PAGER.md or summary provided)
- [ ] Tester instructed to unzip into a NEW folder (not a folder reused from a previous attempt)
- [ ] Beta ZIP delivered to tester via secure internal channel (NOT unencrypted email or public link)
- [ ] FIRST_TESTER_DRY_RUN_WORKSHEET.md is available to owner during session
- [ ] Tester confirmed they have a chatgpt.com account and CAN log in before starting
- [ ] Owner has shared TROUBLESHOOTING_BANNER_NOT_OBSERVED.md (or summary) with tester

**Pre-Run Checklist Completed By:** [OWNER TBD] -- [DATE TBD]

---

## INSTALL CHECKLIST (Observed During Session)

Track A (Non-engineer) steps:

- [ ] Tester received the beta ZIP
- [ ] Tester unzipped to a local folder
- [ ] Tester opened chrome://extensions
- [ ] Tester enabled Developer Mode toggle
- [ ] Tester clicked "Load unpacked" -> selected the extracted ZIP root folder (the folder containing manifest.json directly, NOT the dist/ subfolder)
- [ ] Extension "PromptProfit" appeared in the extensions list
- [ ] Extension toggle is ON (blue)
- [ ] No error badge (red exclamation) on extension icon

Track B additions (Engineer):

- [ ] git checkout claude/ecstatic-maxwell-h0d8d8 succeeded
- [ ] pnpm install --frozen-lockfile succeeded
- [ ] pnpm -r build succeeded
- [ ] pnpm --filter @ad-alt/browser-extension test:unit -> all pass
- [ ] pnpm --filter @ad-alt/browser-extension test:e2e -> all pass

**Install Notes:**
[Record any confusion, errors, or steps that needed explanation]

---

## PRIMARY CHECK: Forced Demo Fallback (No Login, No Prompt Required)

The internal-beta demo banner renders deterministically within a few seconds of the
chatgpt.com page loading -- it does NOT wait for ChatGPT to generate a response, and does
NOT require the tester to be logged in. Do this check FIRST, before the login-dependent
secondary check below.

- [ ] Tester navigated to https://chatgpt.com in a NEW tab (opened AFTER loading the extension)
- [ ] Banner appeared in the bottom-right corner within ~5-10 seconds, with NO prompt sent
- [ ] Banner content is placeholder only (no real ad, no personal data)
- [ ] Close button works

If the banner did NOT appear here: STOP and record the diagnostics panel status line
(see below) before proceeding. Do not assume login is the cause -- it is not required for
this check.

---

## SAFE TEST CHECKLIST (Optional Secondary Check -- Normal Wait-State Path)

**Approved test prompts -- use the RECOMMENDED one for this rerun:**

  RECOMMENDED: Count slowly from 1 to 100, one number per line.
  Also approved (shorter, original DRYRUN-001 prompt): Count slowly from 1 to 10.

The longer prompt is recommended because it gives more time to observe the banner --
a very short generation can complete before the ad-decision round-trip finishes.

**Forbidden prompts:** any prompt containing personal data, work content, or sensitive information.
No prompt other than the two above is allowed.

**LOGGED-IN PREREQUISITE (only needed for this secondary check, not the primary check above):**
- [ ] Tester confirmed they are logged into chatgpt.com (no "Log in" / "Sign up" visible)
  If NOT logged in: have tester log in first. This secondary check requires a real,
  authenticated ChatGPT generation to exercise the normal wait-state path.

**What you should see (banner description for the owner's reference):**
While ChatGPT is generating (the streaming phase), watch the BOTTOM-RIGHT corner.
A small rectangular overlay banner should appear with:
  - Placeholder headline text
  - Placeholder body line
  - Placeholder display URL
  - An X (close) button
The banner is NOT a real advertisement. It is placeholder content for internal testing only.
If no banner appears within 5 seconds of the response starting: record "banner not observed."

**Live dry-run diagnostics panel (internal-beta only, top-left corner):**
If visible, read its status line and `last_error_code` and record them EXACTLY here instead
of guessing at a cause. It never shows ChatGPT content. See TROUBLESHOOTING_BANNER_NOT_OBSERVED.md
for the full status-line legend.

Diagnostics panel status line observed: ______________________________________
Diagnostics panel last-error value observed: __________________________________

- [ ] Tester navigated to https://chatgpt.com (new tab, opened AFTER loading the extension) and confirmed they are logged in
- [ ] Tester opened a NEW chat (click "New chat" in sidebar -- NOT an existing conversation)
- [ ] Tester typed exactly: Count slowly from 1 to 100, one number per line.
- [ ] Tester pressed Enter / sent the prompt
- [ ] Owner/tester both watched the BOTTOM-RIGHT corner during ChatGPT generation
- [ ] While ChatGPT was generating, an overlay banner appeared in the bottom-right viewport area
- [ ] Banner showed: placeholder headline text
- [ ] Banner showed: placeholder body text
- [ ] Banner showed: placeholder display URL
- [ ] Banner showed: a close (X) button
- [ ] No ChatGPT response text or prompt text was visible inside the banner
- [ ] No ppft_ key pattern was visible anywhere in the browser UI
- [ ] Tester clicked the X button
- [ ] Banner disappeared immediately
- [ ] Tester confirmed: no personal data was visible in the banner content

**Observation Notes (owner records -- no ChatGPT content):**
[Record only extension behavior, not ChatGPT content]

---

## BILLING SMOKE CHECKLIST (Engineer Track Only -- Optional)

Requires Docker running locally.

- [ ] docker compose up -d succeeded
- [ ] pnpm -w run smoke:billing:local completed without error
- [ ] Billing invariant held: developer_credit + platform_fee == advertiser_charge
- [ ] pnpm -w run smoke:billing:click:local completed without error
- [ ] Click billing invariant held
- [ ] No ppft_ key visible in smoke output (sanitized before capture)

If NOT run: note reason: [e.g. Docker not available / time constraint / not required for Track A]

---

## FEEDBACK CAPTURE CHECKLIST

- [ ] Tester described their overall experience (1-5 rating): [RECORD]
- [ ] Tester described any confusing steps: [RECORD]
- [ ] Tester described any errors or unexpected behavior: [RECORD]
- [ ] Tester's top 3 feedback items: [RECORD]
- [ ] Tester filed a GitHub issue: [YES / NO] (issue number if yes: [RECORD])
- [ ] Feedback captured using PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md: [YES / NO / N/A]

**Privacy check:** Did the tester accidentally share any of the following?

- [ ] ChatGPT prompt or response text (if yes: redact immediately)
- [ ] Screenshot containing personal data (if yes: do not save/share)
- [ ] ppft_ API key (if yes: notify Privacy Owner immediately)
- [ ] .env file or secret (if yes: notify Privacy Owner immediately)
- [ ] Full browser URL with session IDs (if yes: do not save/share)

---

## UNINSTALL / DISABLE CHECKLIST

- [ ] Tester navigated to chrome://extensions
- [ ] Tester toggled PromptProfit to OFF (gray)
- [ ] Tester navigated to chatgpt.com
- [ ] Tester typed a prompt -- NO banner appeared (disable verified)
- [ ] Tester clicked "Remove" on the PromptProfit extension
- [ ] Tester confirmed removal dialog
- [ ] Extension no longer appears in chrome://extensions
- [ ] Tester confirmed: no data loss (chatgpt.com still accessible and functional)

---

## ROLLBACK CHECKLIST

Only needed if an S0 or S1 issue was found:

- [ ] Rollback triggered: [YES / NO]
- [ ] Reason for rollback: [DESCRIBE IF YES]
- [ ] All active testers notified to disable (if more than one tester active): [YES / NO / N/A]
- [ ] Docker billing services stopped: [YES / NO / N/A]
- [ ] Privacy Owner notified (if S0): [YES / NO / N/A]
- [ ] Rollback complete: [YES / NO / N/A]

---

## PRIVACY VERIFICATION CHECKLIST

- [ ] No extension overlay content contained ChatGPT prompt or response text
- [ ] No personal data was captured in any shared artifact
- [ ] No ppft_ key appeared in any log, screenshot, or shared output
- [ ] No forbidden fields observed in network requests (no pageUrl, domText, promptText, chatHistory)
- [ ] Tester complied with privacy-safe evidence policy

---

## GO / NO-GO DECISION

| Exit Criterion | Result | Notes |
|----------------|--------|-------|
| Install succeeded (no repo access required) | YES | Loaded from extracted ZIP root folder |
| Packaged selftest passed pre-session | YES | `pnpm -w run dryrun:001:selftest` PASS |
| Banner appeared during safe test (real ChatGPT) | **NO** | Confirmed -- see DRYRUN-001-ISSUE-001.md (S1/P1) |
| Banner content was placeholder only | N/A | Banner never appeared |
| Close button worked | N/A | Banner never appeared |
| Privacy rules followed (no leakage) | NOT RE-VERIFIED | |
| No S0 issue | YES | |
| No S1 issue | **NO** | DRYRUN-001-ISSUE-001 open (S1/P1) |
| Install guide understandable | YES | |
| Disable/remove worked | NOT REACHED | |
| Feedback filed | [TBD] | |

**Decision:** HOLD -- DRYRUN-001 blocked 2026-07-01 (rerun after 682276f; S1/P1 issue open)

Allowed decisions after execution:
- GO: proceed to Day 2-3 small beta (3-5 testers)
- HOLD: fix issues identified, re-run dry-run
- STOP: major unresolved issue; pause all beta distribution

**Note:** A confirmed banner failure on real ChatGPT, occurring even after the packaged selftest
passed, is a beta blocker (S1/P1) and must not be recorded or downgraded to S2-S4/P2-P3. See
`scripts/dryrun-001-finalize.js` enforcement rule and DRYRUN-001-ISSUE-001.md "Triage Correction".

**Decision recorded in:** GO_NO_GO_DECISION_RECORD.md (DRYRUN-001)
**Decision Owner:** [OWNER TBD]
**Decision Date:** 2026-07-01
