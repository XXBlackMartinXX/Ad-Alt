# PromptProfit -- DRYRUN-001 Result Log

**Dry-Run ID:** DRYRUN-001
**Status: PASS WITH ISSUES**
**Date:** 2026-07-02
**Branch:** claude/windows-release-pipeline-fix-xfj0sw
**Commit:** 14bf30a
**Decision:** HOLD

---

> Result recorded by dryrun-001-finalize.js on 2026-07-02.
> Real human tester participated in this session, on a real Windows machine with real Chrome.
> Privacy rules enforced: no personal data, no API keys, no ChatGPT content recorded.

> **This is the first DRYRUN-001 session where the core product functionality is confirmed
> working on real chatgpt.com.** Browser screenshots confirmed PromptProfit visible and
> enabled in chrome://extensions, the internal-beta live dry-run diagnostics panel present
> on chatgpt.com, and the demo sponsored banner visible in the bottom-right corner. The
> diagnostics panel reported: extension loaded (yes), demo mode (yes), platform detected
> (chatgpt), adapter active (yes), demo fallback rendered (yes), ad decision received (yes),
> banner render attempted (yes), banner visible (yes). This resolves
> DRYRUN-001-ISSUE-001 (banner not observed on real ChatGPT) -- see that issue file for the
> resolution record.
>
> **A separate, distinct issue was found and filed this session:** the `dryrun:001:launch-chrome`
> verified launcher itself reported `BLOCKED_EXTENSION_LOAD` during this session, even though
> the extension was genuinely loaded and rendering correctly (confirmed by the same
> diagnostics evidence above). This is a release-AUTOMATION defect, not a product defect --
> see DRYRUN-001-ISSUE-002.md for the root-cause investigation and the fix applied in commit
> history after this session (multi-encoding extension-id prediction plus a Layer 4
> runtime-DOM rescue check that overrides a stale/incorrect id-based registration result).
>
> **Decision rationale:** the session's own recorded answers (safe prompt used, banner
> appeared, close/disable worked, uninstall/remove worked, no privacy issue, no billing
> concern) contain no GO-blocking answer under this project's decision rules, and the one
> issue found (launcher automation, S2) does not meet the S0/S1 floor that forces HOLD by
> rule. HOLD was nonetheless chosen deliberately, as a matter of release-process discipline:
> the release-automation tooling itself was not trustworthy at the moment of this session
> (it produced a false BLOCKED result for a session that actually worked), and shipping a
> wider beta on the back of automation known to be unreliable at session time is not
> justified merely because the manual/human evidence happened to be positive. GO is reserved
> for a rerun (or a fresh automated confirmation) after the launcher fix is itself verified.

---

## 1. Summary

| Field | Value |
|-------|-------|
| Dry-Run ID | DRYRUN-001 |
| Date | 2026-07-02 |
| Tester Role | engineer (Track B) |
| Tester Track | B |
| Owner | [OWNER TBD] |
| Release Commit | 14bf30a (session under test; launcher fix landed later on this same branch) |
| Package Artifact | promptprofit-browser-beta ZIP built for this session |
| Package Audit | PASS (internal-beta) |
| Overall Status | PASS WITH ISSUES |
| Decision | HOLD |

---

## 2. Status

**Current Status: PASS WITH ISSUES**

**Reason:** Every tracked observation (safe prompt used, banner appeared, close/disable
worked, uninstall/remove worked, privacy issue, billing/ledger concern) was answered
definitively (no UNKNOWN answers), and the one issue found (launcher automation
false-negative, S2) does not meet the S0/S1 GO-blocking floor. Per this project's
finalize-script decision rules that combination maps to PASS WITH ISSUES / COMPLETED, not
BLOCKED/INCONCLUSIVE. Decision was nonetheless set to HOLD by deliberate choice -- see
rationale above.

---

## 3. Environment

| Field | Value |
|-------|-------|
| OS | Windows (real machine; exact build not recorded) |
| Chrome Version | [record from tester -- not captured in this log] |
| Extension Loaded From | ZIP (dist-package), loaded via assisted manual-load after automatic `--load-extension` did not verify |
| Node.js Version | N/A (Track B did not require local Node for the tester's own actions; the launcher used to build the package runs on Node) |

---

## 6. Tester Actions

1. Received/built the beta package artifact.
2. Ran `pnpm -w run dryrun:001:launch-chrome`. Automatic `--load-extension` (mode A and
   mode B) did not verify registration; the launcher's assisted manual-load mode opened
   chrome://extensions and the extracted folder, and the tester completed Load Unpacked
   manually (install succeeded, but WITH assistance, not automatically).
3. Confirmed PromptProfit visible and enabled in chrome://extensions.
4. Navigated to chatgpt.com (already logged in).
5. Used an approved safe prompt.
6. Observed the demo sponsored banner (bottom-right) and the internal-beta live dry-run
   diagnostics panel; recorded the diagnostics panel's field values (see below).
7. Tested close (banner X button), disable, and uninstall/remove procedures.

---

## 7. Observed Results

| Observation | Result |
|-------------|--------|
| Install succeeded without assistance | NO -- automatic `--load-extension` did not verify; assisted manual-load mode was needed, and manual Load Unpacked then succeeded |
| Extension loaded in Chrome (chrome://extensions) | YES |
| Diagnostics panel: extension_loaded | YES |
| Diagnostics panel: demo_mode | YES |
| Diagnostics panel: platform_detected | chatgpt |
| Diagnostics panel: adapter_active | YES |
| Diagnostics panel: demo_fallback_rendered | YES |
| Diagnostics panel: ad_decision_received | YES |
| Diagnostics panel: banner_render_attempted | YES |
| Diagnostics panel: banner_visible | YES |
| Overlay banner appeared during response (real ChatGPT) | YES (confirmed) |
| Banner close button worked | YES |
| Disable turned off banner | YES |
| Remove uninstalled cleanly | YES |
| Safe prompt used exactly as approved | YES |
| Launcher (`dryrun:001:launch-chrome`) final state | BLOCKED_EXTENSION_LOAD -- FALSE NEGATIVE (contradicted by all evidence above); see DRYRUN-001-ISSUE-002.md |

---

## 8. Issues Found

| # | Title | Severity | Area | Status | GitHub Issue # |
|---|-------|----------|------|--------|----------------|
| 1 | Launcher verification false-negative after PromptProfit loaded and rendered | S2 | area:release-automation, area:dry-run | fix implemented, pending real-Windows reconfirmation | [Internal tracking only] |

See: docs/internal-beta/dry-runs/issues/DRYRUN-001-ISSUE-002.md (DRYRUN-001-ISSUE-001, the
original banner-not-observed defect, is RESOLVED by this session's evidence -- see that
file's resolution record; it is not re-listed here as an open issue).

---

## 9. Privacy and Security Observations

- Privacy/security issue observed: NO
- ppft_ key visible in shared output: NOT OBSERVED
- ChatGPT content shared by tester: NOT RECORDED
- S0 event triggered: NO

---

## 10. Billing and Ledger Observations

- Billing/ledger concern observed: NO
- Billing smoke run during session: NOT RUN (requires Docker; optional for Track B)
- Billing invariant check: NOT RUN IN REAL TESTER SESSION

---

## 11. Rollback / Uninstall Result

- Disable procedure tested: YES
- Remove procedure tested: YES
- Remove verified: YES
- Full rollback triggered: NO (not needed -- no S0/S1 product defect found)

---

## 13. Triage Outcome

Triage completed: NEEDS TRIAGE (tracking/fix-verification only -- not a GO-blocking product defect)

| Issue # | Severity | Priority | Assigned To | Target Fix |
|---------|----------|----------|-------------|-----------|
| 1 | S2 | P2 | [OWNER TBD -- Engineering] | Fix implemented same branch; reconfirm on real Windows before closing |

---

## 14. Next Action

| Next Action | Details | Owner | Target Date |
|-------------|---------|-------|------------|
| Reconfirm the launcher fix on a real Windows machine | Root-cause fix (multi-encoding extension-id prediction + Layer 4 runtime-DOM rescue override) implemented and covered by automated tests; re-run `pnpm -w run dryrun:001:launch-chrome` on a real Windows machine and confirm it reaches PASS without needing assisted manual-load, or (if it still needs assisted mode) that it no longer reports BLOCKED_EXTENSION_LOAD once the extension is genuinely loaded | [OWNER TBD] | [DATE TBD] |
| Do NOT schedule wider beta distribution on automation alone | Manual/human evidence is positive, but decision remains HOLD until the release-automation tooling itself is trusted again | [OWNER TBD] | N/A |

---

## 15. Sign-Off Table

| Role | Approved | Date |
|------|---------|------|
| Dry-Run Owner | [YES / NO / TBD] | 2026-07-02 |
| QA Owner | [YES / NO / TBD] | [DATE TBD] |
| Privacy Owner | [YES / NO / TBD] | [DATE TBD] |
| Release Owner | NO -- HOLD pending release-automation fix reconfirmation | [DATE TBD] |

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
