# Controlled ChatGPT Pilot — Launch Day Quickstart

**Phase:** One-Command Controlled ChatGPT Pilot Launch Automation
**Date:** 2026-07-05

> Short and practical. For the full scope this pilot operates within,
> see `CONTROLLED_REVENUE_PILOT_CRITERIA.md`. For what the launch
> automation does and does not do, see `pilot:launch --dry-run`'s own
> output, or `docs/internal-beta/final-readiness/PILOT_SETUP_AUTOMATION_REVIEW.md`.

---

## Default flow

1. **Check status.**
   ```
   pnpm -w run pilot:status -- --pilot-id <your-pilot-id>
   ```
   Shows setup status, budget cap, last known preflight result, and the
   next recommended command. Read-only, no gates re-run.

2. **Launch.**
   ```
   pnpm -w run pilot:launch -- --pilot-id <your-pilot-id>
   ```
   Runs every local preflight gate fresh, validates the pilot instance,
   writes a sanitized launch-session record, and — only on GO — opens
   local operator docs and a fresh disposable Chrome profile pointed at
   `chatgpt.com`. Prints exactly which manual actions remain. A HOLD
   result means: fix every listed reason and re-run; nothing is opened.

   Preview first with `--dry-run` (never opens a browser unless you also
   pass `--open-browser`, and never writes into the real pilot instance
   folder):
   ```
   pnpm -w run pilot:launch -- --pilot-id <your-pilot-id> --dry-run
   ```

3. **Human performs the ChatGPT pilot manually** inside the opened
   browser. Log in yourself, run the pilot interaction yourself. This
   automation never logs in, types/submits a prompt, or reads page/chat
   content. Monitor only safe diagnostics (`query:local-events`,
   `query:local-ledger`, `query:local-billing-events`) — never real
   ChatGPT prompt/response content. Stop immediately on any S0/S1 issue
   (see the launch session's `STOP_CONDITIONS.md` and
   `PILOT_STOP_ROLLBACK_PLAN.md`).

4. **Closeout.**
   ```
   pnpm -w run pilot:closeout -- --pilot-id <your-pilot-id>
   ```
   Asks six safe yes/no questions and writes `PILOT_CLOSEOUT_SUMMARY.md`.
   `STOP_REVIEW_REQUIRED` means a human must review before reconciling;
   `CLOSED_READY_FOR_RECONCILIATION` means proceed with reconciliation:
   fill in `MANUAL_REVENUE_RECORD.md` with the actual amount collected,
   re-run `check:billing:reconciliation -- --mode internal-beta`, and
   complete `PILOT_ACCEPTANCE_CHECKLIST.md`'s post-pilot section.

---

## First-time setup (before the above applies)

If you don't have a pilot instance yet, run `pnpm -w run pilot:setup`
first — see `docs/internal-beta/revenue-pilot/instances/README.md`.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real
buyer contact/payment details, real API keys, or real payment
credentials to this document.**
