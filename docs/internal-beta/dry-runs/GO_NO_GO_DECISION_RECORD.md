# PromptProfit -- Go / No-Go Decision Record

**Dry-Run ID:** DRYRUN-001
**Decision Status: HOLD -- DRYRUN-001 completed 2026-07-02 (real Windows session; functional PASS, release-automation issue open)**
**Branch:** claude/windows-release-pipeline-fix-xfj0sw

---

> Do not change the decision status to GO, HOLD, or STOP without real tester execution evidence.
> Reference: FIRST_TESTER_DRY_RUN_WORKSHEET.md and DRYRUN-001_RESULT_LOG.md
>
> This session's real Windows tester confirmed the demo sponsored banner AND the internal-beta
> live dry-run diagnostics panel both render correctly on real chatgpt.com (diagnostics reported
> extension_loaded/demo_mode/adapter_active/demo_fallback_rendered/ad_decision_received/
> banner_render_attempted/banner_visible all YES). This RESOLVES DRYRUN-001-ISSUE-001. A
> separate, S2 release-automation issue (DRYRUN-001-ISSUE-002) was found in the same session:
> the `dryrun:001:launch-chrome` launcher reported BLOCKED_EXTENSION_LOAD despite this same
> positive evidence. Per this project's decision rules, that S2 issue alone does not force HOLD
> -- GO was a permitted choice. HOLD was chosen deliberately as a matter of release-process
> discipline (see rationale below), not because of any open product/privacy/billing defect.

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
| Date Executed | 2026-07-02 (real Windows machine, real Chrome, real chatgpt.com) |
| Tester | [TESTER TBD -- engineer, Track B] |
| Release Commit | 14bf30a (session under test; launcher automation fix landed after, same branch) |

---

## Decision Criteria

All criteria must be evaluated after the dry-run session completes.
Mark each as MET, NOT MET, or N/A.

| Criterion | Result | Notes |
|-----------|--------|-------|
| Install succeeded without repo access | N/A (Track B, engineer) | Automatic `--load-extension` did NOT verify; assisted manual-load mode was needed -- install succeeded WITH assistance |
| Packaged selftest passed pre-session (dryrun:001:selftest) | MET | Demo mode banner render confirmed, no API config needed |
| Overlay banner appeared during safe test prompt (real ChatGPT) | **MET** | Confirmed visible -- resolves DRYRUN-001-ISSUE-001 |
| Diagnostics panel confirmed extension_loaded/demo_fallback_rendered/banner_visible | MET | All reported YES |
| Banner contained placeholder content only (no real data) | MET | |
| Close button dismissed banner | MET | |
| Privacy rules followed by tester (no leakage) | MET | No privacy/security issue observed this session |
| No raw ppft_ key visible in any shared output | MET (not observed) | |
| No S0 privacy/security issue opened | MET | |
| No S1 blocker issue opened | MET | DRYRUN-001-ISSUE-001 resolved this session; no new S0/S1 found |
| Billing invariant held (if smoke run) | NOT RUN | No billing/ledger concern observed |
| Install guide was understandable | PARTIALLY MET | Manual/assisted Load Unpacked path was needed and worked; automatic path did not |
| Disable procedure worked | MET | |
| Remove/uninstall procedure worked | MET | |
| Release-automation launcher (`dryrun:001:launch-chrome`) reported an accurate result | **NOT MET** | Reported BLOCKED_EXTENSION_LOAD despite all evidence above being positive -- DRYRUN-001-ISSUE-002 (S2); fix implemented, pending real-Windows reconfirmation |
| Tester submitted feedback | [PENDING] | |

---

## Issues Opened / Resolved During Dry-Run

| Issue # | Title | Severity | Priority | Status |
|---------|-------|----------|----------|--------|
| DRYRUN-001-ISSUE-001 | Banner not observed on real ChatGPT despite packaged selftest passing | S1 | P1 | **RESOLVED** this session -- banner confirmed visible |
| DRYRUN-001-ISSUE-002 | Launcher verification false-negative after PromptProfit loaded and rendered | S2 | P2 | fix implemented, pending real-Windows reconfirmation |

Open S0 count: 0
Open S1 count: 0
Open S2 count: 1 (DRYRUN-001-ISSUE-002)

---

## Decision Options

| Decision | Criteria Required |
|----------|-----------------|
| GO | All criteria MET; no open S0/S1 issues; privacy clean |
| HOLD | 1-2 criteria NOT MET or open S1 issues; no S0; fixable before re-run |
| STOP | Any S0 open; billing invariant violated; critical privacy incident; not recoverable without investigation |

Per this table, this session's evidence (no open S0/S1, privacy clean) technically permits
GO. The decision below (HOLD) was made by deliberate choice beyond what the automated rule
requires -- see rationale.

---

## CURRENT DECISION: HOLD

**Reason:** DRYRUN-001 completed 2026-07-02 with a functional PASS on real chatgpt.com and
one open S2 release-automation issue. Decision recorded by finalize script inputs; HOLD was
selected by the session owner even though the automated decision rules did not require it.

---

## Decision Record (Fill In After Dry-Run)

**Decision:** HOLD

**Rationale:**
Every tracked observation in this session was positive: the demo banner and the live
dry-run diagnostics panel both rendered correctly on real chatgpt.com, close/disable/
uninstall all worked, and no privacy or billing concern was observed. This resolves
DRYRUN-001-ISSUE-001 (the S1/P1 blocker from the prior session). No S0/S1 issue was found
in this session, so this project's own decision rules (see Decision Options above) do not
force HOLD -- GO was a permitted choice.

HOLD was chosen anyway, deliberately, because the release-automation tooling itself proved
unreliable during this exact session: `dryrun:001:launch-chrome` reported
`BLOCKED_EXTENSION_LOAD`, directly contradicting the positive manual/human evidence
recorded above (filed as DRYRUN-001-ISSUE-002, S2). Shipping a wider beta on the strength
of manual evidence alone, while the automated release-verification tooling that is
supposed to gate exactly this kind of rollout is known to produce false negatives, is not
sound release process -- even though the underlying PRODUCT has no known blocking defect.
The root cause has been diagnosed and a fix implemented (see DRYRUN-001-ISSUE-002.md and
DRYRUN-001_CHROME_EXTENSION_LOAD_FAILURE.md), but it has not yet been reconfirmed against a
real Windows machine. HOLD remains until that reconfirmation, at which point GO becomes a
straightforward decision given the product evidence already on record.

**Blockers (if HOLD or STOP):**
1. Release-automation launcher (`dryrun:001:launch-chrome`) reported a false
   `BLOCKED_EXTENSION_LOAD` in this exact session (DRYRUN-001-ISSUE-002, S2) -- fix
   implemented, not yet reconfirmed on real Windows.

No product, privacy, or billing blocker is open.

**Required Fixes Before GO (if HOLD):**
1. Reconfirm the launcher fix (multi-encoding extension-id prediction covering the
   Windows UTF-16LE vs. POSIX UTF-8 path-hash difference, plus a Layer 4 runtime-DOM
   rescue check that accepts the extension's own rendered diagnostics/banner as proof of
   load when id-based checks are stale or wrong) on a real Windows machine.
2. Re-run (or reconfirm) `pnpm -w run dryrun:001:launch-chrome` and confirm it no longer
   reports BLOCKED_EXTENSION_LOAD for a genuinely working install.

---

## Sign-Off Table

| Role | Decision Approved | Signed Date |
|------|-----------------|------------|
| Decision Owner | HOLD (functional PASS; automation issue open) | 2026-07-02 |
| QA Owner | [PENDING] | [DATE TBD] |
| Privacy Owner | [PENDING] | [DATE TBD] |
| Release Owner | NO -- HOLD pending release-automation fix reconfirmation | [DATE TBD] |

---

## Next Step After Decision

| Decision | Next Step |
|----------|-----------|
| GO | Proceed to Day 2-3: distribute to 3-5 internal testers |
| HOLD | Reconfirm the release-automation fix -> owner may then re-open this decision as GO, or schedule a fresh confirmation session |
| STOP | Execute ROLLBACK_AND_DISABLE_GUIDE.md -> notify stakeholders |

**Public-release blockers are separate and remain open regardless of this decision:**
- LICENSE decision required
- Final brand icons required
- VSIX source-map rebuild required
- Staging billing reconciliation required
- Production billing not verified
