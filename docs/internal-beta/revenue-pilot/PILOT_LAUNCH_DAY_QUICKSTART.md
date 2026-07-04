# Controlled ChatGPT Pilot — Launch Day Quickstart

**Phase:** Controlled ChatGPT Pilot Setup Automation
**Date:** 2026-07-04

> Short and practical. For the full scope this pilot operates within,
> see `CONTROLLED_REVENUE_PILOT_CRITERIA.md`. For the setup automation
> itself, see `docs/internal-beta/final-readiness/PILOT_SETUP_AUTOMATION_REVIEW.md`.

---

1. **Pull latest branch.**
   ```
   git pull --ff-only origin claude/windows-release-pipeline-fix-xfj0sw
   ```

2. **Run `pnpm install`.**
   ```
   pnpm install --frozen-lockfile
   ```

3. **Run `pilot:preflight`.**
   ```
   pnpm -w run pilot:preflight -- --pilot-id <your-pilot-id>
   ```
   Must print **GO for controlled ChatGPT browser pilot setup only.**
   If it prints HOLD, stop — fix every listed reason and re-run.

4. **Confirm budget cap.** Open
   `docs/internal-beta/revenue-pilot/instances/<your-pilot-id>/PILOT_SETUP.md`
   and confirm the budget cap matches what you actually approved.

5. **Confirm manual revenue record.** Open
   `.../instances/<your-pilot-id>/MANUAL_REVENUE_RECORD.md` and confirm
   you understand: no automatic billing, no automatic payout, this is a
   manual paper trail only.

6. **Confirm rollback owner.** Open
   `.../instances/<your-pilot-id>/ROLLBACK_CONFIRMATION.md` and confirm
   the rollback owner's initials and that the rollback plan
   (`PILOT_STOP_ROLLBACK_PLAN.md`) has actually been read.

7. **Launch the controlled ChatGPT pilot.** Follow
   `PILOT_LAUNCH_RUNBOOK.md` for the actual launch steps (seed
   advertiser/campaign, issue API key, load the browser extension). This
   quickstart does not replace that runbook — it is the pre-launch gate
   in front of it.

8. **Monitor only safe diagnostics.** Use `query:local-events`,
   `query:local-ledger`, `query:local-billing-events` — never inspect
   real ChatGPT prompt/response content, page content, or account data.

9. **Stop if any S0/S1 issue appears.** See
   `docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md` for the
   severity guide and `PILOT_STOP_ROLLBACK_PLAN.md` for the rollback
   sequence. When in doubt, stop.

10. **Reconcile after the pilot.** Re-run `pnpm -w run pilot:preflight -- --pilot-id <id>`
    is not required post-pilot, but you must: fill in
    `MANUAL_REVENUE_RECORD.md` with the actual collected amount, re-run
    `check:billing:reconciliation -- --mode internal-beta`, and complete
    `PILOT_ACCEPTANCE_CHECKLIST.md`'s post-pilot section.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real
buyer contact/payment details, real API keys, or real payment
credentials to this document.**
