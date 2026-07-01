# PromptProfit -- Go / No-Go Decision Record

**Dry-Run ID:** DRYRUN-001
**Decision Status: HOLD -- DRYRUN-001 blocked 2026-07-01 (rerun after 682276f; S1/P1 issue open)**
**Branch:** claude/ecstatic-maxwell-h0d8d8

---

> Do not change the decision status to GO, HOLD, or STOP without real tester execution evidence.
> Reference: FIRST_TESTER_DRY_RUN_WORKSHEET.md and DRYRUN-001_RESULT_LOG.md
>
> The packaged selftest (`dryrun:001:selftest`) PASSED before this rerun, confirming the banner
> renders correctly in the shipped artifact with demo mode and no API configuration. The real
> ChatGPT session still did not show the banner. This is a CONFIRMED S1/P1 blocker
> (DRYRUN-001-ISSUE-001), not an inconclusive/setup result -- GO remains blocked until the
> real-runtime root cause is diagnosed and fixed.

---

## Decision Participants

| Role | Owner | Available? |
|------|-------|-----------|
| Decision Owner | [OWNER TBD] | [TBD] |
| QA Owner | [OWNER TBD] | [TBD] |
| Privacy Owner | [OWNER TBD] | [TBD] |
| Billing Owner | [OWNER TBD] | [TBD] |
| Release Owner | [OWNER TBD] | [TBD] |

---

## Dry-Run Reference

| Field | Value |
|-------|-------|
| Dry-Run ID | DRYRUN-001 |
| Worksheet | docs/internal-beta/dry-runs/FIRST_TESTER_DRY_RUN_WORKSHEET.md |
| Result Log | docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md |
| Date Executed | 2026-07-01 (rerun after commit 682276f) |
| Tester | [TESTER TBD -- non-engineer, Track A] |
| Release Commit | 682276f |

---

## Decision Criteria

All criteria must be evaluated after the dry-run session completes.
Mark each as MET, NOT MET, or N/A.

| Criterion | Result | Notes |
|-----------|--------|-------|
| Install succeeded without repo access | MET | Extension loaded correctly from ZIP root |
| Packaged selftest passed pre-session (dryrun:001:selftest) | MET | Demo mode banner render confirmed, no API config needed |
| Overlay banner appeared during safe test prompt (real ChatGPT) | **NOT MET** | Confirmed NOT observed -- see DRYRUN-001-ISSUE-001.md (S1/P1) |
| Banner contained placeholder content only (no real data) | N/A | Banner never appeared |
| Close button dismissed banner | N/A | Banner never appeared |
| Privacy rules followed by tester (no leakage) | NOT RE-VERIFIED THIS SESSION | Not the subject of this triage |
| No raw ppft_ key visible in any shared output | MET (not observed) | |
| No S0 privacy/security issue opened | MET | |
| No S1 blocker issue opened | **NOT MET** | DRYRUN-001-ISSUE-001 (S1/P1) open |
| Billing invariant held (if smoke run) | NOT RUN | |
| Install guide was understandable | MET | Correct ZIP-root instruction followed |
| Disable procedure worked | NOT REACHED | Session did not proceed to uninstall step |
| Remove/uninstall procedure worked | NOT REACHED | |
| Tester submitted feedback | [PENDING] | |

---

## Issues Opened During Dry-Run

| Issue # | Title | Severity | Priority | Status |
|---------|-------|----------|----------|--------|
| DRYRUN-001-ISSUE-001 | Banner not observed on real ChatGPT despite packaged selftest passing | S1 | P1 | accepted / needs diagnosis |

Open S0 count: 0
Open S1 count: 1 (DRYRUN-001-ISSUE-001)
Open S2 count: 0

---

## Decision Options

| Decision | Criteria Required |
|----------|-----------------|
| GO | All criteria MET; no open S0/S1 issues; privacy clean |
| HOLD | 1-2 criteria NOT MET or open S1 issues; no S0; fixable before re-run |
| STOP | Any S0 open; billing invariant violated; critical privacy incident; not recoverable without investigation |

---

## CURRENT DECISION: HOLD

**Reason:** DRYRUN-001 blocked 2026-07-01 (rerun after commit 682276f). Decision recorded by
finalize script; severity/priority of the blocking issue corrected per triage review below.

---

## Decision Record (Fill In After Dry-Run)

**Decision:** HOLD

**Rationale:**
The packaged selftest (`dryrun:001:selftest`) PASSED before this session, confirming the shipped
artifact correctly renders the sponsored banner in demo mode with no API configuration required.
Despite this, the real ChatGPT session with a real tester did NOT show the banner. Setup/config
causes (wrong load folder, kill-switch defaulting on, missing API config) are ruled out by the
prior fixes and the passing selftest. This is accepted as a confirmed real-runtime defect, not an
inconclusive/setup result, and is filed as DRYRUN-001-ISSUE-001 at S1 (Beta blocker) / P1 (Fix
before next beta dry-run).

**Triage correction:** An earlier pass had recorded this issue at S4/P3. That classification was
incorrect -- a confirmed banner failure that blocks the core feature under test, surviving an
automated pre-check specifically designed to catch this class of failure, is a beta blocker by
definition. `scripts/dryrun-001-finalize.js` now enforces a floor of S1/P1 for this issue and
auto-files it if a tester session confirms "banner appeared: no."

**Blockers (if HOLD or STOP):**
1. Banner confirmed NOT to appear on real ChatGPT despite packaged selftest passing (DRYRUN-001-ISSUE-001, S1/P1).
2. Billing/ledger status not re-verified this session.
3. Uninstall/rollback status not reached this session.

**Required Fixes Before Re-Run (if HOLD):**
1. Add privacy-safe real-runtime diagnostics (content-script-loaded, wait-state-detected,
   ad-decision-requested/received, banner-render-attempted) without capturing page content.
2. Verify `CHATGPT_PROCESSING_SELECTORS` still match the live chatgpt.com DOM; fix if drifted.
3. Verify `dryRunDemoMode` persists correctly across real install/update flows, not just fresh
   `chrome.runtime.onInstalled` "install" events exercised by the selftest.
4. Extend `dryrun:001:selftest` to cover whichever gap is identified so this cannot recur silently.

---

## Sign-Off Table

| Role | Decision Approved | Signed Date |
|------|-----------------|------------|
| Decision Owner | HOLD (blocked) | 2026-07-01 |
| QA Owner | [PENDING] | [DATE TBD] |
| Privacy Owner | [PENDING -- not re-verified this session] | [DATE TBD] |
| Release Owner | NO -- S1/P1 blocker open | [DATE TBD] |

---

## Next Step After Decision

| Decision | Next Step |
|----------|-----------|
| GO | Proceed to Day 2-3: distribute to 3-5 internal testers |
| HOLD | Fix blocker(s) -> re-run DRYRUN-001 (or create DRYRUN-002) |
| STOP | Execute ROLLBACK_AND_DISABLE_GUIDE.md -> notify stakeholders |

**Public-release blockers are separate and remain open regardless of this decision:**
- LICENSE decision required
- Final brand icons required
- VSIX source-map rebuild required
- Staging billing reconciliation required
- Production billing not verified
