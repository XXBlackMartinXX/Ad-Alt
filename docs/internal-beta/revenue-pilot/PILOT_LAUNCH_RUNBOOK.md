# PromptProfit — Controlled Revenue Pilot Launch Runbook

**Phase:** Fast Controlled Revenue Pilot Launch Sprint
**Date:** 2026-07-03

> Short, practical, executable. For the full decision context see
> `CONTROLLED_REVENUE_PILOT_CRITERIA.md` and `FAST_REVENUE_PATH_AUDIT.md`.

---

## 1. Who can run the pilot

The founder/operator, or an engineer explicitly assigned by the founder.
Do not delegate this to someone unfamiliar with
`CONTROLLED_REVENUE_PILOT_CRITERIA.md`.

## 2. Pre-launch commands

```bash
git status                      # must be clean
git branch --show-current       # must be claude/windows-release-pipeline-fix-xfj0sw (or your team's current branch)
pnpm install --frozen-lockfile
pnpm -r build
pnpm -w run check:revenue-pilot
```

`check:revenue-pilot` must print `Result: PASS`. If it prints `HOLD` or
`STOP`, do not proceed — read the printed reason and fix it first.

## 3. How to confirm extension/runtime health

DRYRUN-001 already confirmed the extension loads, renders, and closes
cleanly on real ChatGPT (see
`docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md`). Do not re-debug
the banner unless something has genuinely regressed. If you must
re-verify:

```bash
pnpm -w run smoke:chatgpt:fixture
```

All 27 tests should pass.

## 4. How to confirm ledger health

```bash
pnpm -w run check:ledger:confidence
```

Must print `Result: PASS` (17/17). This uses the real production ledger
math against synthetic data — it does not touch the pilot's real seeded
data, but confirms the code itself is sound before you seed anything real.

## 5. How to confirm privacy health

```bash
pnpm -w run check:monetization:privacy
pnpm -w run check:secrets:local
```

Both must pass with zero findings.

## 6. How to set the budget cap manually

Fill in `CONTROLLED_REVENUE_PILOT_CRITERIA.md`'s "Budget cap placeholder"
table first. Then, when seeding the real campaign (see §7-8), set:

- `campaigns.budgetMicrocents` = total cap in microcents (e.g. $10.00 =
  `10_000_000`)
- `campaigns.dailyBudgetMicrocents` = daily cap in microcents (e.g. $2.00
  = `2_000_000`)
- `campaigns.cpmBidMicrocents` = agreed CPM in microcents (e.g. $0.50 CPM
  = `500_000`)

This is enforced atomically and automatically by
`apps/api/src/services/ledger.service.ts` — once `spentMicrocents` would
exceed `budgetMicrocents`, the campaign is marked `"exhausted"` and stops
billing. You do not need to monitor spend manually to prevent overspend,
but you should still watch it (see §10).

## 7. How to record advertiser agreement manually

Before seeding anything: get the advertiser's explicit agreement to the
budget cap, the manual-invoice payment model, and the fact this is a
controlled pilot (not a production ad platform). Record this in
`MANUAL_REVENUE_RECORD_TEMPLATE.md` once payment is later collected — the
agreement itself does not need application code; a written/email
confirmation is sufficient and should be kept outside this repository
(never commit advertiser correspondence here).

## 8. How to record campaign details manually

Seed the real advertiser, campaign, and creative directly into the
database, following the exact pattern already proven in
`packages/database/src/seed.ts` (advertiser user + profile + balance,
campaign `status: "active"` with your budget caps from §6, one creative
`status: "approved"` + a creative review record). Do not build a new
seed script for this unless the existing one cannot be adapted — reuse
`db:seed`'s pattern with your pilot's real values substituted for
"Acme Corp."

```bash
pnpm -w run db:migrate   # ensure schema is current
# Adapt packages/database/src/seed.ts's pattern with real pilot data,
# or run it as-is against a pilot-specific database if a placeholder
# advertiser is acceptable for this pilot.
```

## 9. How to start the pilot

1. Start the local stack: `docker compose up -d` (Postgres, Redis; see
   `docker-compose.yml`).
2. Start the API: `pnpm -w run dev:api`.
3. Issue the pilot tester's API key via `POST /v1/auth/exchange` (needs
   the seeded developer user's `userId`).
4. Configure the browser extension's `apiBaseUrl` and `apiKey` (extension
   storage — see `docs/internal-beta/BETA_TESTER_INSTALLATION_GUIDE.md`
   for the exact settings flow) to point at your local/pilot API instance.
5. Have the pilot tester load the extension and use ChatGPT normally —
   **do not automate their login or prompt entry (CANARY 8).**

## 10. What to monitor

- Campaign `spentMicrocents` vs. `budgetMicrocents` (should never exceed
  the cap — this is enforced, but watch it).
- Ledger entries via `query:local-ledger` (three entries per billable
  event, invariant holds).
- Kill-switch reachability (confirm you know how to flip
  `featureFlags.kill_switch_all_ads` before you need it — see
  `PILOT_STOP_ROLLBACK_PLAN.md`).
- The extension's diagnostics panel (extension-owned fields only — never
  the ChatGPT page itself).

## 11. How to stop immediately

See `PILOT_STOP_ROLLBACK_PLAN.md` for the full trigger list and exact
commands. Fastest single action: set `kill_switch_all_ads = true` in the
`featureFlags` table — this stops billing on the very next event,
server-side, immediately (verified in
`KILL_SWITCH_AND_ROLLBACK_REVIEW.md` §5).

## 12. How to record results

1. Run `pnpm -w run check:billing:reconciliation -- --mode internal-beta`
   and confirm PASS.
2. Run `pnpm -w run simulate:payouts` to see what a hypothetical payout
   status would classify to (informational only — no real payout).
3. Fill in `MANUAL_REVENUE_RECORD_TEMPLATE.md` with what was actually
   collected.
4. File any issue found using
   `docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md`.
5. Complete `PILOT_ACCEPTANCE_CHECKLIST.md`'s post-pilot section.

## 13. What screenshots are forbidden

Any screenshot containing: the ChatGPT conversation itself (prompt or
response text), the browser address bar showing a real conversation URL,
personal information of any kind, or raw API keys. **Only screenshot the
extension's own diagnostics panel or the sponsored banner in isolation,
cropped to exclude any ChatGPT conversation content.**

## 14. What data is forbidden

Prompt text, response text, chat history, full URLs/query params/
conversation IDs, page content, DOM text, cookies, tokens, localStorage,
sessionStorage, clipboard contents, screenshots/videos/traces of a real
conversation, private APIs, real payment credentials, real card/bank
data. See CANARY 9 and CANARY 10.

## 15. Final go/no-go checklist

- [ ] `pnpm -w run check:revenue-pilot` printed `Result: PASS`
- [ ] Budget cap filled in and advertiser has agreed to it
- [ ] Advertiser and developer/tester both understand this is a
      controlled, manually-invoiced pilot — not production
- [ ] Rollback owner assigned and knows the kill-switch procedure
- [ ] `docs/internal-beta/revenue-pilot/GO_NO_GO_CONTROLLED_REVENUE_PILOT.md`
      says GO

If all boxes are checked, proceed. If any is unchecked, do not launch.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
