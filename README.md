# PromptProfit

**Developer wait-state monetization — one text line, zero data leakage.**

PromptProfit shows a single sponsored text advertisement in the VS Code status bar while developers wait for AI coding assistant responses. Developers earn a revenue share. Advertisers get text-only impressions with no behavioral data attached.

---

## Privacy-First Positioning

PromptProfit is built on a single inviolable constraint: **the extension never transmits source code, file names, prompts, AI responses, or any project-structure information to any server.**

All telemetry schemas are closed Zod types validated at build time. A forbidden-field test suite (`TELEMETRY_FORBIDDEN_FIELDS`) enforces this constraint at the package level. The API rejects any event that carries fields outside the closed schema. There are no open `metadata`, `extra`, or `payload` escape hatches anywhere in the data pipeline.

See [`docs/04-privacy-and-telemetry.md`](docs/04-privacy-and-telemetry.md) and [`SECURITY.md`](SECURITY.md) for the full security and privacy model.

---

## Architecture Overview

```
Ad-Alt/                          ← pnpm monorepo root (Turborepo)
├── apps/
│   ├── api/                     ← Hono v4 HTTP API (Node, ESM)
│   ├── extension/               ← VS Code extension (TypeScript, esbuild)
│   └── web/                     ← Next.js 14 advertiser/developer dashboard
├── packages/
│   ├── database/                ← @ad-alt/database  — Drizzle ORM schema + migrations
│   ├── shared/                  ← @ad-alt/shared    — Zod schemas, types, constants
│   ├── fraud/                   ← @ad-alt/fraud     — Impression fraud scoring
│   ├── ledger/                  ← @ad-alt/ledger    — Integer microcent accounting
│   └── telemetry/               ← @ad-alt/telemetry — Closed event schemas + validator
├── docs/                        ← Architecture, PRD, threat model, roadmap
├── docker-compose.yml           ← Local PostgreSQL 16, Redis 7, Maildev
└── turbo.json                   ← Turborepo pipeline
```

### Key Technology Choices

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| API | Hono v4, Node.js 20, ESM |
| Extension | TypeScript, esbuild, VS Code API |
| Web | Next.js 14 (App Router) |
| Database | PostgreSQL 16 + Drizzle ORM |
| Cache / rate-limit | Redis 7 (ioredis) |
| Money math | Integer microcents (bigint-safe) |
| Validation | Zod (strict, no passthrough) |
| Tests | Vitest |

---

## Quick Start (Local Development)

### Prerequisites

- **Node.js** 20 or later
- **pnpm** 9 or later (`npm install -g pnpm@9`)
- **Docker + Docker Compose** (for PostgreSQL, Redis, Maildev)
- **VS Code** (to run the extension in development)

### Setup

```bash
# 1. Clone
git clone https://github.com/XXBlackMartinXX/Ad-Alt.git
cd Ad-Alt

# 2. Install all dependencies
pnpm install

# 3. Start local infrastructure
docker compose up -d

# 4. Configure environment variables
cp .env.example .env
# Edit .env — fill in DATABASE_URL, REDIS_URL, JWT_SECRET, etc.

# 5. Run database migrations
pnpm db:migrate

# 6. Seed development data (optional)
pnpm db:seed

# 7. Build all packages
pnpm -r build
```

See [`docs/SETUP.md`](docs/SETUP.md) for the full development setup guide including VS Code extension loading and mock wait-state triggering.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values. The table below summarises the key variables — see `.env.example` for the complete list with descriptions.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `API_SECRET_KEY` | Yes | HMAC secret for API token verification |
| `EVENT_SIGNING_SECRET` | Yes | Secret for signing telemetry event envelopes |
| `NODE_ENV` | Yes | `development` / `test` / `production` |

---

## Running Each Component

### API (Hono)

```bash
cd apps/api
pnpm dev          # development server with watch
pnpm build        # production build → dist/
pnpm start        # run production build
```

### Web Dashboard (Next.js 14)

```bash
cd apps/web
pnpm dev          # Next.js dev server on http://localhost:3000
pnpm build        # production build
pnpm start        # run production build
```

### VS Code Extension

Open the monorepo root in VS Code, then press **F5** to launch an Extension Development Host with the extension loaded. Alternatively:

```bash
cd apps/extension
pnpm build        # esbuild production bundle → dist/
pnpm dev          # esbuild watch mode
```

---

## Running Tests

```bash
# Typecheck all packages
pnpm -r typecheck

# Run all unit tests
pnpm -r test:unit

# Build all packages
pnpm -r build

# Or run everything via Turborepo from root
pnpm typecheck
pnpm test:unit
pnpm build
```

Tests use **Vitest** and are located in `__tests__/` directories within each package and app.

---

## Security and Privacy Guarantees

1. **No code or prompt data ever leaves the developer's machine.** The extension only sends closed telemetry events (impression seen, wait-state started/ended, click) with no free-text fields.
2. **Telemetry schemas are closed Zod types.** Adding an open field requires a deliberate schema change that is blocked by the `TELEMETRY_FORBIDDEN_FIELDS` test suite.
3. **All money is integer microcents.** No floating-point arithmetic is used anywhere in the ledger or billing paths.
4. **Budget enforcement is atomic.** Campaign spend checks and ledger writes run inside a single database transaction with `FOR UPDATE` locking.
5. **Fraud scoring runs server-side** before any ledger credit, using signal-based heuristics (timing, device-id velocity, impression rate).
6. **Rate limiting** is applied at the API layer using Redis token buckets.

See [`docs/03-threat-model.md`](docs/03-threat-model.md) and [`SECURITY.md`](SECURITY.md) for detail.

---

## MVP Status and Known Limitations

PromptProfit is an **MVP in active development**. It is **not yet production-deployed**.

**What is implemented:**

- VS Code extension with status bar rendering, wait-state detection, and mock adapter for local testing
- Hono API with impression, event, and developer endpoints
- Drizzle ORM schema and migrations for campaigns, impressions, ledger, and developer accounts
- `@ad-alt/ledger` integer-microcent accounting package with balance verification
- `@ad-alt/fraud` impression fraud scoring
- `@ad-alt/telemetry` closed event schema with forbidden-field validator
- Redis-based deduplication and rate limiting
- Unit test coverage across packages

**What is not yet implemented:**

- OAuth / SSO login (API key auth only in MVP)
- Stripe payout integration
- VS Code Marketplace publication
- Full advertiser self-serve portal
- GDPR data-export endpoint
- Production infrastructure and deployment pipeline
- Reconciliation / settlement job
- Monitoring and alerting

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the planned post-MVP work.

---

## Roadmap

| Phase | Highlights |
|---|---|
| **MVP (current)** | Extension, API, ledger, fraud, telemetry — local dev complete |
| **V1** | OAuth, Stripe payouts, bigint mode, GDPR export, Marketplace publish |
| **Future** | Multi-AI-provider adapters, RTB auction, advertiser analytics, multi-currency |

Full detail in [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Clean-Room Note

This project was designed from a clean-room specification. All architecture decisions, data models, and implementation are original. No proprietary third-party code was incorporated. See [`docs/00-reference-analysis-and-clean-room-spec.md`](docs/00-reference-analysis-and-clean-room-spec.md) for the specification that guided the design.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributing guide including branch naming, commit format, privacy rules, and ledger arithmetic requirements.

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), informed by the [Contributor Covenant](https://www.contributor-covenant.org/).

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). **Do not open a public issue for security reports.**

## License

**License selection is pending.** No `LICENSE` file has been added to this repository yet, and no license terms should be assumed. The project owner has not yet finalized the licensing model. Until a `LICENSE` file is added, all rights are reserved by default and the code should not be treated as open source.
