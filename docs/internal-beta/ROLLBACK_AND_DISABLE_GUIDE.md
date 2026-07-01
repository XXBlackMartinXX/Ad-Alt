# PromptProfit -- Rollback and Disable Guide

**INTERNAL BETA ONLY.**
**Date:** 2026-07-01 | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

## Overview

This guide covers how to safely disable, remove, or roll back every component of the
internal beta. Follow the relevant section for your situation.

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**

---

## 1. Disable Browser Extension (Chrome)

Use when: tester wants to pause testing without removing the extension.

Steps:
1. Open Chrome.
2. In the address bar, type: chrome://extensions and press Enter.
3. Find "PromptProfit" in the extension list.
4. Click the blue toggle to the right of the extension name. It should turn gray (OFF).
5. Verify: navigate to https://chatgpt.com and type a prompt. No overlay banner should appear.

Effect: The extension is inactive. The service worker stops. No events are sent.
The extension remains installed and can be re-enabled by toggling back to ON.

---

## 2. Remove Browser Extension (Chrome)

Use when: tester wants to fully uninstall the extension.

Steps:
1. Open Chrome.
2. In the address bar, type: chrome://extensions and press Enter.
3. Find "PromptProfit" in the extension list.
4. Click "Remove" (button below the extension name or after clicking "Details").
5. Confirm the removal dialog: click "Remove" again.
6. Verify: refresh chrome://extensions. PromptProfit should no longer appear.

Data note: Removing the extension deletes all data in chrome.storage.local that was
written by this extension (apiBaseUrl, featureFlags, debugMode). No user ChatGPT
content is stored by this extension, so no personal data is deleted by this step.

If the extension was loaded via "Load unpacked": the source ZIP or dist/ folder is not
deleted by Chrome's Remove action. You may delete that folder manually if desired.

---

## 3. Uninstall VS Code Extension (VSIX)

Use when: tester wants to remove the PromptProfit VS Code extension.

Steps:
1. Open VS Code.
2. Open the Extensions panel: Ctrl+Shift+X (Windows/Linux) or Cmd+Shift+X (macOS).
3. In the search box, type "PromptProfit".
4. Click the gear icon next to the extension name.
5. Select "Uninstall".
6. When prompted, reload or restart VS Code.
7. Verify: the extension no longer appears in the Installed list.

---

## 4. Stop Local API and Docker Services

Use when: engineers need to stop the local development API and billing services.

WARNING: This stops the local development API. All in-progress billing smoke tests
will fail after this. Only run if you are done with local testing.

Steps:
  cd [REPO_ROOT]
  docker compose down

Verify: docker ps should show no PromptProfit-related containers running.

To restart services later:
  docker compose up -d

If you need to check logs before stopping:
  docker compose logs --tail=50
  # Review for any ppft_ keys before sharing logs

---

## 5. Clear Local Test Reports

Use when: cleaning up before sharing anything or when test-results/ is consuming disk space.

WARNING: Review the contents before deleting. These directories may contain test run data.
Confirm no personal data (from live ChatGPT sessions) is present.

Safe to delete:
  rm -rf test-results/
  rm -rf playwright-report/
  rm -rf apps/browser-extension/dist-package/

Do NOT delete:
- apps/browser-extension/dist/ (built extension, needed for testing)
- apps/browser-extension/icons/ (placeholder icons, committed)
- Any committed source file or document

---

## 6. Remove Local Dev API Key

Use when: a tester or engineer needs to remove a local dev API key from their environment.

The local dev API key is stored in environment variables or a local .env file.
It is NEVER committed to the repository (check:secrets:local enforces this).

If set in a .env file:
1. Open the .env file in a text editor.
2. Remove the line containing the ppft_ key.
3. Save and close the file.
4. Or delete the .env file entirely: rm .env

If set in a terminal session via export:
- Close the terminal window. Environment variables do not persist across sessions.

If stored in chrome.storage.local by the extension service worker:
1. Navigate to chrome://extensions -> PromptProfit -> Details.
2. Under "Inspect views", click "Service worker".
3. In the DevTools console that opens, run: chrome.storage.local.clear()
4. Press Enter. The storage is cleared.
5. Verify: navigate to chatgpt.com. Extension should show "API config missing" behavior.

WARNING: If a ppft_ key was accidentally shared in any GitHub issue, Slack message, email,
or other channel, notify the Privacy Owner immediately. The key may need to be rotated.
Do NOT wait -- rotate first, investigate second.

---

## 7. Responding to a Privacy Incident

A privacy incident is any S0 event: potential data leakage, credential exposure, or
evidence that the extension is reading ChatGPT content it should not read.

### Immediate Response (within 1 hour)

1. Notify the Privacy Owner via private channel. Do NOT file a public GitHub issue for S0.
2. Instruct all active testers to disable the extension immediately:
   "Open Chrome -> chrome://extensions -> Find PromptProfit -> Toggle to OFF."
3. Do NOT ask testers to share any logs, screenshots, or data until the Privacy Owner
   has reviewed the situation and confirmed it is safe to do so.
4. If a ppft_ API key was exposed in any channel: rotate it immediately via the local API
   admin. Contact the Release Owner for production key rotation procedures.
5. If personal data appeared in a GitHub issue: edit the comment to remove the data.
   GitHub allows comment editing. Remove before triaging.

### After Investigation

- If confirmed S0: pause beta, file a private incident report, notify all stakeholders.
- If false alarm: re-enable beta, document the false alarm and what triggered it.
- Either way: update RISK_REGISTER.md with the incident.

---

## 8. Responding to a Billing Invariant Failure

A billing invariant failure means the following equation does NOT hold:
developer_credit + platform_fee = advertiser_charge

### Immediate Response

1. Stop running further billing smoke tests.
2. Record the exact amounts from the pnpm smoke output (sanitized -- remove ppft_ keys).
3. Notify the Billing Owner immediately via private channel.
4. File a GitHub issue: area:billing-ledger + beta:s1-blocker + status:needs-triage.
5. Do NOT proceed to staging or production billing until this is resolved.

### Verification After Fix

Re-run both billing smokes:
  pnpm -w run smoke:billing:local
  pnpm -w run smoke:billing:click:local

Both must pass before resuming billing smoke testing.

---

## 9. Rollback Communication Template

Send this message to all active testers if the beta is paused or stopped.
Replace all [PLACEHOLDER] fields before sending.

---
Subject: [ACTION REQUIRED] PromptProfit Internal Beta -- Temporary Pause

Hi [TESTER_NAME],

We are temporarily pausing the PromptProfit internal beta while we investigate an issue.

Please take this action immediately:
1. Open Chrome -> go to chrome://extensions
2. Find "PromptProfit"
3. Toggle it to OFF (the toggle turns gray)

Do NOT uninstall -- you may be asked to re-enable once we resolve the issue.

Please do not share any screenshots, logs, or data from your beta session until we
confirm it is safe to do so.

We will send you an update within [TIME FRAME] with next steps.

Thank you for your patience and understanding.

[SENDER_NAME]
[SENDER_ROLE]
---

---

## 10. Full Rollback Checklist

Use this checklist when executing a full beta rollback (all testers, all components).

| Step | Done? | Notes |
|------|-------|-------|
| All testers notified to disable extension | [ ] | |
| Rollback communication template sent | [ ] | |
| Docker billing services stopped | [ ] | |
| Local test reports reviewed and cleared | [ ] | |
| Privacy Owner notified | [ ] | |
| Release Owner notified | [ ] | |
| Confirmed no ppft_ key in any shared artifact | [ ] | |
| Any exposed key rotated (if applicable) | [ ] | |
| Personal data in GitHub issues redacted (if applicable) | [ ] | |
| Incident logged in private channel | [ ] | |
| Stakeholders notified (Release Owner decision) | [ ] | |
| RISK_REGISTER.md updated | [ ] | |

**Rollback completed by:** [OWNER TBD] -- [DATE TBD]
