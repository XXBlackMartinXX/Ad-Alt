# Implementation Plan

> **Historical naming note:** Authored under the original working name **"Ad-Alt,"** since rebranded **PromptProfit**. Read "ad-alt"/"Ad-Alt" below as "PromptProfit." Retained verbatim for historical record; the GitHub repository name `Ad-Alt` and the npm workspace scope `@ad-alt/*` are unrelated/unchanged — see [`DECISIONS.md`](./DECISIONS.md#adr-016-product-rebrand--ad-alt--promptprofit).

## Phase Overview

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Repo bootstrap & branch setup | ✅ Done |
| 1 | Documentation suite | ✅ Done |
| 2 | Shared packages (schemas, fraud, ledger, telemetry) | ✅ Done |
| 3 | Database schema & migrations | ✅ Done |
| 4 | Backend API (Hono) | ✅ Done |
| 5 | VS Code extension | ✅ Done |
| 6 | Web dashboard | ✅ Done |
| 7 | Verification (typecheck, lint, tests, build) | ✅ Done |

---

## Phase 0 — Repo Bootstrap

- Initialize pnpm workspace monorepo (`pnpm-workspace.yaml`)
- Configure Turborepo (`turbo.json`) with `build`, `dev`, `test`, `typecheck` pipelines
- Create root `tsconfig.base.json` with strict mode: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `NodeNext` module resolution
- Create `docker-compose.yml` for local Postgres 16, Redis 7, MailDev
- Create `.env.example` documenting all required environment variables
- Create dev branch `claude/ecstatic-maxwell-h0d8d8`

---

## Phase 1 — Documentation

All docs live in `docs/` and are written before any code:

- `00-reference-analysis-and-clean-room-spec.md` — Clean-room principles; what is and isn't in scope
- `01-prd.md` — Product requirements: personas, user stories, success metrics, non-goals
- `02-architecture.md` — System diagram, component responsibilities, API contract
- `03-threat-model.md` — STRIDE analysis, trust boundaries, mitigations
- `04-privacy-and-telemetry.md` — Privacy model, forbidden fields, telemetry policy
- `05-data-model.md` — Full schema documentation, money arithmetic rules
- `06-implementation-plan.md` — This document
- `DECISIONS.md` — Architecture Decision Records (ADRs)

---

## Phase 2 — Shared Packages

### `packages/shared`
- Zod event schemas (discriminated union of 4 event types)
- `TELEMETRY_FORBIDDEN_FIELDS` constant — no forbidden fields appear in any schema
- Campaign/creative/review Zod schemas used by API validators
- Privacy test asserting all forbidden field names are absent from all schemas

### `packages/fraud`
- `FraudScoringContext` / `FraudScoringResult` / `FraudSignal` types
- `FraudScorer` with `scoreViewability()` and `scoreClick()` methods
- Score signals: impossible_duration, excessive_impression_rate, click_without_impression, rapid_click, device_blocked, invalid_sequence, etc.
- Score is 0–100; decision thresholds: REVIEW_THRESHOLD=60, BLOCK_THRESHOLD=85
- 31 unit tests covering signal combinations, score clamping, decision boundaries

### `packages/ledger`
- `LedgerCalculator` with `calculateImpressionEntries()` and `calculateClickEntries()`
- All arithmetic in bigint microcents (no floats)
- `verifyBalance()` asserts `developer + platform === total` before every write
- Click bonus = 10× impression value
- 32 unit tests covering math correctness and balance invariant

### `packages/telemetry`
- `EventValidator` wrapping the shared Zod schemas
- Validates event shape and rejects any payload containing forbidden field names
- 49 unit tests covering all event types, forbidden fields, edge cases

---

## Phase 3 — Database Schema

Located in `packages/database/src/schema/`:

- `users.ts` — users, api_keys, devices, developer_profiles
- `campaigns.ts` — campaigns, creatives, creative_reviews, ad_delivery_decisions
- `events.ts` — impression_events, click_events, event_deduplication_keys
- `ledger.ts` — ledger_entries (double-entry, immutable)
- `admin.ts` — admin_audit_logs, feature_flags

**Key constraints**:
- All tables use Drizzle v0.32 object syntax for the third `pgTable` argument
- `drizzle-orm` helpers (`eq`, `and`, `desc`, etc.) are re-exported from `packages/database/src/index.ts` so application code never imports `drizzle-orm` directly
- All monetary columns use `bigint`

---

## Phase 4 — Backend API

Hono v4 application in `apps/api/`:

### Middleware
- `request-id.ts` — attaches UUID request ID to every request and response header
- `logging.ts` — structured pino JSON logging with request/response fields
- `error-handler.ts` — catches HTTPException and unknown errors, returns JSON
- `auth.ts` — `requireApiKey`, `requireAdmin`, `optionalApiKey` using `createMiddleware<AppEnv>()`
- `rate-limit.ts` — Redis sliding window rate limiting with `X-RateLimit-*` headers

### Routes
- `GET /health` — DB + Redis health check
- `GET /v1/flags` — Feature flags for kill switch and adapter disabling
- `POST /v1/auth/exchange` — Exchange device ID + user ID for API key
- `DELETE /v1/auth/keys/:keyId` — Revoke API key
- `GET /v1/ads/decision` — Select and return an ad for the extension (optional auth)
- `POST /v1/events` — Ingest telemetry events (impression/click lifecycle)
- `GET /v1/campaigns`, `POST /v1/campaigns`, `GET /v1/campaigns/:id`, `PATCH /v1/campaigns/:id`
- `GET /v1/creatives`, `POST /v1/creatives`, `GET /v1/creatives/:id`, `DELETE /v1/creatives/:id`
- `GET /v1/ledger/me` — Developer earnings and entry history
- `GET /v1/admin/creatives/pending`, `POST /v1/admin/creatives/:id/review`
- `GET /v1/admin/fraud/pending`, `GET /v1/admin/campaigns/pending`, `POST /v1/admin/campaigns/:id/review`

### Services
- `AdDecisionService` — Selects highest-bid active campaign with approved creative
- `EventProcessor` — Routes events through dedup → fraud scoring → ledger recording
- `FraudService` — Assembles `FraudScoringContext` from Redis counters + DB device record
- `LedgerService` — Records impression/click ledger entries and updates running totals

### Event deduplication
1. Fast path: Redis `SET NX EX 86400` on `dedup:{eventId}` (returns immediately)
2. Durability: insert into `event_deduplication_keys` with `onConflictDoNothing`

---

## Phase 5 — VS Code Extension

Located in `apps/extension/`:

### Adapter abstraction
`IWaitStateAdapter` interface decouples detection logic from the extension host:
```ts
interface IWaitStateAdapter {
  readonly adapterName: string;
  onWaitStateStart: Event<void>;
  onWaitStateEnd: Event<void>;
  dispose(): void;
}
```

### Adapters
- `AiStatusBarAdapter` — idle detection via VS Code stable APIs only (`onDidChangeTextDocument`, `onDidChangeTextEditorSelection`, `onDidChangeActiveTerminal`). Fires after 3000ms idle, caps at 60s.
- `MockAdapter` — deterministic test adapter; fires start/end on demand

### Privacy enforcement
- Extension NEVER reads: file content, file names, project paths, prompt text, AI responses, chat history, terminal content, project structure, git remotes
- `deviceId` is generated as `dev_${sha256(randomBytes(16)).slice(0,32)}` — not a hardware fingerprint
- `EventQueue` validates events against `TELEMETRY_FORBIDDEN_FIELDS` before queuing

### Extension lifecycle
1. On `activate()`: create adapter, start background queue flusher
2. On wait-state start: request ad decision from API
3. Display ad in status bar (headline + display URL) with `$(link-external)` icon
4. On wait-state end or 60s cap: clear status bar, send impression lifecycle events
5. On click: send click event, open click URL via `vscode.env.openExternal`
6. On `deactivate()`: flush queue, dispose adapters

---

## Phase 6 — Web Dashboard

Located in `apps/web/` (Next.js 14 App Router):

- `/` — Marketing landing page (pitch, how it works, privacy summary)
- `/privacy` — Full privacy policy
- `/dashboard` — Developer dashboard (live stats, recent earnings)
- `/earnings` — Earnings history, payout request UI
- `/campaigns` — Advertiser campaign management
- `/admin` — Admin review queue (creatives and campaigns pending review)

All pages use Tailwind CSS with a neutral colour palette. No proprietary branding.

---

## Phase 7 — Verification

### TypeScript
- All packages pass `tsc --noEmit` with strict mode
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` enforced
- No `any` escapes in business logic (only in test mocks)

### Tests
| Package | Test count | Coverage |
|---------|-----------|----------|
| `@ad-alt/shared` | 20 | Privacy invariants, schema validation |
| `@ad-alt/fraud` | 31 | All signal combinations, decision thresholds |
| `@ad-alt/ledger` | 32 | Math correctness, balance invariant |
| `@ad-alt/telemetry` | 49 | All event types, forbidden fields |
| `ad-alt` (extension) | 34 | Privacy guards, event queue, adapters |
| `@ad-alt/api` | 20 | HTTP contract, auth gates, validation |
| **Total** | **186** | |

### Build
- Extension bundles to `dist/extension.js` (~21kb) via esbuild
- All packages build clean via Turborepo `build` task

---

## Architectural Decisions (summary)

See `docs/DECISIONS.md` for the full 15 ADRs. Key decisions:

1. **Hono** over Express/Fastify: TypeScript-native, edge-compatible, typed context
2. **Drizzle ORM** over Prisma: no code generation, raw SQL power, bigint support
3. **Microcents** (bigint): eliminates floating-point rounding in financial calculations
4. **Double-entry ledger**: `developer + platform = total` invariant prevents silent money creation
5. **Score-based fraud** (0–100): more nuanced than binary block; supports human review queue
6. **Redis dedup + DB durability**: Redis for latency, Postgres for correctness after restart
7. **Stable VS Code API only**: no monkey-patching, survives VS Code updates
8. **Privacy-by-construction**: forbidden fields defined in shared package; tests assert they never appear

---

## Local Development

```bash
# Prerequisites: Docker, Node 20+, pnpm 9+
docker-compose up -d          # Start Postgres, Redis, MailDev
cp .env.example .env          # Fill in secrets
pnpm install
pnpm --filter @ad-alt/database build   # Build DB package first
pnpm --filter @ad-alt/shared build
pnpm dev                       # Start all apps via Turborepo
```

### Database migrations
```bash
cd packages/database
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### Running tests
```bash
pnpm test:unit    # All unit tests via Turborepo
```

### Building the extension
```bash
pnpm --filter ad-alt compile  # esbuild → dist/extension.js
pnpm --filter ad-alt package  # vsce → ad-alt-0.1.0.vsix
```
