# PromptProfit -- Feedback Intake System

**INTERNAL BETA ONLY. Not for public distribution.**
**Date:** 2026-07-01 | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

## 1. Feedback Categories

| Category | Description |
|----------|-------------|
| Bug | Unexpected behavior, crash, hang, incorrect output, missing feature that should exist |
| Privacy/Security | Potential data leakage, permission concern, consent issue, key exposure |
| Billing/Ledger | Incorrect billing amount, missing event, ledger invariant failure |
| Installation | Cannot install, load, update, or remove the extension or VSIX |
| UX/Functionality | Banner display, close button behavior, timing, rendering, DX quality |
| Documentation | Missing step, incorrect instruction, confusing wording, broken link |
| Out of Scope | Unsupported platform, feature not in this release, public-release blocker |

---

## 2. Severity Levels

| Level | Name | Description | Response Time |
|-------|------|-------------|---------------|
| S0 | Security/Privacy Incident | Potential data leakage, credential exposure, privacy violation | Immediate -- stop beta |
| S1 | Beta Blocker | Prevents core functionality from working for all testers | Same business day |
| S2 | Major Issue | Core feature works but has significant usability or reliability problem | Next sprint |
| S3 | Minor Issue | Non-blocking cosmetic or low-frequency issue | Backlog |
| S4 | Suggestion/Nit | Enhancement request or minor preference | Backlog -- out of scope for beta |

**Default rule:** Any issue involving privacy or a ppft_ key is S0 until reviewed.

---

## 3. Priority Levels

| Level | Name | Criteria |
|-------|------|---------|
| P0 | Immediate Stop | S0 issues, billing invariant failure, raw key in logs, any privacy incident |
| P1 | Fix Before Next Beta | S1 issues, critical install failure affecting all testers |
| P2 | Fix Before Public Release | S2 issues, documentation gaps found during beta |
| P3 | Backlog | S3, S4, out-of-scope requests |

---

## 4. Bug Report Template

Copy and paste this template into your GitHub issue body.

---
**Bug Report -- PromptProfit Internal Beta**

- **Title:** [Short description of the bug]
- **Severity:** [S0 / S1 / S2 / S3 / S4]
- **Category:** [Bug / Privacy / Billing / Installation / UX / Docs / Out of Scope]
- **Chrome Version:** [e.g. 126.0.0.6478.127 -- from chrome://settings/help]
- **OS:** [e.g. Windows 11 22H2, macOS 14.5, Ubuntu 22.04]
- **Extension version:** [from chrome://extensions -> PromptProfit -> Details]
- **Node version (engineers only):** [e.g. v22.2.0]

**Steps to reproduce:**
1.
2.
3.

**Expected behavior:**
[What should happen]

**Actual behavior:**
[What actually happened]

**Frequency:** [Always / Sometimes (approx X% of the time) / Occurred once]

**Sanitized screenshot or log:**
[Attach ONLY if no personal data is visible -- see privacy policy in section 5 below]

**Labels to apply:** [area:...] + [beta:sN-...] + release:internal-beta

**Notes:** [Any additional context]
---

---

## 5. Privacy-Safe Evidence Policy

### What You MAY Attach

- Screenshots showing ONLY the extension overlay/banner with no ChatGPT chat content visible.
- Chrome DevTools Network tab showing the extension request payload structure -- but only
  after blurring or deleting any field value that could contain personal data.
- Console error messages that do not contain API keys, session tokens, or user data.
- Sanitized output from pnpm commands (after removing any ppft_ keys -- see section 6).

### What You Must NEVER Attach

- Screenshots showing any ChatGPT prompt text you typed.
- Screenshots showing any ChatGPT response content.
- Full browser screenshots that include the URL bar (which may contain session IDs).
- .env files or any file containing ppft_ API keys or other secrets.
- Browser storage exports (cookies, localStorage, sessionStorage).
- Any log or file that contains a pattern matching ppft_[hex characters].
- Any file containing Authorization header values.

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**

---

## 6. Safe Logs Policy

Before attaching any log, command output, or screenshot to a GitHub issue or email:

1. Open the file or copy the text to a text editor.
2. Search for ppft_ -- if any match exists, replace the entire key with [REDACTED_KEY].
3. Search for Authorization: -- replace the value after the colon with [REDACTED].
4. Search for apiKey -- replace the value with [REDACTED].
5. Search for Bearer -- replace everything after Bearer with [REDACTED].
6. Visually confirm: no ChatGPT prompt text, no response text, no personal names.
7. Save the sanitized version to a new file and attach that file.

Do NOT attach the original unsanitized file.

---

## 7. Reproduction Steps Template

For issues that are hard to reproduce, provide as much detail as possible:

---
**Reproduction Steps -- Detailed**

- **Environment:** [OS / Chrome version / extension version]
- **Network conditions:** [Normal / VPN / Corporate proxy / Offline after load]
- **Steps from fresh browser session:**
  1. Open new Chrome window (not Incognito)
  2. Navigate to chatgpt.com
  3. [Your steps here]
- **Chat setup:** [New conversation / Continuing conversation / Shared link]
- **ChatGPT response length:** [Short (under 50 words) / Medium / Long]
- **ChatGPT response type:** [List / Paragraph / Code block / Mixed]
- **Extension state at time of issue:** [Enabled / Disabled / Error badge visible]
- **Reproducible in new Chrome profile:** [Yes / No / Not tested]
- **Other extensions installed:** [Yes -- list relevant ones / No]
---

---

## 8. Expected vs Actual Behavior Template

---
**Expected vs Actual**

| Aspect | Expected | Actual |
|--------|----------|--------|
| Banner appearance | Appears in bottom-right during ChatGPT response | [Describe what happened] |
| Banner content | Placeholder headline + body + display URL | [Describe what appeared] |
| Close button | Dismisses banner immediately | [Describe what happened] |
| Re-appearance | Does not re-appear after close in same response | [Describe what happened] |
| After disabling extension | No banner appears | [Describe what happened] |

Additional observations: [Free text]
---

---

## 9. Environment Template

---
**Environment Details**

- OS: [e.g. Windows 11 22H2]
- Chrome version: [e.g. 126.0.0.6478.127]
- Extension version: [from chrome://extensions]
- Node.js version (engineers): [e.g. v22.2.0]
- pnpm version (engineers): [e.g. 9.4.0]
- Docker running (engineers): [Yes / No / N/A]
- VPN active: [Yes / No]
- Other extensions installed: [List or "None"]
- Extension loaded from: [ZIP (load unpacked) / dist/ directly]
---

---

## 10. Escalation Criteria

Escalate IMMEDIATELY (contact beta coordinator via private channel, NOT public GitHub):

- A ppft_ API key pattern appears in any shared log, screenshot, or report.
- The extension appears to be reading ChatGPT prompt or response text (any DOM read of
  chat content would be a privacy violation -- check network requests if unsure).
- The billing invariant fails: developer_credit + platform_fee != advertiser_charge.
- A tester reports that personal data is visible inside the extension overlay.
- Any S0 severity event occurs.
- Any API key, password, or secret was accidentally shared in a GitHub issue comment.

**Do NOT escalate S0 events via a public GitHub issue.**
**Use a private Slack channel, email, or direct message to the beta coordinator.**

For S1 issues that block all testers: file a GitHub issue with beta:s1-blocker + status:needs-triage.

For all other issues: file a GitHub issue and apply triage labels per TRIAGE_LABELS.md.
