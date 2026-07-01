# PromptProfit -- Issue Report Templates

**INTERNAL BETA ONLY.**
**Date:** 2026-07-01 | **Branch:** claude/ecstatic-maxwell-h0d8d8

---

## How to Use

1. Choose the template that best matches your issue.
2. Copy the template body into a new GitHub issue.
3. Fill in all fields. Delete fields that do not apply.
4. Apply the suggested labels listed at the bottom of each template.
5. Apply label release:internal-beta to EVERY issue.
6. Review for personal data before submitting (see privacy note in each template).

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**

---

## Template 1: Bug Report

**Use for:** Any unexpected behavior, crash, hang, or incorrect functionality.

---

**[BUG] [Short description of the bug]**

**Severity:** S1 / S2 / S3 (circle one -- see FEEDBACK_INTAKE.md for severity definitions)

**Environment:**
- OS:
- Chrome version (from chrome://settings/help):
- Extension version (from chrome://extensions -> Details):
- Other extensions active: Yes / No

**Steps to reproduce:**
1.
2.
3.

**Expected behavior:**
[What should happen]

**Actual behavior:**
[What actually happened]

**Frequency:** Always / Sometimes / Once

**Sanitized evidence:**
[Screenshot or log -- privacy-safe only. Remove all ChatGPT content, API keys, and personal data before attaching. See FEEDBACK_INTAKE.md section 5.]

**Additional notes:**

**Labels to apply:** area:[browser-extension / vscode-extension / billing-ledger / docs] + beta:s[1/2/3]-[...] + release:internal-beta

---

## Template 2: Privacy/Security Concern

**Use for:** Any behavior that may involve data leakage, unexpected access, or credential exposure.

**IMPORTANT:** If you believe a credential, token, personal data, or ppft_ API key was
exposed or transmitted, do NOT file a public GitHub issue. Contact the beta coordinator
directly via private channel. Only file a public issue if the concern is behavioral
(e.g., "the banner sometimes shows a URL that looks like my chat URL") and no actual
secret or personal data needs to be included in the report.

---

**[PRIVACY] [Short description of the concern]**

**Severity:** S0 (if credential or personal data may have been exposed) / S2 (behavioral concern)

**What you observed:**
[Describe the behavior. Do NOT paste raw data, API keys, URLs with session IDs, or personal content.]

**File or feature involved:**
[e.g., "extension overlay banner", "network request payload", "debug panel"]

**Steps to reproduce (if safe to describe):**
1.
2.
3.

**What data you believe may have been involved:**
[Describe in general terms -- do NOT paste the actual data. E.g., "the banner text appeared to contain part of my ChatGPT response"]

**Chrome version:**
**OS:**

**Labels to apply:** beta:s0-privacy-security + area:privacy + release:internal-beta

---

## Template 3: Billing/Ledger Concern

**Use for:** Incorrect billing amounts, missing events, or invariant failures during local billing smoke.

---

**[BILLING] [Short description of the concern]**

**Severity:** S1 (invariant failure) / S2 (missing event) / S3 (minor discrepancy)

**Expected billing behavior:**
[e.g., "impression event should create a ledger entry with developer_credit = 60 microcents"]

**Actual billing behavior:**
[e.g., "no ledger entry created" or "amounts do not add up"]

**Local Docker environment running:** Yes / No

**Invariant check:**
developer_credit + platform_fee == advertiser_charge? Yes / No / Unknown

**Sanitized command output:**
[Paste sanitized pnpm smoke:billing:local output here. REMOVE any ppft_ keys before pasting.
Replace ppft_[hex] with [REDACTED_KEY].]

**Additional notes:**

**Labels to apply:** area:billing-ledger + beta:s[1/2/3]-[...] + release:internal-beta

---

## Template 4: Installation Issue

**Use for:** Cannot install, load, update, or remove the extension or VSIX.

---

**[INSTALL] [Short description of the issue]**

**Severity:** S1 (cannot install at all) / S2 (partial failure) / S3 (cosmetic)

**OS:**
**Chrome version:**
**Package used:** ZIP (browser extension) / VSIX (VS Code)

**Exact error message or behavior:**
[Copy-paste the exact error text or describe the behavior]

**Steps attempted:**
1.
2.
3.

**What worked:**
[Which steps succeeded before the failure]

**What did NOT work:**
[The specific step that failed]

**Labels to apply:** area:packaging + beta:s[1/2/3]-[...] + release:internal-beta

---

## Template 5: Browser Extension Issue

**Use for:** Issues specific to the Chrome extension behavior (overlay, banner, close button, timing).

---

**[BROWSER-EXT] [Short description of the issue]**

**Severity:** S1 / S2 / S3

**OS:**
**Chrome version:**
**Extension version (from chrome://extensions -> Details):**

**URL being tested:**
[Should be chatgpt.com -- note if you were on a different URL by accident]

**Observed behavior:**
[What the extension did]

**Expected behavior:**
[What the extension should have done]

**Steps to reproduce:**
1. Go to chatgpt.com
2. Type a prompt (use only the safe test prompt: "Count slowly from 1 to 10.")
3.

**Privacy-safe screenshot (if applicable):**
[Attach only if no personal data is visible. Crop to show only the extension overlay.]

**Labels to apply:** area:browser-extension + beta:s[1/2/3]-[...] + release:internal-beta

---

## Template 6: VS Code Extension Issue

**Use for:** Issues with the VS Code extension (VSIX packaging, activation, or functionality).

---

**[VSCODE-EXT] [Short description of the issue]**

**Severity:** S1 / S2 / S3

**OS:**
**VS Code version (from Help -> About):**
**Extension version:**

**Observed behavior:**
[What happened]

**Expected behavior:**
[What should have happened]

**Steps to reproduce:**
1.
2.
3.

**Additional notes:**

**Labels to apply:** area:vscode-extension + beta:s[1/2/3]-[...] + release:internal-beta

---

## Template 7: Documentation Issue

**Use for:** Missing steps, incorrect instructions, confusing wording, or broken links in any beta document.

---

**[DOCS] [Short description of the documentation issue]**

**Severity:** S2 (prevents installation/testing) / S3 (confusing but workable)

**Document:** [e.g., docs/internal-beta/BETA_TESTER_INSTALLATION_GUIDE.md]
**Section or step:** [e.g., "Step 4 -- Load the extension"]

**What is incorrect, missing, or confusing:**
[Describe the problem clearly]

**Suggested correction (optional):**
[Your suggested replacement text or steps]

**Labels to apply:** area:docs + beta:s[2/3]-[minor/major] + release:internal-beta

---

## Template 8: Feature Request / Out-of-Scope Request

**Use for:** Enhancement ideas, or requests for features not in this release.

**NOTE:** This is an INTERNAL BETA for the ChatGPT adapter only. Requests for Claude,
Gemini, Desktop, or other platform support are OUT OF SCOPE for this phase. They will
be labeled out-of-scope:platform-expansion and will not be prioritized as bugs.

---

**[FEATURE-REQUEST] [Short description of the request]**

**Severity:** S4 (suggestion/nit)

**Feature requested:**
[Describe what you want]

**Which platform or component would this affect:**
[e.g., "Chrome extension overlay", "billing ledger", "VS Code extension"]

**Is this for a platform not in this release (Claude, Gemini, Desktop)?**
Yes / No

**Why it matters:**
[How this would help testers or improve the product]

**Labels to apply:** beta:s4-suggestion + out-of-scope:platform-expansion (if applicable) + release:internal-beta
