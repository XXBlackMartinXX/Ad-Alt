# PromptProfit — Internal Pilot Operator Runbook

**Phase:** Internal Beta Pilot Rehearsal
**Date:** 2026-07-02
**Audience:** the operator running the pilot rehearsal — written to be
usable by someone who is not a software engineer, as long as they can run
a terminal command and read PASS/FAIL output.

---

## 1. Purpose

Walk you through running the internal beta pilot rehearsal — a fully
synthetic, no-real-money dress rehearsal of the billing/ledger/payout
pipeline — and tell you exactly what to do with the result.

## 2. Required repo state

- Working tree clean (`git status` shows "nothing to commit").
- Dependencies installed (`pnpm install --frozen-lockfile` has been run).
- The workspace has been built at least once (`pnpm -r build`) — the
  rehearsal loads the real, compiled `@ad-alt/ledger` and `@ad-alt/fraud`
  packages, not source TypeScript.

## 3. Required branch

`claude/windows-release-pipeline-fix-xfj0sw` (or whatever branch your team
is currently using for this work — confirm with `git branch --show-current`
before you start).

## 4. Required commands

```bash
pnpm install --frozen-lockfile
pnpm -r build
```

## 5. Pre-flight checklist

- [ ] `git status` shows a clean working tree
- [ ] `git branch --show-current` matches the expected branch
- [ ] `pnpm install --frozen-lockfile` completed with no errors
- [ ] `pnpm -r build` completed with no errors
- [ ] `pnpm -w run check:secrets:local` passes (no leaked keys before you start)
- [ ] You have NOT been asked to invite a real advertiser, real developer,
      or real payment account into anything below — if you have been
      asked that, STOP and escalate (see §11) before proceeding; this
      rehearsal is synthetic-only

## 6. How to run the pilot rehearsal

Run this single command:

```bash
pnpm -w run pilot:rehearsal
```

It will print a scenario-by-scenario PASS/FAIL log to your terminal and
write a full report to
`docs/internal-beta/monetization/PILOT_REHEARSAL_REPORT.md`. Open that
file after the command finishes — it has the same information as the
terminal output, formatted for sharing with a reviewer.

Then run the supporting checks, in this order:

```bash
pnpm -w run check:ledger:confidence
pnpm -w run check:monetization:privacy
pnpm -w run simulate:payouts
pnpm -w run check:billing:reconciliation -- --mode internal-beta
pnpm -w run check:secrets:local
```

All six commands should exit with no error (a clean terminal prompt
returns, no red "ELIFECYCLE" or "Command failed" text).

## 7. Expected PASS outputs

`pilot:rehearsal` ends with a block that looks like this:

```
=== Summary ===
  Passed: 30
  Failed: 0 (critical: 0, normal: 0)

Result: PASS
```

`check:ledger:confidence` ends with `Result: PASS` (17/17).
`check:monetization:privacy` ends with `Result: PASS` (6/6).
`simulate:payouts` ends with `Invariant (earned + retained == charged): PASS`.
`check:billing:reconciliation -- --mode internal-beta` ends with
`[PASS] Billing reconciliation readiness check passed.` (a `[WARN]` line
about staging/production not being verified is expected and normal — see
§16).
`check:secrets:local` ends with `[OK] No API key leaks detected`.

If every command above shows a PASS-shaped ending, the rehearsal is
complete and you may move to the next step in your team's process (which
is NOT automatically "invite a real pilot participant" — that is a
separate decision made by the release manager, not by this checklist).

## 8. What HOLD means

If `pilot:rehearsal` ends with `Result: HOLD`, one or more **non-critical**
checks failed (for example, a payout-status classification did not match
what was expected, but no money-math, duplicate-billing, or privacy
invariant was violated). Do this:

1. Open `PILOT_REHEARSAL_REPORT.md` and read the "Open issues" section —
   it lists exactly which checks failed.
2. File an issue using `PILOT_ISSUE_TEMPLATE.md` for each one.
3. Do NOT proceed to inviting any real pilot participant.
4. Escalate to engineering (see §11) to fix the underlying script or
   fixture, then re-run the rehearsal from the top.

## 9. What STOP means

If `pilot:rehearsal` ends with `Result: STOP`, a **critical** invariant
failed — this means privacy, split-math correctness, or duplicate-billing
protection is not working as expected, even in the synthetic rehearsal.

1. Do NOT proceed with anything further today.
2. File an S0 or S1 issue immediately using `PILOT_ISSUE_TEMPLATE.md`.
3. Escalate to engineering and the release manager immediately (see §11).
4. Do not attempt to "work around" a STOP by re-running with different
   inputs — the rehearsal's synthetic data is fixed and deterministic;
   a STOP means something in the code itself needs investigation.

## 10. How to record issues

Use `docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md` for every
issue found during a rehearsal, whether the rehearsal result was HOLD or
STOP, or even if the rehearsal PASSED but you noticed something worth
tracking (severity S3/S4 issues can still be filed against a PASS run).
Fill in every field — severity, area, expected vs actual result, and
whether rollback is needed.

## 11. How to escalate

| Situation | Escalate to |
|-----------|-------------|
| HOLD result | Engineering owner (see `MONETIZATION_RISK_REGISTER.md` for current owner assignments) |
| STOP result | Engineering owner AND release manager, same day |
| You were asked to use real accounts/real money in this rehearsal | Release manager immediately — this rehearsal must never touch real accounts or real money; treat any such request as a process error to flag, not to follow |
| A command in §6 errors out before producing a PASS/HOLD/STOP result at all | Engineering owner — this may indicate an environment problem (see §16 for known environment limitations) rather than a genuine invariant failure |

## 12. Rollback steps

This rehearsal makes no persistent writes outside its own generated
markdown report — no database, no Redis, no real account is touched, so
there is nothing to "roll back" from running it. If a STOP result makes
you suspect something in the broader system (not just this rehearsal) may
be misbehaving, follow `docs/internal-beta/ROLLBACK_AND_DISABLE_GUIDE.md`
and `docs/internal-beta/monetization/KILL_SWITCH_AND_ROLLBACK_REVIEW.md`
for the actual system-level rollback/disable procedures.

## 13. Kill-switch steps

See `docs/internal-beta/monetization/KILL_SWITCH_AND_ROLLBACK_REVIEW.md`
for the full review of what can be disabled immediately versus what
requires a code change or infrastructure access. This rehearsal itself has
no kill-switch of its own to operate — it is a read-only, synthetic-data
exercise.

## 14. Privacy rules

- Never paste real ChatGPT prompt text, response text, chat history, page
  content, page titles, full URLs, cookies, tokens, or personal user data
  into this rehearsal's fixtures, its generated report, an issue you file,
  or any chat/ticket describing a rehearsal result.
- The rehearsal's own privacy check (§9 of `pilot:rehearsal`'s output)
  already verifies no forbidden field appears in any generated ledger row
  or in the report itself — do not weaken or skip this check.
- If you are unsure whether something is safe to paste into an issue,
  don't paste it — describe it in your own words instead.

## 15. What NOT to do

- Do NOT use a real advertiser account, real developer account, real
  email address belonging to an actual person, or real payment
  information anywhere in this rehearsal.
- Do NOT attempt to connect this rehearsal to a real payment processor —
  none is integrated in this codebase, and adding one is explicitly out
  of scope for this phase.
- Do NOT skip the privacy check or the reconciliation check "just to get
  a PASS faster."
- Do NOT treat a stale `PILOT_REHEARSAL_REPORT.md` left over from a
  previous run as current evidence — always re-run `pilot:rehearsal`
  fresh before relying on its result (this mirrors the fix already made to
  `check:billing:reconciliation`, which now re-runs its generator scripts
  fresh rather than trusting old markdown).
- Do NOT invite a real, controlled pilot participant based solely on this
  rehearsal passing — that is a separate decision for the release manager,
  documented in `GO_NO_GO_INTERNAL_PILOT_REHEARSAL.md`.

## 16. Public-release warning

**This rehearsal does not make public release ready.** Public release
remains blocked by `check:license`, `package:browser:zip:audit`, and
`package:vscode:vsix:audit`, all `--mode public-release` — these
continue to fail regardless of this rehearsal's outcome, and that is
correct and expected. Do not report this rehearsal passing as evidence
that public release is ready.

## 17. Production warning

**This rehearsal does not make production ready.** Staging and production
billing reconciliation have not been run (see
`docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md` — its audit log is still
empty). `check:billing:reconciliation -- --mode public-release` continues
to fail for this reason, correctly. Do not report this rehearsal passing
as evidence that production billing is verified.

## 18. Real-payout warning

**This rehearsal does not make real payouts possible or ready.** No
payment processor (Stripe, PayPal, bank, crypto, or otherwise) is
integrated anywhere in this codebase. `simulate:payouts` and this
rehearsal's payout section are simulations only — they classify a
synthetic developer's earnings into a status (payable/pending/held/
manual_review) but never move money, because there is no code path that
could. Do not report this rehearsal passing as evidence that real
developer payouts can be sent.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real advertiser/developer account data to this
document.**
