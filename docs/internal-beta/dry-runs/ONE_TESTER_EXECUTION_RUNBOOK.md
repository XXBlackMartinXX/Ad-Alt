# PromptProfit -- One-Tester Execution Runbook

**For use by the Dry-Run Owner during DRYRUN-001.**
**INTERNAL BETA ONLY. Branch:** claude/ecstatic-maxwell-h0d8d8

---

> This runbook is for the person RUNNING the dry-run session, not the tester.
> Complete each section in order. Do NOT skip steps.
> Do NOT mark a step done unless it physically happened.

---

## Semi-Automated Conductor Commands

Three commands cover the automated portions of the dry-run. Human session steps remain manual.

```bash
# Before the session: runs all checks, packages, creates result draft, prints human steps
pnpm -w run dryrun:001:prepare

# After the session: interactive CLI to record results, enforce rules, update all docs
pnpm -w run dryrun:001:finalize

# Anytime: validate DRYRUN-001 state and result log
pnpm -w run check:dryrun:001
```

These commands do NOT automate ChatGPT interaction, login, prompt entry, or tester observation.

---

## 1. Before the Tester Session

Complete ALL of the following before inviting the tester.

### 1a. Confirm Branch and Commit

```bash
git branch --show-current
# Expected: claude/ecstatic-maxwell-h0d8d8

git log --oneline -1
# Expected: 4963877 or later
```

### 1b. Run Full Automated Check Suite

**Recommended: use the conductor:**

```bash
pnpm -w run dryrun:001:prepare
```

This runs all checks, packages the extension, audits the ZIP, confirms public-release gates,
creates `DRYRUN-001_RESULT_DRAFT.md`, and prints the human-only tester steps.

**Or run manually:**

```bash
pnpm -w run check:ps1
# Expected: exit 0 (no non-ASCII in PowerShell scripts)

pnpm -w run check:secrets:local
# Expected: exit 0 (0 leaks detected)

pnpm -w run check:internal-beta-packet
# Expected: exit 0 (all 11 beta packet docs present and valid)

pnpm -w run check:internal-beta-rollout
# Expected: exit 0 (all 10 rollout docs present and valid)

pnpm -w run check:first-dry-run-packet
# Expected: exit 0 (all 7 dry-run docs present and valid)
```

If any check fails: STOP. Fix the issue. Re-run all checks before proceeding.

### 1c. Build and Package

```bash
pnpm -r build
# Expected: exit 0

pnpm --filter @ad-alt/browser-extension test:unit
# Expected: all unit tests pass

pnpm -w run package:browser:beta
# Expected: exit 0
# Artifact: apps/browser-extension/dist-package/promptprofit-browser-beta-*.zip

pnpm -w run package:browser:zip:audit -- --mode internal-beta
# Expected: PASS (warnings acceptable, no FAIL)

pnpm -w run dryrun:001:selftest
# Expected: PASS -- proves the packaged artifact renders the banner without API config.
# If this fails: BLOCKED BEFORE HUMAN TEST. Do not schedule the tester session.
```

Record the artifact filename. You will need it for the result log.

### 1d. Audit the ZIP

Manually verify the ZIP does NOT contain:

- [ ] dist-test/ directory
- [ ] Any .js.map files
- [ ] Any .env files
- [ ] node_modules/ directory
- [ ] Any file matching ppft_[0-9a-f]{8,}

Verify the ZIP DOES contain:

- [ ] manifest.json
- [ ] background/service-worker.js
- [ ] content/chatgpt.js
- [ ] icons/ directory (16.png, 48.png, 128.png)

### 1e. Optional: Run Fixture and Billing Smoke

If Docker is available:

```bash
pnpm --filter @ad-alt/browser-extension test:e2e
# Expected: 13/13

docker compose up -d
pnpm -w run smoke:billing:local
# Expected: exit 0, invariant holds: developer_credit + platform_fee == advertiser_charge

pnpm -w run smoke:billing:click:local
# Expected: exit 0, click invariant holds
```

If Docker is NOT available, note the reason. This does not block Track A dry-run.

### 1f. Confirm Tester Readiness

- [ ] Tester has signed NDA or internal beta agreement
- [ ] Tester has read PRIVACY_SECURITY_ONE_PAGER.md or equivalent privacy briefing
- [ ] Tester confirmed Chrome version (must be recent stable)
- [ ] Tester confirmed OS (Windows 10/11, macOS 12+, or Ubuntu 22.04+)
- [ ] Delivery method confirmed: secure internal channel only (NOT unencrypted email, NOT public link)
- [ ] ZIP delivered to tester

**Pre-session checklist complete. Ready to start tester session.**

---

## 2. During Tester Install

Have FIRST_TESTER_DRY_RUN_WORKSHEET.md open and track each step.

**Observe** (do not do it for the tester):

1. Tester unzips the package to a local folder
2. Tester opens `chrome://extensions`
3. Tester enables Developer Mode toggle (top right)
4. Tester clicks "Load unpacked" and selects the EXTRACTED ZIP ROOT FOLDER.
   **Important:** The tester must select the EXTRACTED ZIP ROOT FOLDER — the folder created
   when they unzipped the package (e.g. `promptprofit-browser-beta-.../`). This folder contains
   `manifest.json` directly. Do NOT navigate into `dist/` or any subfolder inside it.
   The `dist/` subfolder only has JS files — Chrome will reject it (no `manifest.json` there).
5. Extension "PromptProfit" appears in the list with no error badge

**PRIMARY CHECK (do this immediately, before worrying about login):**

The internal-beta demo banner no longer requires ChatGPT generation OR login to appear —
it renders via a deterministic forced fallback within a few seconds of the page loading.

- Ask the tester to navigate to `https://chatgpt.com` in a NEW tab (opened after the
  extension was loaded).
- Watch the bottom-right corner. The banner should appear within ~5 seconds, even on the
  login/signup screen.
- If it does NOT appear: this is now a genuine failure signal, not a login issue. Read the
  live dry-run diagnostics panel (top-left corner) and record its exact status line before
  doing anything else. See TROUBLESHOOTING_BANNER_NOT_OBSERVED.md.

**LOGGED-IN REQUIREMENT (only needed for the optional secondary check below):**

- Ask the tester to navigate to `https://chatgpt.com` and log in if not already.
- If they see "Log in" or "Sign up for free": have the tester log in before the secondary check.
- The secondary (wait-state-driven) check requires an authenticated, real ChatGPT
  generation — the primary forced-fallback check above does not.

**If the tester hits an error at any step:**

- Record which step failed in the worksheet
- Classify: S1 (blocking all testers) or S2 (environment-specific)
- If S1: call HOLD, fix before re-run
- If S2: document and continue if tester can work around it

**Record in worksheet:**
- Chrome version
- OS version
- Any error messages seen (verbatim, no personal data)
- Steps that required clarification

---

## 3. During Safe Test

**This is the OPTIONAL secondary check** — the primary check (forced fallback banner
appearing immediately after page load, no login/prompt required) should already have been
completed in Section 2 above. This section exercises the normal wait-state-driven path.

**Two prompts are approved for this dry-run. Use the RECOMMENDED one for this rerun:**

```
RECOMMENDED: Count slowly from 1 to 100, one number per line.

Also approved (shorter, original DRYRUN-001 prompt): Count slowly from 1 to 10.
```

The longer prompt is recommended because it gives more time to observe the banner --
a very short generation can complete before the ad-decision round-trip finishes, causing
the banner to render and be removed almost instantly.

**Do NOT allow** any other prompt. If the tester starts typing something else, politely redirect them to an approved prompt.

**Observe and record (do NOT record ChatGPT content):**

1. Tester navigates to `https://chatgpt.com` (in a NEW tab, opened AFTER the extension was loaded) and logs in
2. Tester opens a NEW chat (not an existing conversation)
3. Tester types exactly: `Count slowly from 1 to 100, one number per line.`
4. Tester presses Enter
5. While ChatGPT generates the response, an overlay banner appears in the bottom-right area

**Read the live dry-run diagnostics panel (internal-beta only):**

A small panel labeled "PromptProfit Dry-Run Diagnostics" may be visible in the TOP-LEFT
corner. It never shows ChatGPT content -- only extension-owned state. If the banner does
not appear, READ AND RECORD its status line and last-error value exactly instead of
guessing. See TROUBLESHOOTING_BANNER_NOT_OBSERVED.md for the full status-line legend.

**What you and the tester should see (banner description):**

While ChatGPT is streaming its response (generating phase, not after):
- A small rectangular overlay banner appears in the BOTTOM-RIGHT corner of the browser window.
- The banner contains:
  - A short placeholder headline (e.g. "Sponsored" or placeholder text — not a real ad)
  - A short placeholder description line
  - A placeholder display URL
  - An X (close) button in the top corner of the banner
- The banner remains visible until the X is clicked.

If no banner appears within 3-5 seconds of the response starting: record "banner not observed"
AND the exact diagnostics panel status line. See TROUBLESHOOTING_BANNER_NOT_OBSERVED.md for diagnosis steps.

**While the banner is visible, verify:**

- [ ] Banner appeared (if NO and `dryrun:001:selftest` passed pre-session: this is a confirmed
      S1/P1 blocker, not inconclusive -- record the diagnostics panel status line immediately;
      see TROUBLESHOOTING_BANNER_NOT_OBSERVED.md)
- [ ] Banner shows placeholder headline text (if real ad content: S0/S1 -- escalate)
- [ ] Banner shows placeholder body text
- [ ] Banner shows a placeholder display URL
- [ ] Banner shows a close (X) button
- [ ] No ChatGPT prompt or response text is visible inside the banner
- [ ] No ppft_ key pattern is visible anywhere in the browser UI

6. Tester clicks the X button
7. Banner disappears immediately

**Privacy checkpoint:** If at any point you see personal data, a real API key, or ChatGPT content in the banner or any other unexpected location, pause the session immediately and follow the S0 escalation procedure in DRY_RUN_TRIAGE_CHECKLIST.md.

---

## 4. During Feedback Capture

After the safe test completes:

1. Ask the tester to rate their experience 1-5 (1 = very difficult, 5 = very smooth)
2. Ask: "Were any steps confusing or unclear?"
3. Ask: "Did anything unexpected happen?"
4. Ask: "What are your top 3 pieces of feedback?"

**Record tester's responses in the worksheet.** Do NOT record ChatGPT content. Do NOT record personal data.

**Privacy check before capturing anything the tester shares:**

- If the tester tries to share a screenshot: verify it contains NO ChatGPT content, NO personal data before saving
- If the tester copies a ChatGPT response: do NOT record it; redirect to privacy rules
- If the tester shares a ppft_ key: immediately instruct them to stop, rotate the key, follow S0 procedure

**If tester wants to file a GitHub issue:**

- Direct them to PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md
- Confirm all evidence safety checkboxes before the issue is filed
- Record the issue number in the worksheet

---

## 5. During Uninstall and Disable Test

**Observe the tester:**

1. Tester opens `chrome://extensions`
2. Tester toggles PromptProfit to OFF (gray/disabled)
3. Tester navigates to `https://chatgpt.com`
4. Tester types any test prompt (the approved prompt is fine)
5. **Verify: NO banner appears** (if banner still appears with extension disabled: S1 blocker)
6. Tester goes back to `chrome://extensions`
7. Tester clicks "Remove" next to PromptProfit
8. Tester confirms the removal dialog
9. Extension no longer appears in `chrome://extensions`
10. Tester confirms `https://chatgpt.com` is still functional

**Record any issues in the worksheet.**

---

## 6. After Session: Triage

Within 24 hours of the session, run triage using DRY_RUN_TRIAGE_CHECKLIST.md.

**Recommended: use the finalize conductor:**

```bash
pnpm -w run dryrun:001:finalize
```

This interactive CLI collects sanitized session results, enforces privacy/billing rules,
creates `DRYRUN-001_RESULT_LOG.md`, updates the tracker and go/no-go record, creates issue
files, runs a privacy scan, and prints the final honest label.

**Or record manually:**

1. Open FIRST_TESTER_DRY_RUN_WORKSHEET.md and confirm all sections are filled in
2. Copy DRY_RUN_RESULT_LOG_TEMPLATE.md to:
   `docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md`
3. Fill in ALL sections of the result log (sections 1-14)
4. Update DRY_RUN_STATUS_TRACKER.md: set DRYRUN-001 row to COMPLETED

**For each issue found:**

- Fill in one PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md per issue
- Verify all evidence safety checkboxes before filing a GitHub issue
- Apply severity per TRIAGE_LABELS.md
- If S0: do NOT file a public GitHub issue; contact Privacy Owner via private channel
- If billing invariant failed: STOP all billing tests; notify Billing Owner; record HOLD

**Triage meeting (within 24 hours):**

- Lead the triage meeting per DRY_RUN_TRIAGE_CHECKLIST.md
- Assign severity and priority to each issue
- Route S0 issues to Privacy Owner (do NOT delay)
- Route S1 billing issues to Billing Owner

---

## 7. Decision Recording

After triage, record the decision in GO_NO_GO_DECISION_RECORD.md.

**Decision criteria:**

| Decision | When |
|----------|------|
| GO | All exit criteria MET; no open S0/S1; billing invariant held; privacy clean |
| HOLD | 1-2 criteria NOT MET; fixable; no S0 |
| STOP | Any S0; billing invariant violated; critical privacy incident |

**After recording the decision:**

- [ ] Update DRY_RUN_STATUS_TRACKER.md with final decision
- [ ] Update BETA_ROLLOUT_SCHEDULE.md Day 1 result
- [ ] Update BETA_OWNER_CHECKLIST.md Day 1 sign-off
- [ ] Update RISK_REGISTER.md with any new risks
- [ ] Prepare STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md Day 6 update

**If GO:** Notify Day 2-3 tester group and proceed to small beta distribution.

**If HOLD:** Assign fix owners, set target dates, schedule DRYRUN-002 after fixes.

**If STOP:** Execute ROLLBACK_AND_DISABLE_GUIDE.md immediately. Notify all stakeholders.

---

## Quick Command Reference

```bash
# Semi-automated conductor (recommended)
pnpm -w run dryrun:001:prepare        # Before session: checks + package + selftest + draft + human steps
pnpm -w run dryrun:001:live-checklist # Before/during session: folder, prompt, diagnostics legend
pnpm -w run dryrun:001:finalize       # After session:  record results + update docs + final label
pnpm -w run check:dryrun:001          # Anytime: validate DRYRUN-001 state

# Full pre-run verification (individual checks)
pnpm -w run check:ps1
pnpm -w run check:secrets:local
pnpm -w run check:internal-beta-packet
pnpm -w run check:internal-beta-rollout
pnpm -w run check:first-dry-run-packet
pnpm -w run dryrun:001:selftest  # Banner-render gate against the packaged artifact

# Build and package
pnpm -r build
pnpm --filter @ad-alt/browser-extension test:unit
pnpm -w run package:browser:beta
pnpm -w run package:browser:zip:audit -- --mode internal-beta

# Optional (engineer / Docker required)
pnpm --filter @ad-alt/browser-extension test:e2e
pnpm -w run smoke:billing:local
pnpm -w run smoke:billing:click:local
```

**Approved human test prompts:**

```
RECOMMENDED for this rerun: Count slowly from 1 to 100, one number per line.

Also approved (shorter, original DRYRUN-001 prompt): Count slowly from 1 to 10.
```

No other prompt is allowed.

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
