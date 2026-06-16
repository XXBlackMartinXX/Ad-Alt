# Contributing to PromptProfit

Thank you for your interest in contributing. This document covers everything you need to get a development environment running, submit quality changes, and avoid the most common pitfalls around privacy, financial logic, and telemetry schema integrity.

---

## Prerequisites

| Tool | Minimum Version | Notes |
|---|---|---|
| Node.js | 20.x | LTS recommended |
| pnpm | 9.x | `npm install -g pnpm@9` |
| Docker + Docker Compose | Any recent version | Required for local PostgreSQL and Redis |
| VS Code | Any recent version | Required to test extension changes |
| Git | Any recent version | |

---

## Local Setup

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/Ad-Alt.git
cd Ad-Alt

# 2. Install all workspace dependencies
pnpm install

# 3. Start local infrastructure (PostgreSQL 16, Redis 7, Maildev)
docker compose up -d

# 4. Configure environment
cp .env.example .env
# Open .env and fill in required values (see .env.example for descriptions)

# 5. Build all packages (required before running individual apps)
pnpm -r build

# 6. Run database migrations
pnpm db:migrate

# 7. (Optional) Seed development data
pnpm db:seed
```

See [`docs/SETUP.md`](docs/SETUP.md) for a detailed walkthrough including how to load the extension in the VS Code Extension Development Host and trigger a mock wait-state.

---

## Branch Naming

| Prefix | Use for |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `chore/` | Dependency bumps, config, tooling |
| `docs/` | Documentation only |
| `test/` | Test additions or fixes with no logic change |
| `refactor/` | Code restructuring with no behavior change |

Examples: `feat/stripe-payout`, `fix/ledger-race-condition`, `docs/setup-guide`

---

## Commit Format

Use **Conventional Commits**:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`

**Scope** (optional): the package or app affected, e.g. `ledger`, `extension`, `api`, `telemetry`

Examples:
```
feat(ledger): add verifyBalance guard to all credit writes
fix(extension): handle undefined AI provider state on activation
chore(deps): bump drizzle-orm to 0.31.0
docs(setup): add troubleshooting section for Apple Silicon Docker
test(fraud): add velocity signal edge-case coverage
```

Commits that mix unrelated changes will be asked to split.

---

## Pull Request Process

1. **Open a draft PR early** if you want feedback on the approach before the implementation is complete.
2. **Fill in the PR template** completely — incomplete checklists will be returned for revision.
3. **All required checks must pass** before review:
   - `pnpm -r typecheck` — no type errors
   - `pnpm -r test:unit` — all unit tests green
   - `pnpm -r build` — clean build for all packages
4. **Self-review your diff** against the PR checklist before requesting a review. Reviewers should not be catching basic issues that a self-review would catch.
5. **One logical change per PR.** If you find an unrelated issue while working, open a separate PR or issue.
6. PRs that touch auth, fraud scoring, or ledger logic require sign-off from a maintainer with security/financial review experience before merge.

---

## Testing Expectations

- **Unit tests are required for all new business logic.** This includes ledger operations, fraud scoring changes, telemetry schema changes, and API route handlers.
- Tests live in `__tests__/` directories co-located with the source they test.
- Use **Vitest** for all tests. Do not add other test runners.
- Test filenames follow `*.test.ts` convention.
- Aim for tests that document behavior, not implementation. Test the contract, not the internals.
- Mocking strategy: mock at the boundary (database calls, Redis, external HTTP). Do not mock internal package logic.
- Do not commit tests that `expect(true).toBe(true)` or otherwise pass trivially.

---

## Privacy Rules for Contributions

These rules are non-negotiable. A PR that violates them will not be merged regardless of other quality.

### What you must never add

1. **Fields that could carry source code** — no `content`, `code`, `snippet`, `buffer`, `text` fields in any telemetry event or API request body sent from the extension.
2. **File path fields** — no `filePath`, `fileName`, `projectRoot`, `workspace`, or similar fields in telemetry.
3. **Prompt or AI response fields** — no `prompt`, `completion`, `response`, `message`, `input`, `output` fields in telemetry.
4. **Open metadata escapes** — no `metadata: Record<string, unknown>`, `extra`, `payload`, `context`, or `data` fields in Zod schemas. Every field must be explicitly typed.

### How the enforcement works

The `@ad-alt/telemetry` package contains a `TELEMETRY_FORBIDDEN_FIELDS` constant and a corresponding test suite. Adding a forbidden field name to any schema — even buried in a nested object — will cause the tests to fail. The CI job blocks merge on a failing test suite.

If you believe a new field is genuinely required and safe, open an issue first with a privacy justification before writing any code.

---

## Ledger and Financial Rules

The ledger is the most operationally critical component. Errors here have real financial consequences. Follow these rules precisely:

1. **Integer arithmetic only.** All money values are stored and computed as integer microcents (`number` with no decimal operations, or `bigint`). Never use `parseFloat`, `toFixed`, or any floating-point operation on money values.
2. **Call `verifyBalance()` before every ledger write.** Do not assume a balance is sufficient based on an earlier read. The verify-then-write must happen in the same database transaction.
3. **Budget enforcement is atomic.** Campaign balance checks and ledger debit writes must occur inside a single transaction with `FOR UPDATE` row locking. Do not split these into separate queries.
4. **Ledger entries are immutable.** Never add an `UPDATE` or `DELETE` path for ledger rows. Corrections are made with reversing entries.
5. **Use the `@ad-alt/ledger` package for all credit/debit operations.** Do not write raw SQL ledger mutations outside this package.
6. **Document the arithmetic.** For any new financial calculation, add a comment explaining the unit (microcents), the formula, and any rounding behavior.

---

## Telemetry Schema Rules

1. **All event schemas are defined in `@ad-alt/telemetry` using strict Zod objects.** Do not define event schemas inline in the extension or API.
2. **Use `.strict()` or avoid `.passthrough()` on all Zod objects.** Unknown fields must be rejected, not silently stripped or forwarded.
3. **No open union members.** If an event has a `type` discriminant, all valid values must be enumerated.
4. **Schema changes require a version bump** in the event schema and a corresponding migration in the API's event handler.
5. **Run the forbidden-field tests** (`pnpm -r test:unit` in the telemetry package) after any schema change.

---

## Security Review Requirements

The following types of changes require explicit security review from a maintainer before merge. State this in your PR description.

- **Authentication or authorization changes** — any change to JWT validation, API key logic, session handling, or route protection
- **Fraud scoring changes** — changes to signal weights, thresholds, or the scoring algorithm
- **Ledger or billing changes** — any change to credit, debit, balance check, or budget enforcement logic
- **New public API endpoints** — any route accessible without authentication
- **Telemetry schema additions** — adding new fields or event types

---

## Code Style

- **TypeScript strict mode** is enabled for all packages. `tsconfig.base.json` sets `"strict": true`.
- **No `any`.** If you find yourself writing `as any` or `: any`, find the correct type instead. Use `unknown` and narrow it.
- **No floating-point money math.** See Ledger Rules above.
- **No `console.log` in production code.** Use the `pino` logger instance exported from the relevant package.
- **Explicit return types** on all exported functions.
- **Zod for all external input validation** — API request bodies, extension configuration, environment variables.
- Run `pnpm format` before committing to apply Prettier formatting.

---

## License

**License selection is pending.** This repository does not yet have a `LICENSE` file, and no license terms should be assumed. Until the project owner finalizes and publishes a license, contributions are accepted on the understanding that licensing terms will be determined by the project owner before any public release.
