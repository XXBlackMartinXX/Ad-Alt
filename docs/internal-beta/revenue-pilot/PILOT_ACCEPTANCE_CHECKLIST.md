# PromptProfit — Controlled Revenue Pilot Acceptance Checklist

**Phase:** Fast Controlled Revenue Pilot Launch Sprint
**Date:** 2026-07-03

> Use this checklist for every pilot session. Copy it fresh per pilot —
> do not reuse a checked copy from a previous session as evidence for a
> new one (matches the "no stale evidence" rule used throughout this
> repo's gates).

---

## Pre-launch

- [ ] Repo synced (`git status` clean, correct branch, `git log` shows
      the expected latest commit)
- [ ] `pnpm -w run check:revenue-pilot` printed `Result: PASS`
- [ ] Budget cap approved (`CONTROLLED_REVENUE_PILOT_CRITERIA.md` filled in)
- [ ] Advertiser participant approved (agreed to budget cap, manual-invoice
      model, and pilot scope)
- [ ] Developer/tester participant approved (understands no real payout)
- [ ] Privacy constraints acknowledged by all participants (§13-14 of
      `PILOT_LAUNCH_RUNBOOK.md`)
- [ ] No real payout will be executed (confirmed: no such code path
      exists in this repo — `FAST_RELEASE_TRIAGE.md`)
- [ ] Rollback owner assigned and reachable during the pilot window

## During pilot

- [ ] Extension loads and is visible in `chrome://extensions`
- [ ] Sponsored banner renders on real chatgpt.com during a real wait-state
- [ ] Diagnostics panel (extension-owned fields only) confirms
      `extension_loaded`, `adapter_active`, `ad_decision_received`,
      `banner_render_attempted`, `banner_visible` all report yes
- [ ] Ledger entries are created for each billable event (3 per event:
      `advertiser_charge`, `developer_credit`, `platform_fee`)
- [ ] A duplicate/replayed event (if one occurs naturally, e.g. a network
      retry) is confirmed rejected, not double-billed
- [ ] No forbidden private field appears in any event or ledger row
      (extension-owned diagnostics only — no prompt/response/page content)
- [ ] Budget cap is being monitored (`spentMicrocents` vs.
      `budgetMicrocents`); campaign correctly transitions to `"exhausted"`
      if the cap is reached
- [ ] Kill-switch procedure is confirmed available (rollback owner has
      DB access ready, per `KILL_SWITCH_AND_ROLLBACK_REVIEW.md`)

## Post-pilot

- [ ] `pnpm -w run check:billing:reconciliation -- --mode internal-beta`
      re-run and PASS
- [ ] `pnpm -w run simulate:payouts` re-run (informational payout-status
      classification only — no real payout)
- [ ] Any issue found during the pilot logged using
      `docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md`
- [ ] Stop/continue decision made and recorded (continue to a second
      pilot session, or hold pending fixes)
- [ ] `MANUAL_REVENUE_RECORD_TEMPLATE.md` filled in with what was actually
      collected (if anything was collected this session)
- [ ] No public-release claim made anywhere as a result of this pilot —
      public release remains blocked regardless of pilot outcome

---

**Sign-off**

| Role | Name | Date | Signature/confirmation |
|------|------|------|--------------------------|
| Operator | | | |
| Rollback owner | | | |
| Founder/Owner | | | |

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
