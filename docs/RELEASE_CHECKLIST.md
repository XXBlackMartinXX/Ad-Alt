# Release Checklist

This is the checklist to run before tagging a release or deploying to a new environment. PromptProfit is MVP-stage and not yet production-deployed (see README "MVP Status and Known Limitations") — until a production deployment pipeline exists, treat this as the bar for "ready to deploy to a real environment," not as evidence such a deployment has happened.

## Code correctness

- [ ] `pnpm install --frozen-lockfile` succeeds (lockfile matches `package.json` across the workspace)
- [ ] `pnpm -r typecheck` passes with zero errors
- [ ] `pnpm -r lint` passes with zero errors
- [ ] `pnpm -r test:unit` passes with zero failures
- [ ] `pnpm -r build` succeeds for every package and app
- [ ] `pnpm --filter promptprofit package` (or the extension's package script) produces a `.vsix` with no unexpected files (check via `unzip -l`) and no missing-field warnings other than known-pending ones (e.g. license)

## Security

- [ ] `gitleaks detect --source . --redact --config .gitleaks.toml` reports no findings in git history
- [ ] `gitleaks detect --source . --redact --config .gitleaks.toml --no-git` reports no findings in the working tree (review any findings in gitignored build output individually — they are not committed, but confirm before assuming they're benign)
- [ ] `.env` is not tracked in git (`git ls-files | grep -E '(^|/)\.env$'` returns nothing)
- [ ] `.env.example` contains only placeholder values, no real secrets
- [ ] No new unauthenticated endpoint was added without an explicit, reviewed reason
- [ ] No existing authentication, authorization, or rate-limiting check was weakened

## Privacy

- [ ] No new field was added to any telemetry event, API request/response, or log that could carry source code, file paths, file names, prompts, AI responses, terminal output, or other workspace content
- [ ] If the telemetry schema (`packages/shared/src/schemas/events.ts`) or validator (`packages/telemetry/src/validator.ts`) changed, the telemetry-privacy test suite (`packages/shared/src/__tests__/telemetry-privacy.test.ts`) passes

## Ledger / financial correctness

- [ ] All money values introduced or touched are integer microcents — no floats or `numeric` columns
- [ ] `verifyBalance()` is invoked before any new ledger-write code path
- [ ] Any new budget/balance check and its corresponding ledger write happen inside the same database transaction with row locking (`FOR UPDATE`) — no time-of-check-to-time-of-use gap

## Database

- [ ] `packages/database/migrations/` contains a real, committed `.sql` file for every schema change (verify with `ls packages/database/migrations/*.sql` — an empty or missing directory means migrations were never generated/committed, which silently breaks `pnpm db:migrate` on a fresh clone)
- [ ] `pnpm db:migrate` runs cleanly against a fresh, empty database
- [ ] `pnpm db:seed` runs cleanly after migration

## Documentation

- [ ] `README.md` reflects current setup steps and MVP status
- [ ] Any new environment variable is documented in `.env.example` with a comment and, if required, added to `apps/api/src/env.ts`'s `requireEnv` checks
- [ ] `docs/DECISIONS.md` has a new entry for any architecture-level decision made during this release cycle

## Manual verification (cannot be fully automated in this repo's current CI)

- [ ] `docker compose up -d` brings up Postgres, Redis, and Maildev as `healthy`
- [ ] The full local flow in [`LOCAL_TESTING.md`](./LOCAL_TESTING.md) (decision → impression lifecycle → ledger credit) has been run manually against a live local stack since the last release
