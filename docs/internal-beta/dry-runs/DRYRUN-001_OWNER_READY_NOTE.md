# PromptProfit -- DRYRUN-001 Owner-Ready Note

**Status: READY TO RUN -- NOT EXECUTED**
**Dry-Run ID:** DRYRUN-001
**Branch:** claude/ecstatic-maxwell-h0d8d8
**Prepared Commit:** 35802c9

---

> This note is for the Dry-Run Owner. All automated pre-run checks pass.
> The package is built and audited. The session materials are complete.
> A human owner and a human tester must run this session together.
> Do NOT mark DRYRUN-001 as COMPLETED until the real session has occurred.

---

## Current State

| Item | Status |
|------|--------|
| Dry-run packet (7 docs) | READY |
| check:internal-beta-packet | PASS |
| check:internal-beta-rollout | PASS |
| check:first-dry-run-packet | PASS |
| Fixture E2E (13/13) | PASS |
| Unit tests (105/105) | PASS |
| Build / verify | PASS |
| Browser extension ZIP audit (internal-beta) | PASS |
| VSIX audit (internal-beta) | PASS |
| Billing reconciliation (internal-beta) | PASS / WARN (staging not run) |
| Secret leak scan (364 files) | 0 leaks |
| PS1 ASCII compliance | PASS |
| DRYRUN-001 session | **NOT EXECUTED** |
| Go/No-Go decision | **PENDING** |

---

## Commit to Use

**Latest ready commit:** `35802c9` (docs: prepare first internal beta dry-run packet)

Confirm before distributing the package:

```bash
git branch --show-current
# Expected: claude/ecstatic-maxwell-h0d8d8

git log --oneline -1
# Expected: 35802c9 or later
```

---

## Required Package Command

```bash
pnpm -r build
pnpm -w run package:browser:beta
# Output: apps/browser-extension/dist-package/promptprofit-browser-beta-<timestamp>.zip

pnpm -w run package:browser:zip:audit -- --mode internal-beta
# Expected: PASS
```

---

## Full Pre-Session Verification Checklist (Run Before Every Session)

```bash
pnpm install --frozen-lockfile
pnpm -w run check:ps1
pnpm -w run check:secrets:local
pnpm -w run check:internal-beta-packet
pnpm -w run check:internal-beta-rollout
pnpm -w run check:first-dry-run-packet
pnpm --filter @ad-alt/browser-extension test:unit
pnpm -r build
pnpm -w run package:browser:beta
pnpm -w run package:browser:zip:audit -- --mode internal-beta
```

All commands must exit 0 before distributing the package to the tester.

---

## Tester Prerequisites

The tester must:

- [ ] Be an internal team member (not the extension author)
- [ ] Have a Chrome browser (recent stable version)
- [ ] Have a chatgpt.com account
- [ ] Have agreed to the internal beta terms (NDA or equivalent)
- [ ] Have received and understood the privacy rules (PRIVACY_SECURITY_ONE_PAGER.md or summary)
- [ ] NOT have read the installation guide in advance (tests it cold)

---

## Package Delivery Procedure

- Deliver the beta ZIP via a **secure internal channel only**
- Do NOT send via unencrypted email
- Do NOT post to a public URL or public Slack channel
- Do NOT share the dist/ directory directly (ZIP only)
- Confirm the ZIP has NOT been shared beyond the tester

---

## Approved Safe Test Prompt

**Use ONLY this exact prompt during the session:**

```
Count slowly from 1 to 10.
```

No other prompt is permitted. Redirect the tester if they try a different prompt.

**Rationale:** This generates a slow, predictable response with no personal or sensitive content, giving the tester time to observe the banner. It contains no private data.

---

## ZIP Contents to Verify Before Distribution

The beta ZIP must NOT contain:
- `dist-test/` directory
- Any `.js.map` files
- Any `.env` files
- `node_modules/` directory
- Any file matching the `ppft_[0-9a-f]{8,}` pattern

The beta ZIP must contain:
- `manifest.json`
- `background/service-worker.js`
- `content/chatgpt.js`
- `icons/` directory (with 16.png, 48.png, 128.png)

The `package:browser:zip:audit -- --mode internal-beta` command verifies this automatically.

---

## What to Observe and Record During the Session

Use `FIRST_TESTER_DRY_RUN_WORKSHEET.md` to record each step.
Use `ONE_TESTER_EXECUTION_RUNBOOK.md` as your session guide.

Minimum to record:
- [ ] Tester OS and Chrome version
- [ ] Package artifact filename (timestamp)
- [ ] Install: did it succeed without help?
- [ ] Safe test: did the banner appear?
- [ ] Banner content: placeholder only (no real ad data, no personal data)
- [ ] Close button: did it work?
- [ ] Privacy: did the tester accidentally share personal data, ppft_ keys, or ChatGPT content?
- [ ] Billing: was billing smoke run? (Docker required; optional for Track A)
- [ ] Uninstall: did disable and remove work?
- [ ] Issues: how many, and what severity?
- [ ] Feedback: rating 1-5 and top 3 items

---

## Issue Capture Procedure

If any issue is found during the session:

1. Use `PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md` to capture the issue
2. Check ALL evidence safety boxes before filing a GitHub issue
3. Do NOT paste ChatGPT content, personal data, ppft_ keys, or raw logs
4. Classify severity using `TRIAGE_LABELS.md`:
   - S0/P0: privacy, security, or API key exposure -- DO NOT file publicly; notify Privacy Owner immediately
   - S1/P1: install blocker or banner never appears -- file with `beta:s1-blocker` label
   - S2/P2: significant issue, workaround possible -- file with `beta:s2-major` label
   - S3/P3: minor confusion or cosmetic -- file with `beta:s3-minor` label
   - S4: suggestion or out-of-scope platform request -- `beta:s4-suggestion`
5. If a billing invariant failure occurs: STOP all billing tests; notify Billing Owner; record HOLD

---

## Rollback Procedure

If an S0 or S1 issue is found:

1. Ask the tester to disable the extension immediately: `chrome://extensions` → toggle PromptProfit OFF
2. If tester loaded from ZIP: `chrome://extensions` → click Remove
3. Do NOT save or share any screenshot with personal data or API keys
4. If S0: notify Privacy Owner via private channel (NOT a public GitHub issue)
5. If S1: file a GitHub issue with `beta:s1-blocker` + `status:needs-triage`
6. Record HOLD in `GO_NO_GO_DECISION_RECORD.md`
7. Do NOT invite additional testers until fixed and re-run passes

Full rollback guide: `ROLLBACK_AND_DISABLE_GUIDE.md`

---

## Go/No-Go Criteria

All must be MET to record GO:

| Criterion | Required |
|-----------|---------|
| Install succeeded without repo access | MET |
| Banner appeared during safe test | MET |
| Banner content was placeholder only (no real data) | MET |
| Close button worked | MET |
| No personal data shared or leaked | MET |
| No ppft_ key visible in any shared output | MET |
| No S0 issue | MET |
| No S1 issue | MET |
| Billing invariant held (if run) | MET or N/A |
| Install guide was understandable | MET |
| Disable/remove worked | MET |
| Tester submitted feedback | MET |

If any criterion is NOT MET: record HOLD or STOP, not GO.

---

## What to Fill In After the Session

After the session completes, update these documents:

1. `FIRST_TESTER_DRY_RUN_WORKSHEET.md` -- mark all steps
2. `DRY_RUN_RESULT_LOG_DRYRUN-001.md` -- create from DRY_RUN_RESULT_LOG_TEMPLATE.md, fill all 15 sections
3. `GO_NO_GO_DECISION_RECORD.md` -- fill in decision, rationale, sign-off table
4. `DRY_RUN_STATUS_TRACKER.md` -- update DRYRUN-001 row to COMPLETED or BLOCKED
5. `BETA_ROLLOUT_SCHEDULE.md` -- fill in Day 1 result and sign-off
6. `BETA_OWNER_CHECKLIST.md` -- mark Day 1 sign-off block
7. `RISK_REGISTER.md` -- add any new risks surfaced during the session
8. `STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md` -- prepare Day 6 update with dry-run results

---

## Public-Release Blockers (Not Resolved Yet)

These block public release but do NOT block the dry-run session:

| Blocker | Status |
|---------|--------|
| LICENSE file | NOT CREATED (stakeholder decision required) |
| Final brand icons | NOT REPLACED (placeholder icons in use) |
| VSIX source-map-free public build | NOT CONFIRMED |
| Staging billing reconciliation | NOT RUN |
| Production billing readiness | NOT VERIFIED |

**Do not claim public release readiness until all blockers are resolved.**

---

## Production Billing Note

Local billing smoke tests pass (requires Docker). Staging and production billing reconciliation
have NOT been run. Do not claim production billing readiness.

See: `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md`

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
