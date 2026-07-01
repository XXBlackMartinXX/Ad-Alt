# DRYRUN-001 Issue 001: Banner not observed during first dry-run attempt

**DRYRUN-001 | Issue 001**
**Severity:** S2
**Priority:** P2
**Area:** area:beta-dry-run-setup
**Status:** needs-triage / setup-likely

---

## Description

During the first DRYRUN-001 attempt (2026-07-01), the PromptProfit overlay banner was NOT
observed during the ChatGPT generation phase. The session was inconclusive.

The most likely cause is tester setup (not logged in, or wrong folder loaded) rather than
a product defect. The extension code and dist/ build are intact; all automated checks pass.

This is filed as S2 (setup/environment issue) pending confirmation that the extension overlay
is actually broken. If a second attempt with correct setup also shows no banner, escalate to S1.

---

## Observed Behavior

- Tester submitted the safe test prompt: "Count slowly from 1 to 10."
- ChatGPT responded normally.
- No PromptProfit banner/overlay appeared in the bottom-right corner.

## Expected Behavior

While ChatGPT is generating a response, a small overlay banner should appear in the bottom-right
corner of the browser window showing placeholder content (headline, description, display URL, X button).

---

## Root Cause Hypotheses (in priority order)

1. Tester was not logged into chatgpt.com (most likely -- unauthenticated state = no banner).
2. Tester loaded the wrong folder (outer ZIP folder instead of the `dist/` subfolder).
3. Extension toggle was off (gray) in chrome://extensions.
4. ChatGPT tab was open before the extension was loaded (content script did not inject).
5. Actual product defect in the overlay rendering logic.

---

## Reproduction Steps (for rerun)

1. Owner runs: `pnpm -w run dryrun:001:diagnose` -- confirm dist/ is correct.
2. Tester logs into chatgpt.com (MUST see the chat interface, NOT "Log in" / "Sign up").
3. Load the extension: chrome://extensions -> Developer Mode ON -> Load unpacked -> select `dist/` subfolder.
4. Open a NEW chat.
5. Submit: `Count slowly from 1 to 10.`
6. Watch the bottom-right corner during ChatGPT generation.

---

## Environment

- Date: 2026-07-01
- Branch: claude/ecstatic-maxwell-h0d8d8
- See DRYRUN-001_ATTEMPT_001_INCONCLUSIVE_NOTE.md for session details.
- Tester: non-engineer (Track A)

---

## Severity Rationale

| Field | Value |
|-------|-------|
| Severity | S2 (setup/environment -- escalate to S1 if confirmed on second attempt) |
| Priority | P2 |
| Rollback Needed | NO (no evidence of product defect or data exposure) |
| Escalation | QA Owner if confirmed S1 after rerun with correct setup |

---

## Evidence Safety

- [x] No ChatGPT prompt text included
- [x] No ChatGPT response text included
- [x] No screenshot with personal data included
- [x] No API key included
- [x] No .env file included
- [x] No cookies or tokens included

---

## Resolution Criteria

**Resolved (downgrade to S3/close):** Second dry-run attempt with correct tester setup shows banner appearing correctly.

**Escalate to S1:** Second dry-run attempt with confirmed correct setup (logged in, correct folder, new chat, watching during generation) and banner still does not appear.

---

## Triage Assignment

| Field | Value |
|-------|-------|
| Assigned To | [OWNER TBD -- QA Owner] |
| Status | needs-triage / awaiting-rerun |
| GitHub Issue # | [Do not file publicly until confirmed S1 -- file internally] |
| Target Fix Date | [DATE TBD -- depends on rerun schedule] |

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
