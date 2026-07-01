# PromptProfit -- Dry-Run Status Tracker

**INTERNAL BETA ONLY. Branch:** claude/ecstatic-maxwell-h0d8d8

---

> This tracker records the status of every dry-run session.
> Update this file after each dry-run session completes or changes state.
> Do NOT change a status to COMPLETED without real tester execution evidence.
> Reference: DRY_RUN_RESULT_LOG_TEMPLATE.md for per-session details.

---

## Dry-Run Sessions

| ID | Date | Tester | Track | Status | Decision | Result Log | Notes |
|----|------|--------|-------|--------|----------|------------|-------|
| DRYRUN-001 | 2026-07-01 | [TBD] | [A/B] | INCONCLUSIVE / RERUN-READY WITH FORCED DEMO FALLBACK | HOLD | DRYRUN-001_RESULT_LOG.md | Confirmed S1/P1 blocker (Issue 001) remains open pending human rerun. A deterministic internal-beta forced demo fallback now renders the banner independent of wait-state detection, generation timing, or API availability -- see DRYRUN-001_DEFINITIVE_BANNER_FIX.md. Selftest proves this in a synthetic fixture; a real ChatGPT rerun is still required to confirm it works there too. |

---

## Status Key

| Status | Meaning |
|--------|---------|
| NOT RUN YET | Session prepared but not yet scheduled or started |
| READY TO RUN | Packet verified; all pre-run checks pass; awaiting tester scheduling |
| SCHEDULED | Session scheduled; tester confirmed; date set |
| IN PROGRESS | Session actively running |
| COMPLETED | Session finished; result log filed; triage done |
| INCONCLUSIVE | Session attempted but key observations could not be confirmed; rerun required |
| READY TO RERUN | Setup issues identified and resolved; rerun scheduled |
| BLOCKED | Session could not complete; blocking issue found |
| CANCELLED | Session cancelled before running |

---

## Decision Key

| Decision | Meaning |
|----------|---------|
| PENDING | No dry-run has completed yet |
| GO | All exit criteria met; proceed to wider beta |
| HOLD | Issue(s) found; fix required; re-run scheduled |
| STOP | Critical issue; beta distribution paused; investigation required |

---

## Open S0/S1 Issues Blocking Go Decision

| Issue # | Title | Severity | Blocking Which Session |
|---------|-------|----------|----------------------|
| DRYRUN-001-ISSUE-001 | Banner not observed on real ChatGPT despite packaged selftest passing | S1 | DRYRUN-001 (and any future session until resolved) |

If no open S0/S1 issues: "None -- no blocking issues."

---

## Dry-Run History

### DRYRUN-001

| Field | Value |
|-------|-------|
| Status | INCONCLUSIVE / RERUN-READY WITH FORCED DEMO FALLBACK |
| Decision | HOLD |
| Worksheet | docs/internal-beta/dry-runs/FIRST_TESTER_DRY_RUN_WORKSHEET.md |
| Owner-Ready Note | docs/internal-beta/dry-runs/DRYRUN-001_OWNER_READY_NOTE.md |
| Inconclusive Note (attempt 1) | docs/internal-beta/dry-runs/DRYRUN-001_ATTEMPT_001_INCONCLUSIVE_NOTE.md |
| Result Log (rerun after 682276f) | docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md |
| Real-ChatGPT Runtime Investigation | docs/internal-beta/dry-runs/DRYRUN-001_REAL_CHATGPT_RUNTIME_INVESTIGATION.md |
| Definitive Banner Fix | docs/internal-beta/dry-runs/DRYRUN-001_DEFINITIVE_BANNER_FIX.md |
| Issues Found | 1 (DRYRUN-001-ISSUE-001, S1/P1 -- remains open until a successful rerun) |
| Open S0 | NONE OBSERVED |
| Open S1 | DRYRUN-001-ISSUE-001 -- banner confirmed not observed on real ChatGPT despite packaged selftest passing; GO blocked; remains open until a successful rerun confirms the banner appears |
| Privacy Result | NOT RE-VERIFIED THIS SESSION -- not the subject of this triage; do not assume clean |
| Billing Result | UNKNOWN -- TREAT AS CONCERN |
| Rollback Result | NOT CONFIRMED -- session did not reach uninstall step |
| Notes | Rerun after commit 682276f showed the banner still did not appear on real ChatGPT despite the packaged selftest passing -- a CONFIRMED S1/P1 blocker (previously mis-classified at S4/P3; corrected). Root cause: the banner depended entirely on wait-state detection succeeding, which live diagnostics could observe but not fix. A deterministic internal-beta forced demo fallback has now been implemented: it renders the banner from extension-load + demo-mode + supported-host + kill-switch-off alone, with NO dependency on wait-state selectors, generation timing, or the ad-decision API. Proven in a synthetic fixture (`dryrun:001:selftest`); a real human rerun on actual chatgpt.com is still required before this can be marked resolved. See DRYRUN-001-ISSUE-001.md and DRYRUN-001_DEFINITIVE_BANNER_FIX.md. |

---

## Next Scheduled Session

| Field | Value |
|-------|-------|
| Session ID | DRYRUN-001 |
| Date | [DATE TBD] |
| Tester | [TESTER TBD] |
| Owner | [OWNER TBD] |
| Format | [In-person / Video call with screen share / TBD] |

---

## Summary

**Total dry-run sessions:** 2 attempted (1 inconclusive/setup, 1 blocked/confirmed defect), 0 completed with GO

**Current beta phase status:**
- Dry-run packet: READY (all checks pass, including `dryrun:001:selftest`, which now
  proves the forced demo fallback -- not just the old wait-state path)
- DRYRUN-001: INCONCLUSIVE / RERUN-READY WITH FORCED DEMO FALLBACK -- Decision: HOLD.
  Real ChatGPT banner confirmed NOT to appear on the prior attempt; S1/P1 blocker
  DRYRUN-001-ISSUE-001 remains open until a successful human rerun; GO blocked.
- Wider beta (Day 2-3): BLOCKED on DRYRUN-001 GO decision
- Public release: BLOCKED (LICENSE, icons, VSIX, staging reconciliation pending)

**Next action:** Owner runs `pnpm -w run dryrun:001:live-checklist`, shares it with the
tester, and schedules a rerun. The tester should expect the demo banner to appear within
seconds of the chatgpt.com page loading -- no login or prompt required for the primary
check. This session must not be finalized as GO, and wider distribution must not be
scheduled, until that rerun succeeds with the banner confirmed visible on real ChatGPT.
