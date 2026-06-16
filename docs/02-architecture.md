# Ad-Alt: Technical Architecture

> **Historical naming note:** Authored under the original working name **"Ad-Alt,"** since rebranded **PromptProfit**. Read "Ad-Alt" below as "PromptProfit" wherever it names the product/brand (URLs like `ad-alt.com` are illustrative placeholders, not real or current). Retained verbatim for historical record; the GitHub repository name `Ad-Alt` is unrelated and unchanged.

**Document version:** 1.0  
**Date:** 2026-06-15  
**Status:** Approved for engineering use  
**Author:** Ad-Alt Inc. — Engineering

---

## 1. Monorepo Structure

Ad-Alt is organized as a pnpm workspace managed with Turborepo. All packages share TypeScript strict mode and a common ESLint/Prettier configuration.

```
ad-alt/
├── apps/
│   ├── web/                        # Next.js 14 (App Router) — developer + advertiser dashboard
│   │   ├── app/
│   │   │   ├── (auth)/             # NextAuth sign-in, sign-up, OAuth callback routes
│   │   │   ├── (developer)/        # Developer dashboard: ledger, settings, export
│   │   │   ├── (advertiser)/       # Advertiser dashboard: campaigns, creatives, spend
│   │   │   └── api/                # Next.js API routes (auth only — core API lives in apps/api)
│   │   ├── components/             # Shared React components (shadcn/ui based)
│   │   ├── lib/                    # Auth config (NextAuth), API client, session helpers
│   │   └── next.config.ts
│   │
│   ├── admin/                      # Next.js 14 — internal admin panel (creative review, fraud tools)
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── review/             # Creative review queue
│   │   │   ├── fraud/              # Fraud investigation by account or event cluster
│   │   │   ├── ledger/             # Ledger inspection and reconciliation tools
│   │   │   └── accounts/           # Developer and advertiser account management
│   │   └── middleware.ts           # IP allowlist + 2FA enforcement
│   │
│   └── api/                        # Hono — core backend API
│       ├── src/
│       │   ├── index.ts            # App entry point, middleware composition
│       │   ├── routes/
│       │   │   ├── creative.ts     # GET /v1/creative (ad serving)
│       │   │   ├── events.ts       # POST /v1/events/impression, /v1/events/click
│       │   │   ├── developer.ts    # GET/PATCH /v1/developer/me, /v1/developer/ledger
│       │   │   ├── advertiser.ts   # CRUD /v1/advertiser/campaigns, /v1/advertiser/creatives
│       │   │   ├── admin.ts        # Admin-only routes (review decisions, fraud holds)
│       │   │   └── internal.ts     # Internal service-to-service routes (payout batch, config push)
│       │   ├── middleware/
│       │   │   ├── auth.ts         # JWT verification, role extraction
│       │   │   ├── rate-limit.ts   # Redis sliding window rate limiter
│       │   │   ├── logger.ts       # Structured logging (pino)
│       │   │   └── validate.ts     # Zod request validation wrapper
│       │   ├── services/
│       │   │   ├── serving-engine/ # Creative selection and auction logic
│       │   │   ├── fraud/          # Fraud scoring pipeline
│       │   │   ├── ledger/         # Double-entry ledger operations
│       │   │   ├── payout/         # Stripe payout batch processor
│       │   │   └── remote-config/  # Config payload builder and cache
│       │   ├── db/
│       │   │   ├── schema.ts       # Drizzle ORM schema definitions
│       │   │   ├── migrations/     # Drizzle migration files
│       │   │   └── client.ts       # PostgreSQL connection pool
│       │   ├── queue/
│       │   │   ├── producers.ts    # BullMQ job producers
│       │   │   └── workers/        # BullMQ workers (event processor, payout, fraud)
│       │   └── lib/
│       │       ├── redis.ts        # Shared Redis client
│       │       ├── stripe.ts       # Stripe SDK wrapper
│       │       └── tokens.ts       # Impression token signing/verification (Ed25519)
│       └── Dockerfile
│
├── packages/
│   ├── extension/                  # VS Code extension (TypeScript, VS Code Extension API)
│   │   ├── src/
│   │   │   ├── extension.ts        # Extension entry: activate/deactivate
│   │   │   ├── coordinator.ts      # Orchestrates adapters, config, serving, rendering
│   │   │   ├── adapters/
│   │   │   │   ├── adapter.interface.ts    # AIAdapter interface
│   │   │   │   ├── claude-code.adapter.ts  # Claude Code state detection
│   │   │   │   ├── copilot.adapter.ts      # GitHub Copilot state detection (V1)
│   │   │   │   └── cursor.adapter.ts       # Cursor state detection (V2)
│   │   │   ├── api-client.ts       # Typed HTTP client for ad-alt API
│   │   │   ├── auth.ts             # OAuth flow, SecretStorage token management
│   │   │   ├── consent.ts          # Consent webview panel
│   │   │   ├── renderer.ts         # StatusBarItem management
│   │   │   ├── remote-config.ts    # Config polling, kill-switch enforcement
│   │   │   ├── telemetry.ts        # Event builder, schema validator, sender
│   │   │   └── idempotency.ts      # Idempotency key generation and local store
│   │   ├── schemas/
│   │   │   └── telemetry-v1.schema.json    # Published telemetry schema (PRIV-05)
│   │   ├── test/
│   │   │   ├── unit/
│   │   │   └── integration/
│   │   └── package.json            # "publisher": "ad-alt-inc", "engines": {"vscode": "^1.85.0"}
│   │
│   ├── db/                         # Shared Drizzle schema + migration runner
│   │   ├── schema/
│   │   │   ├── accounts.ts
│   │   │   ├── campaigns.ts
│   │   │   ├── creatives.ts
│   │   │   ├── events.ts
│   │   │   ├── ledger.ts
│   │   │   └── fraud.ts
│   │   └── index.ts
│   │
│   ├── schemas/                    # Zod schemas shared between API and web
│   │   ├── creative.ts
│   │   ├── events.ts
│   │   ├── campaign.ts
│   │   └── ledger.ts
│   │
│   └── tsconfig/                   # Shared TypeScript configs
│       ├── base.json
│       ├── nextjs.json
│       └── hono.json
│
├── infra/
│   ├── docker-compose.yml          # Local development stack
│   ├── docker-compose.test.yml     # Integration test stack (ephemeral DBs)
│   └── postgres/
│       └── init.sql                # Local DB setup (extensions, roles)
│
├── turbo.json                      # Turborepo pipeline config
├── pnpm-workspace.yaml
└── package.json
```

---

## 2. IDE Extension Architecture

### 2.1 Design Principles

- **Stable APIs only.** The extension uses only the public VS Code Extension API (`vscode` module). No DOM manipulation, no `eval()`, no monkey-patching of VS Code internals, no private namespaces. This makes the extension forward-compatible with VS Code updates.
- **Adapter pattern.** Each AI tool has an isolated adapter implementing a common interface. The coordinator does not contain any AI-tool-specific logic.
- **Silent degradation.** All AI state detection is wrapped in try/catch. Any detection failure silently produces a no-op (no ad shown, no editor error, no notification).
- **Privacy boundary at the network layer.** `telemetry.ts` validates every outgoing event against the published JSON Schema before sending. A validation failure drops the event (not sent, logged locally in debug channel).

### 2.2 AI Adapter Interface

```typescript
// packages/extension/src/adapters/adapter.interface.ts

export interface AIAdapter {
  readonly id: string;           // e.g., "claude-code", "copilot", "cursor"
  readonly displayName: string;

  /**
   * Called once by the coordinator to set up any VS Code API subscriptions.
   * Must use only stable VS Code Extension APIs.
   * Must not throw; wrap all VS Code API calls in try/catch.
   */
  activate(context: vscode.ExtensionContext): void;

  /**
   * Called by the coordinator to cleanly remove subscriptions.
   */
  deactivate(): void;

  /**
   * Emits 'pause_started' and 'pause_ended' events via the returned EventEmitter.
   * The coordinator listens to these events to drive serving decisions.
   */
  readonly events: AdapterEventEmitter;
}

export type AdapterEvent =
  | { type: 'pause_started'; estimatedDurationMs?: number }
  | { type: 'pause_ended' };
```

### 2.3 Claude Code Adapter

The Claude Code adapter detects AI wait states using VS Code's stable `StatusBarItem` observation and extension host message events. Specific implementation:

- Subscribes to `vscode.window.onDidChangeActiveTextEditor` and `vscode.window.onDidChangeWindowState`.
- Uses `vscode.extensions.getExtension('anthropics.claude-code')` to check if Claude Code is installed.
- Monitors the Claude Code extension's exported API (if available) for a `onThinkingStateChange` event. If not available, falls back to observing the status bar area text via `vscode.window.setStatusBarMessage` overrides (stable API).
- Minimum pause threshold (default: 3000ms) is enforced in the coordinator, not the adapter, to keep adapters stateless.

### 2.4 Coordinator Flow

```
activate()
  │
  ├── Load auth token from SecretStorage
  ├── If no token → show consent panel → OAuth flow
  ├── Load remote config (polling interval: 60s)
  ├── Register activated adapters
  └── Subscribe to adapter events
        │
        ┌─ pause_started
        │     ├── Check: opt-in? kill-switch off? rate limit OK? min duration met?
        │     ├── If all pass: call api-client.fetchCreative()
        │     ├── If creative returned: call renderer.show(creative)
        │     │                        schedule impression report (1s delay)
        │     └── If any check fails or API error: no-op
        │
        └─ pause_ended
              └── renderer.clear()
                  record cool-down start time
```

### 2.5 Auth and SecretStorage

```typescript
// packages/extension/src/auth.ts

const TOKEN_KEY = 'ad-alt.developer-token';

export async function getToken(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(TOKEN_KEY);
}

export async function storeToken(context: vscode.ExtensionContext, token: string): Promise<void> {
  await context.secrets.store(TOKEN_KEY, token);
}

export async function clearToken(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(TOKEN_KEY);
}

export async function startOAuthFlow(context: vscode.ExtensionContext): Promise<void> {
  // Use vscode.authentication.getSession for providers that support it.
  // For Ad-Alt's custom OAuth, open a browser tab with a PKCE flow.
  // The redirect URI is a vscode:// URI handled by the extension.
  const pkce = generatePKCE();
  const authUrl = buildAuthUrl(pkce.challenge);
  await vscode.env.openExternal(vscode.Uri.parse(authUrl));
  // The extension registers a URI handler to receive the code and exchange it.
}
```

### 2.6 Telemetry Schema Enforcement

Every event object built by `telemetry.ts` is validated against `schemas/telemetry-v1.schema.json` using `ajv` before being sent. The schema is bundled with the extension and is identical to the publicly published schema at `https://ad-alt.com/telemetry-schema/v1.json`.

```typescript
// telemetry.ts (simplified)
import Ajv from 'ajv';
import schema from '../schemas/telemetry-v1.schema.json';

const ajv = new Ajv({ allErrors: true, additionalProperties: false });
const validate = ajv.compile(schema);

export function sendEvent(event: TelemetryEvent): void {
  if (!validate(event)) {
    // Log to extension output channel (debug); do NOT send
    outputChannel.appendLine(`[Ad-Alt] Telemetry validation failed: ${JSON.stringify(validate.errors)}`);
    return;
  }
  apiClient.postEvent(event); // fire-and-forget, errors are silent
}
```

---

## 3. Backend API Architecture

### 3.1 Framework: Hono

The API is built with [Hono](https://hono.dev/) — a lightweight, TypeScript-native, edge-compatible framework. It runs as a Node.js process in production (not edge, due to PostgreSQL and Redis dependency), but is designed to be runtime-portable.

### 3.2 Middleware Stack

Middleware is applied in the following order for all routes:

```typescript
// apps/api/src/index.ts

const app = new Hono();

app.use('*', requestId());           // X-Request-ID header
app.use('*', logger());              // Structured pino logging (request/response)
app.use('*', cors({ origin: [...] }));
app.use('*', secureHeaders());       // HSTS, X-Frame-Options, X-Content-Type-Options
app.use('/v1/*', rateLimiter());     // Redis sliding window (per IP at this layer)
app.use('/v1/*', authenticate());    // JWT verification; sets c.var.actor
app.use('/v1/*', authorize());       // Role check per route group
app.use('/v1/*', validate());        // Zod validation (per-route schema)

app.route('/v1/creative', creativeRoutes);
app.route('/v1/events', eventRoutes);
app.route('/v1/developer', developerRoutes);
app.route('/v1/advertiser', advertiserRoutes);
app.route('/v1/admin', adminRoutes);
app.route('/v1/internal', internalRoutes);

app.onError(errorHandler);           // Structured error response + logging
```

### 3.3 Route Groups

**Creative Routes (`/v1/creative`)**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/creative` | Developer JWT | Return a PauseMoment for display. Runs serving engine. |
| GET | `/v1/creative/config` | Developer JWT | Return remote config payload (kill-switch, thresholds). |

**Event Routes (`/v1/events`)**

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/events/impression` | Developer JWT | Record impression. Idempotent on `impression_token`. |
| POST | `/v1/events/click` | Developer JWT | Record click. Requires valid `impression_token`. |

**Developer Routes (`/v1/developer`)**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/developer/me` | Developer JWT | Return account profile and opt-in status. |
| PATCH | `/v1/developer/me` | Developer JWT | Update opt-in status, payout method. |
| GET | `/v1/developer/ledger` | Developer JWT | Return paginated ledger entries. |
| GET | `/v1/developer/export` | Developer JWT | Trigger data export job; return job ID. |
| DELETE | `/v1/developer/me` | Developer JWT | Initiate account deletion. |

**Advertiser Routes (`/v1/advertiser`)**

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/advertiser/campaigns` | Advertiser JWT | Create campaign. Charges Stripe. |
| GET | `/v1/advertiser/campaigns` | Advertiser JWT | List campaigns with stats. |
| GET | `/v1/advertiser/campaigns/:id` | Advertiser JWT | Campaign detail and spend report. |
| POST | `/v1/advertiser/campaigns/:id/creatives` | Advertiser JWT | Submit creative for review. |
| GET | `/v1/advertiser/campaigns/:id/creatives` | Advertiser JWT | List creatives with review status. |

**Admin Routes (`/v1/admin`)** — requires `role: admin` + 2FA-verified session

| Method | Path | Description |
|---|---|---|
| GET | `/v1/admin/review/queue` | Pending creative submissions. |
| POST | `/v1/admin/review/:creativeId/approve` | Approve creative. |
| POST | `/v1/admin/review/:creativeId/reject` | Reject with reason. |
| GET | `/v1/admin/fraud/:developerId` | Fraud score breakdown for a developer. |
| POST | `/v1/admin/fraud/:developerId/hold` | Apply payout hold. |
| POST | `/v1/admin/fraud/:developerId/clear` | Clear payout hold. |
| GET | `/v1/admin/ledger/reconciliation` | Run reconciliation for a date range. |

### 3.4 Error Response Format

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many impression events. Retry after 60 seconds.",
    "requestId": "01HX...",
    "retryAfter": 60
  }
}
```

---

## 4. Database Schema Overview

Database: PostgreSQL 16. ORM: Drizzle ORM. All timestamps are `TIMESTAMPTZ`. All monetary values are `BIGINT` (microcents). UUIDs used as primary keys.

### Entity Relationships

```
accounts
  ├── id (PK)
  ├── email (unique)
  ├── role: 'developer' | 'advertiser' | 'admin'
  ├── opt_in: boolean (developer only)
  ├── device_id_hash: text (developer only, non-PII)
  ├── fraud_hold: boolean
  ├── stripe_customer_id
  └── created_at, updated_at

campaigns
  ├── id (PK)
  ├── advertiser_id → accounts.id
  ├── status: 'pending_review' | 'active' | 'paused' | 'exhausted' | 'ended' | 'banned'
  ├── budget_microcents: BIGINT
  ├── spent_microcents: BIGINT
  ├── remaining_microcents: BIGINT  (computed, materialized)
  ├── max_cpm_bid_microcents: BIGINT
  ├── clearing_price_microcents: BIGINT  (set at auction resolution)
  ├── start_at, end_at
  └── stripe_payment_intent_id

creatives
  ├── id (PK)
  ├── campaign_id → campaigns.id
  ├── copy_text: varchar(120)
  ├── display_url: varchar(60)
  ├── destination_url: text
  ├── status: 'pending_review' | 'approved' | 'rejected' | 'revision_requested'
  ├── review_decision_at
  ├── reviewer_id → accounts.id
  ├── rejection_reason: text
  └── approved_at

events
  ├── id (PK)
  ├── type: 'impression' | 'click'
  ├── developer_id → accounts.id
  ├── creative_id → creatives.id
  ├── campaign_id → campaigns.id
  ├── impression_token_jti: text (unique — idempotency key)
  ├── device_id_hash: text
  ├── adapter_type: text
  ├── extension_version: text
  ├── fraud_score: integer (0–100, higher = more suspicious)
  ├── fraud_components: JSONB
  ├── status: 'pending' | 'confirmed' | 'fraud_reversed'
  ├── occurred_at
  └── processed_at

ledger_entries
  ├── id (PK)
  ├── type: 'impression_charge' | 'click_charge' | 'developer_credit' | 'platform_fee'
         | 'fraud_reversal_debit' | 'fraud_reversal_credit' | 'payout_debit' | 'payout_credit'
  ├── account_id → accounts.id
  ├── event_id → events.id (nullable for payouts)
  ├── campaign_id → campaigns.id (nullable for payouts)
  ├── amount_microcents: BIGINT  (positive = credit, negative = debit)
  ├── description: text
  ├── reference_id: text  (Stripe transfer ID, payout batch ID, etc.)
  └── created_at  (append-only; no UPDATE or DELETE)

fraud_signals
  ├── id (PK)
  ├── developer_id → accounts.id
  ├── signal_type: text
  ├── score_delta: integer
  ├── metadata: JSONB
  └── recorded_at

payout_batches
  ├── id (PK)
  ├── initiated_by → accounts.id (admin)
  ├── period_start, period_end
  ├── status: 'pending' | 'processing' | 'completed' | 'failed'
  ├── total_amount_microcents: BIGINT
  └── created_at, completed_at

payout_items
  ├── id (PK)
  ├── batch_id → payout_batches.id
  ├── developer_id → accounts.id
  ├── amount_microcents: BIGINT
  ├── stripe_transfer_id: text
  ├── status: 'pending' | 'succeeded' | 'failed'
  └── ledger_entry_ids: UUID[]  (references confirmed ledger entries)
```

### Database Constraints and Rules

- `ledger_entries` has a database trigger rejecting UPDATE and DELETE operations (`raise exception`).
- `events.impression_token_jti` has a unique index — duplicate submission fails at the database level, never at application logic.
- `campaigns.remaining_microcents` is updated inside a serializable transaction each time an impression token is issued.
- All foreign keys have `ON DELETE RESTRICT` — account deletion is handled by the application layer (anonymization), not cascade.

---

## 5. Event Ingestion Pipeline

```
Extension
  │
  │  POST /v1/events/impression
  │  { impression_token: "eyJ...", adapter_type: "claude-code", ... }
  │
  ▼
Hono Route Handler
  ├── Auth middleware: verify developer JWT
  ├── Validate: Zod schema check
  ├── Verify impression_token JWT signature (Ed25519)
  │   └── If invalid → 401
  ├── Extract JTI from token
  ├── Redis SET NX "seen:jti:<jti>" EX 300 → idempotency check
  │   └── If already set → 200 OK (no duplicate processing)
  ├── Insert event row (status: 'pending') in PostgreSQL
  │   └── Unique index on impression_token_jti prevents race-condition duplicates
  ├── Enqueue "process_event" job to BullMQ (Redis)
  │   └── payload: { event_id: "...", event_type: "impression" }
  └── Return 200 OK to extension immediately

BullMQ Worker: process_event
  ├── Fetch event from DB
  ├── Run fraud scoring pipeline (see Section 7)
  │   └── fraud_score, fraud_components written back to event row
  ├── If fraud_score > FRAUD_BLOCK_THRESHOLD (default: 75):
  │   ├── Update event.status = 'fraud_reversed'
  │   └── No ledger entries created
  ├── If fraud_score <= threshold:
  │   ├── Open PostgreSQL transaction (SERIALIZABLE)
  │   │   ├── Create ledger entry: advertiser debit (impression cost in microcents)
  │   │   ├── Create ledger entry: developer credit (50% of impression cost)
  │   │   ├── Create ledger entry: platform fee credit (50% of impression cost)
  │   │   ├── Decrement campaign.remaining_microcents
  │   │   ├── Update event.status = 'confirmed'
  │   │   └── Commit
  │   └── If campaign.remaining_microcents <= 0:
  │       └── Update campaign.status = 'exhausted' (separate job)
  └── Ack job (success or dead-letter on error after 3 retries)
```

Click events follow the same pipeline with the following differences:
- Requires the `impression_token_jti` of the originating impression to exist in DB as `confirmed`.
- Fraud scoring includes a click velocity check against the developer's recent click events.
- Ledger entries use the click rate (CPM × click_premium_multiplier, default: 50×).

---

## 6. Ad-Serving Decision Engine

The serving engine is invoked by `GET /v1/creative`. It must return a creative within 500ms (p99) or return 204.

### 6.1 Eligibility Pre-Filters

Before auction, the engine applies hard filters to eliminate ineligible campaigns:

1. `campaign.status = 'active'`
2. `creative.status = 'approved'` (at least one per campaign)
3. `campaign.remaining_microcents >= clearing_price_microcents` (budget check)
4. `campaign.start_at <= NOW() <= campaign.end_at` (schedule check, if set)
5. Developer's device has not exceeded the per-device daily impression cap (Redis counter).
6. Developer account is not on fraud hold.

### 6.2 Priority Scoring

Each eligible campaign is assigned a priority score used for weighted random selection:

```
priority_score = clearing_price_microcents × quality_score × recency_boost

Where:
  quality_score    = campaign's historical CTR ratio (0.5–2.0, initialized at 1.0 for new campaigns)
  recency_boost    = 1.0 + (0.1 × min(days_since_last_impression, 3))
                   (rewards campaigns that haven't served recently, up to +30%)
```

In MVP (before full auction data exists), `clearing_price_microcents` is the advertiser's stated CPM bid and `quality_score` defaults to 1.0.

In V1 (second-price auction), `clearing_price_microcents` is the resolved Vickrey price from campaign creation.

### 6.3 Weighted Selection

From the eligible, scored set:

```typescript
function weightedSelect(campaigns: ScoredCampaign[]): ScoredCampaign {
  const totalWeight = campaigns.reduce((sum, c) => sum + c.priorityScore, 0);
  let random = Math.random() * totalWeight;
  for (const campaign of campaigns) {
    random -= campaign.priorityScore;
    if (random <= 0) return campaign;
  }
  return campaigns[campaigns.length - 1];
}
```

This gives higher-bidding, better-performing campaigns proportionally higher selection probability while still allowing smaller campaigns to serve.

### 6.4 Impression Token Issuance

Once a creative is selected:

1. Verify `campaign.remaining_microcents >= clearing_price_microcents` inside a `SELECT FOR UPDATE` transaction (prevents over-serving).
2. Decrement `campaign.remaining_microcents` by `clearing_price_microcents` (reserved; confirmed on impression event).
3. Generate `impression_token`: Ed25519-signed JWT with `{ creative_id, campaign_id, developer_id, jti: uuidv4(), exp: now+300s }`.
4. Store JTI in Redis: `SET "issued:jti:<jti>" "1" EX 360` (slightly longer than JWT exp).
5. Return creative payload.

If any step fails (budget exhausted between check and reserve), return 204.

---

## 7. Auction and Priority Algorithm

### 7.1 Vickrey Second-Price Auction (V1)

The Ad-Alt auction resolves at campaign creation time (reserved inventory model). This means advertisers are not competing in real-time per impression; instead, the auction determines which campaigns have priority for a fixed impression volume.

**Auction rules:**

1. All active campaigns with overlapping schedules and target audience are entered into a continuous auction.
2. Campaigns are ranked by `max_cpm_bid_microcents` descending.
3. The top-ranked campaign wins priority slot 1. Its `clearing_price_microcents` = (second-highest bid + 1 microcent). It pays the second-price, not its max bid.
4. The second-ranked campaign wins priority slot 2. Its clearing price = (third-highest bid + 1 microcent).
5. And so on.
6. New campaign submissions trigger a re-sort of the priority queue. Existing `clearing_price_microcents` values are updated in a transaction.
7. The serving engine's priority score uses `clearing_price_microcents` (not max bid), which means advertisers cannot game the system by overbidding — they pay the market-clearing rate.

**Example:**

| Advertiser | Max CPM Bid | Clearing Price |
|---|---|---|
| A (highest) | $12.00 | $8.01 (second bid + $0.01) |
| B | $8.00 | $5.01 |
| C | $5.00 | $3.01 |
| D | $3.00 | $3.00 (floor price) |

Floor price: $1.00 CPM (configurable). Campaigns below floor are not eligible.

### 7.2 Budget Reservation

When an impression token is issued, the clearing price for that impression is reserved (decremented from `remaining_microcents`). If the impression event is never received (developer closed VS Code, network failure), the reservation is released after the token's TTL (5 minutes) via a scheduled cleanup job.

---

## 8. Fraud Detection Pipeline

The fraud pipeline runs asynchronously in the BullMQ worker after an event is ingested. It scores each event from 0 (clean) to 100 (definitely fraud). Scores > 75 result in event reversal and no ledger entry. Scores 50–75 result in a payout hold for manual review.

### 8.1 Scoring Signals

| Signal | Score Delta | Description |
|---|---|---|
| `click_velocity` | 0–40 | Clicks per hour from this developer vs. population mean. +10 per SD above mean. |
| `impression_rate` | 0–20 | Impressions per hour vs. population mean. |
| `account_age` | −10 to 0 | Account > 30 days: −10 (reduces suspicion). |
| `device_share` | 0–30 | Multiple accounts on same device hash: +10 per additional account. |
| `click_impression_ratio` | 0–20 | Click/impression ratio > 5%: suspicious. > 20%: +20. |
| `token_reuse_attempt` | +50 | Attempted replay of an already-used impression token. |
| `headless_env` | +40 | No display environment detected (CI/bot signal). |
| `known_vpn_datacenter` | +15 | IP hash matches known datacenter or VPN prefix. |
| `new_account_spike` | +20 | Account < 7 days old with > 100 impressions in first hour. |

All signals and their deltas are stored in the `fraud_signals` table for every scored event. The admin UI shows a breakdown by signal name.

### 8.2 Fraud Pipeline Flow

```
event ingested
  │
  ├── fetch recent events for developer (last 1 hour)
  ├── fetch device impression count (Redis counter)
  ├── fetch click/impression ratio (last 24 hours)
  ├── check IP hash against known datacenter prefix set (Redis set)
  ├── compute individual signal scores
  ├── sum all signal scores → total_fraud_score
  ├── write fraud_signals rows for each non-zero signal
  ├── update event.fraud_score, event.fraud_components
  │
  ├── score > 75 → mark event 'fraud_reversed', skip ledger
  ├── score 50–75 → mark event 'confirmed', create ledger entry, set developer fraud_hold = true
  └── score < 50 → mark event 'confirmed', create ledger entry, no hold
```

### 8.3 Manual Review

Admin UI shows: developer ID, total fraud score, signal breakdown, recent event history, account age. Admin can:
- **Clear hold:** Remove `fraud_hold`, emit a `fraud_cleared` audit log entry.
- **Reverse all pending events:** Mark all unprocessed events as `fraud_reversed`, create corresponding reversal ledger entries.
- **Ban account:** Set `account.status = 'banned'`, terminate all active developer sessions (revoke all JWTs via a blocklist in Redis).

Every admin action is an immutable audit log entry. Admin identity is recorded. Reason is required for ban actions.

---

## 9. Ledger and Payout Accounting

### 9.1 Double-Entry Accounting Model

Every financial event produces at least two ledger entries with opposite signs that sum to zero. This ensures the ledger is always in balance and every cent is accounted for.

**Impression event (example: $8.00 CPM, one impression = $0.008 = 8,000 microcents):**

| Entry type | Account | Amount (microcents) |
|---|---|---|
| `impression_charge` | Advertiser campaign | −8,000 |
| `developer_credit` | Developer | +4,000 |
| `platform_fee` | Ad-Alt platform | +4,000 |

Sum: 0. Every impression produces exactly 3 ledger entries.

**Click event (example: $8.00 CPM × 50× click multiplier = $400 CPM = $0.40 per click = 400,000 microcents):**

| Entry type | Account | Amount (microcents) |
|---|---|---|
| `click_charge` | Advertiser campaign | −400,000 |
| `developer_credit` | Developer | +200,000 |
| `platform_fee` | Ad-Alt platform | +200,000 |

**Fraud reversal (reversing confirmed impression):**

| Entry type | Account | Amount (microcents) |
|---|---|---|
| `fraud_reversal_credit` | Advertiser campaign | +8,000 |
| `fraud_reversal_debit` | Developer | −4,000 |
| `fraud_reversal_debit` | Ad-Alt platform | −4,000 |

**Payout (developer earns $5.00 = 5,000,000 microcents, paid out):**

| Entry type | Account | Amount (microcents) |
|---|---|---|
| `payout_debit` | Developer | −5,000,000 |
| `payout_credit` | Payout liability | +5,000,000 |

The payout liability account is zeroed when Stripe confirms the transfer.

### 9.2 Reconciliation Query

```sql
-- Period reconciliation (proves zero-balance for a date range)
SELECT
  SUM(CASE WHEN type IN ('impression_charge', 'click_charge') THEN amount_microcents ELSE 0 END)
    AS total_advertiser_charges,
  SUM(CASE WHEN type IN ('developer_credit') THEN amount_microcents ELSE 0 END)
    AS total_developer_credits,
  SUM(CASE WHEN type IN ('platform_fee') THEN amount_microcents ELSE 0 END)
    AS total_platform_fees,
  SUM(CASE WHEN type IN ('fraud_reversal_credit', 'fraud_reversal_debit') THEN amount_microcents ELSE 0 END)
    AS total_fraud_adjustments,
  SUM(amount_microcents) AS net_balance  -- Must be 0
FROM ledger_entries
WHERE created_at BETWEEN :period_start AND :period_end;
```

`net_balance` must always equal 0. Any non-zero value triggers an automated PagerDuty alert.

### 9.3 Payout Batch Process

```typescript
// Pseudocode for payout batch
async function runPayoutBatch(batchId: string, periodStart: Date, periodEnd: Date) {
  const eligibleDevelopers = await db.query(`
    SELECT developer_id, SUM(amount_microcents) AS earned
    FROM ledger_entries
    WHERE type = 'developer_credit'
      AND created_at BETWEEN $1 AND $2
      AND developer_id NOT IN (
        SELECT developer_id FROM ledger_entries WHERE type = 'payout_debit'
          AND created_at BETWEEN $1 AND $2
      )
    GROUP BY developer_id
    HAVING SUM(amount_microcents) >= 10_000_000  -- $10 minimum
  `, [periodStart, periodEnd]);

  for (const { developer_id, earned } of eligibleDevelopers) {
    const amountCents = Math.floor(earned / 1_000); // microcents → cents
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: developer.stripeConnectAccountId,
    });
    await createPayoutLedgerEntries(developer_id, earned, transfer.id);
  }
}
```

---

## 10. Admin and Moderation System

### 10.1 Access Control

The admin panel (`admin.ad-alt.com`) is separated from the developer/advertiser dashboard at the application and network level:

- Separate Next.js app with its own deployment.
- IP allowlisting enforced in nginx/middleware (Ad-Alt office IPs + VPN egress IP).
- NextAuth session for admin accounts requires TOTP 2FA enrollment.
- Admin sessions expire after 8 hours of inactivity.
- All admin actions are sent to the API with an `X-Admin-Session` header that is validated server-side (not just checked in the admin app).

### 10.2 Creative Review Queue

The review queue fetches all creatives with `status = 'pending_review'`, ordered by `submitted_at ASC`. Each queue item shows:

- Advertiser display name and account age
- Campaign name and budget
- Ad copy in full (not truncated)
- Destination URL with a link preview (fetched server-side; URL is not shown as a hyperlink in the review UI to prevent accidental navigation to potentially unsafe destinations)
- Previous campaigns by the same advertiser and their review outcomes

Review decision options:
1. **Approve** — creative transitions to `approved`, campaign can serve.
2. **Request Revision** — creative transitions to `revision_requested`. Required: reason selected from policy checklist + optional free text. Advertiser notified by email.
3. **Reject (Permanent Ban)** — creative transitions to `rejected`, advertiser account flagged `banned: true`, all active campaigns terminated, Stripe refund of unspent budget queued.

### 10.3 Fraud Investigation UI

The fraud UI at `/admin/fraud/:developerId` shows:

- Current fraud score (0–100 meter)
- Signal breakdown table (signal name, score delta, last triggered at)
- Recent 100 events with fraud_components JSONB expanded
- Account timeline (created, first impression, first click, first hold)
- Current payout hold status and reason

Action buttons: Hold Payout, Clear Hold, Reverse All Pending, Ban Account. All actions require a typed confirmation reason.

---

## 11. Security Model

### 11.1 Authentication

**Developer/Advertiser:** NextAuth sessions (server-side JWT stored in HttpOnly cookie). GitHub and Google OAuth providers. Email/password with bcrypt (cost factor 12). Session token rotated on every request.

**Admin:** NextAuth with additional TOTP 2FA. Admin tokens are short-lived (8h) and include a `role: admin` claim verified on every API request. Admin tokens are stored in a Redis blocklist on logout for immediate invalidation.

**Extension:** Developer OAuth token stored in VS Code `SecretStorage` (OS keychain on macOS/Windows, libsecret on Linux). API calls use a derived short-lived JWT (exchanged for the stored token on each VS Code session start). The JWT includes `exp`, `iat`, `sub` (developer_id), `role: developer`, `device_id_hash`.

### 11.2 Authorization

```typescript
// Role-based middleware
const roleGuard = (requiredRole: 'developer' | 'advertiser' | 'admin') =>
  createMiddleware(async (c, next) => {
    const actor = c.var.actor; // Set by auth middleware
    if (!actor || actor.role !== requiredRole) {
      return c.json({ error: { code: 'FORBIDDEN' } }, 403);
    }
    await next();
  });

// Route: only developers can fetch creative
app.get('/v1/creative', roleGuard('developer'), servingEngine.handler);
```

Advertisers cannot access developer ledger entries. Developers cannot access advertiser campaign data. Admins can access all resources through the dedicated `/v1/admin` route group (separate from `/v1/developer` and `/v1/advertiser`).

### 11.3 Rate Limiting

Redis sliding window counters, keyed by `developer_id` and `device_id_hash`:

| Endpoint | Limit | Window |
|---|---|---|
| `POST /v1/events/impression` | 10 requests | 60 seconds per developer |
| `POST /v1/events/click` | 5 requests | 60 seconds per developer |
| `GET /v1/creative` | 2 requests | 60 seconds per device |
| `POST /v1/advertiser/campaigns` | 5 requests | 3600 seconds per advertiser |
| All authenticated routes (global) | 1000 requests | 3600 seconds per account |

Rate limit responses return `429 Too Many Requests` with `Retry-After` header.

### 11.4 Impression Token Integrity

```typescript
// Ed25519 key pair (generated at deployment time, stored in secrets manager)
import { SignJWT, jwtVerify, generateKeyPair } from 'jose';

export async function issueImpressionToken(payload: ImpressionTokenPayload): Promise<string> {
  return new SignJWT({
    creative_id: payload.creativeId,
    campaign_id: payload.campaignId,
    developer_id: payload.developerId,
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(IMPRESSION_SIGNING_PRIVATE_KEY);
}

export async function verifyImpressionToken(token: string): Promise<ImpressionTokenPayload> {
  const { payload } = await jwtVerify(token, IMPRESSION_SIGNING_PUBLIC_KEY, {
    algorithms: ['EdDSA'],
  });
  return payload as ImpressionTokenPayload;
}
```

---

## 12. Observability

### 12.1 Structured Logging

All services use `pino` for structured JSON logging. Log fields are standardized across the monorepo:

```json
{
  "level": "info",
  "time": 1718438400000,
  "service": "api",
  "requestId": "01HX...",
  "method": "POST",
  "path": "/v1/events/impression",
  "statusCode": 200,
  "latencyMs": 45,
  "actorId": "dev_01HX...",
  "actorRole": "developer",
  "msg": "Impression event accepted"
}
```

Log levels:
- `error`: Unhandled exceptions, database connection failures, Stripe errors.
- `warn`: Rate limit hits, fraud holds applied, impression token validation failures.
- `info`: Successful request, event processed, creative served.
- `debug`: Fraud signal details, ledger entry creation (disabled in production by default).

### 12.2 OpenTelemetry

The API exports traces and metrics via OpenTelemetry SDK:

- **Traces:** Every request is traced end-to-end. Spans include: `http.server`, `db.query` (Drizzle ORM instrumented), `redis.command`, `bullmq.job.enqueue`, `stripe.api.call`.
- **Metrics:** `ad_alt_creatives_served_total` (counter), `ad_alt_events_ingested_total` (counter, labeled by type and fraud_disposition), `ad_alt_ledger_entries_total` (counter), `ad_alt_fraud_score_histogram` (histogram).
- **Exporters:** Traces → Jaeger (local) / Honeycomb (production). Metrics → Prometheus scrape endpoint `/metrics`.

### 12.3 Health Checks

`GET /healthz` (unauthenticated) checks:
- PostgreSQL: `SELECT 1` query completes in < 100ms.
- Redis: `PING` completes in < 50ms.
- BullMQ: No more than 1000 jobs in dead-letter queue.

Returns `200 OK` with JSON body `{ "status": "ok", "checks": { "postgres": "ok", "redis": "ok", "queue": "ok" } }` or `503 Service Unavailable` with failed check details.

### 12.4 Alerting

Critical alerts (PagerDuty):
- API error rate > 1% over 5 minutes.
- Ledger reconciliation balance != 0.
- BullMQ dead-letter queue > 100 jobs.
- Health check failing for > 2 minutes.

Warning alerts (Slack #ops):
- Fraud hold rate > 5% of events in last hour.
- Creative review queue > 10 items older than 3 hours.
- Stripe webhook delivery failures.

---

## 13. Deployment Topology

### 13.1 Local Development (Docker Compose)

```yaml
# infra/docker-compose.yml

version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ad_alt_dev
      POSTGRES_USER: ad_alt
      POSTGRES_PASSWORD: dev_password_not_secret
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  api:
    build:
      context: ../
      dockerfile: apps/api/Dockerfile
      target: development
    environment:
      DATABASE_URL: postgresql://ad_alt:dev_password_not_secret@postgres:5432/ad_alt_dev
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
      # Secrets loaded from .env.local (never committed)
    ports:
      - "3001:3001"
    volumes:
      - ../:/app
      - /app/node_modules
    depends_on:
      - postgres
      - redis
    command: pnpm --filter api dev

  web:
    build:
      context: ../
      dockerfile: apps/web/Dockerfile
      target: development
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXTAUTH_URL: http://localhost:3000
      NODE_ENV: development
    ports:
      - "3000:3000"
    volumes:
      - ../:/app
      - /app/node_modules
    command: pnpm --filter web dev

  admin:
    build:
      context: ../
      dockerfile: apps/admin/Dockerfile
      target: development
    ports:
      - "3002:3002"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXTAUTH_URL: http://localhost:3002
      NODE_ENV: development
    command: pnpm --filter admin dev

volumes:
  postgres_data:
  redis_data:
```

Local development setup:

```bash
cp .env.example .env.local  # Fill in Stripe test keys, GitHub OAuth app credentials
docker compose up -d postgres redis
pnpm install
pnpm db:migrate              # Runs Drizzle migrations
pnpm dev                     # Turborepo parallel dev (api, web, admin)
```

### 13.2 Production Topology

Production runs on a single cloud provider (AWS or Fly.io) with the following topology:

```
Internet
  │
  ▼
Load Balancer (TLS termination, HSTS)
  ├── app.ad-alt.com → Web (Next.js, containerized, 2+ replicas)
  ├── admin.ad-alt.com → Admin (Next.js, containerized, 1 replica, IP allowlisted)
  └── api.ad-alt.com → API (Hono, containerized, 3+ replicas)
                           │
                ┌──────────┼──────────┐
                ▼          ▼          ▼
          PostgreSQL     Redis     BullMQ Workers
          (RDS / Fly     (Upstash   (same API container,
           Postgres,      or         separate process
           1 primary +    Redis      via worker entrypoint)
           1 read         Cloud)
           replica)
```

Production environment variables are managed in Doppler (or equivalent secrets manager). No secrets in environment files or Docker images. Containers pull secrets at runtime via the Doppler CLI or SDK.

---

## 14. CI/CD Approach

### 14.1 Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml (simplified)

on:
  push:
    branches: [main, 'feature/**']
  pull_request:
    branches: [main]

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint typecheck

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo test:unit

  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: ad_alt_test
          POSTGRES_USER: ad_alt
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate:test
      - run: pnpm turbo test:integration

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm audit --audit-level=high
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  build:
    needs: [lint-typecheck, test-unit, test-integration, security]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm turbo build
      - name: Build Docker images
        run: docker compose -f infra/docker-compose.yml build

  deploy-staging:
    needs: [build]
    if: github.ref == 'refs/heads/main'
    # Deploy to staging environment
    # Run smoke tests against staging
    # Manual approval gate before production

  deploy-production:
    needs: [deploy-staging]
    environment: production  # GitHub environment with required reviewer approval
    # Deploy to production
    # Post-deploy health check
    # Notify #deploys Slack channel
```

### 14.2 Database Migrations in CI/CD

- Drizzle migrations run as a pre-deploy step before the new API version starts.
- Migrations are forward-only. Schema changes must be backward-compatible (no column renames in a single migration — add new column, dual-write, then drop old).
- Migration failures abort the deploy and alert on-call.

---

## 15. Testing Strategy

### 15.1 Unit Tests (Vitest)

Each service and utility has co-located unit tests. Coverage target: > 80% for business logic (ledger, fraud scoring, auction engine, token signing).

**Key unit test areas:**

- `ledger/` — verify debit/credit pairs always sum to zero; verify integer math; test fraud reversal entries.
- `serving-engine/` — verify eligibility filters; verify weighted selection distribution (statistical test); verify budget reservation transaction.
- `fraud/` — test each signal independently; test score thresholds; test signal combinations.
- `tokens.ts` — test JWT signing and verification; test JTI uniqueness; test expiry rejection.
- `telemetry.ts` (extension) — test that every emitted event passes the JSON Schema; test that schema violations are dropped (not sent); verify no work-product fields are present in any event fixture.

```typescript
// Example: ledger unit test
import { describe, it, expect } from 'vitest';
import { createImpressionEntries } from '../src/services/ledger/entries';

describe('createImpressionEntries', () => {
  it('produces three entries summing to zero', () => {
    const entries = createImpressionEntries({
      cpmMicrocents: 8_000_000n,  // $8.00 CPM
      advertiserId: 'adv_1',
      developerId: 'dev_1',
      eventId: 'evt_1',
      campaignId: 'camp_1',
    });

    expect(entries).toHaveLength(3);
    const sum = entries.reduce((acc, e) => acc + e.amountMicrocents, 0n);
    expect(sum).toBe(0n);

    const devCredit = entries.find(e => e.type === 'developer_credit');
    expect(devCredit?.amountMicrocents).toBe(4_000n); // 50% of per-impression cost
  });
});
```

### 15.2 Integration Tests

Integration tests run against a real PostgreSQL and Redis instance (provided by Docker Compose in CI). They test:

- Full event ingestion pipeline (HTTP → queue → worker → ledger).
- Idempotency: duplicate impression tokens do not produce duplicate ledger entries.
- Auction price resolution when a new campaign is added.
- Payout batch produces correct ledger entries and calls Stripe SDK (mocked in integration tests).
- Admin review decision transitions campaign status correctly.

### 15.3 Extension Tests

The extension uses the `@vscode/test-electron` runner for integration tests in a real VS Code instance:

- Consent flow renders and completes.
- OAuth token is stored and retrieved from `SecretStorage`.
- Kill-switch prevents creative serving when `serving_enabled: false`.
- Degraded mode: no crash when adapter throws.
- All telemetry event fixtures validate against the published schema.

### 15.4 End-to-End Tests (Playwright)

E2E tests cover the web dashboard and advertiser flow:

- Developer sign-up → OAuth → dashboard loads with empty ledger.
- Advertiser creates campaign → submits creative → sees `pending_review` status.
- Admin approves creative → campaign moves to `active`.
- Developer ledger updates within 30 seconds of a mocked impression event (via test API endpoint).

E2E tests run in CI on every merge to `main` against the staging environment.

### 15.5 Telemetry Schema Contract Test

A dedicated contract test verifies that the bundled extension schema and the publicly hosted schema are identical:

```typescript
// test/contract/telemetry-schema.test.ts
it('bundled schema matches published schema', async () => {
  const bundled = JSON.parse(fs.readFileSync('schemas/telemetry-v1.schema.json', 'utf8'));
  const published = await fetch('https://ad-alt.com/telemetry-schema/v1.json').then(r => r.json());
  expect(bundled).toEqual(published);
});
```

This test runs in CI after every schema change to prevent the bundled and published schemas from diverging.
