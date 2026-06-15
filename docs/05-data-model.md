# Data Model

## Overview

All money is stored as **bigint microcents** (1/1,000,000 USD). Floats are never used for financial values. The ledger uses double-entry bookkeeping; every billable event produces exactly three balanced entries.

---

## Tables

### `users`
Core identity record created on first OAuth sign-in.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `email` | text | Unique, indexed |
| `role` | text | `developer` \| `advertiser` \| `admin` |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

### `api_keys`
Hashed API keys issued to users. Raw key is returned once on creation and never stored.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `userId` | UUID FK → users | |
| `keyHash` | text | SHA-256 of raw key, unique, indexed |
| `name` | text | Human label |
| `lastUsedAt` | timestamptz | Updated on each authenticated request |
| `expiresAt` | timestamptz | Null = no expiry |
| `revokedAt` | timestamptz | Null = active |
| `createdAt` | timestamptz | |

### `devices`
Privacy-safe device registry. `deviceId` is a client-generated random opaque token — never derived from hardware IDs, hostnames, or usernames.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `deviceId` | text | Client-generated, unique, indexed |
| `userId` | UUID FK → users | Nullable (anonymous device) |
| `fraudScore` | integer | 0–100, updated by fraud service |
| `isBlocked` | boolean | Hard block from serving |
| `firstSeenAt` | timestamptz | |
| `lastSeenAt` | timestamptz | |
| `createdAt` | timestamptz | |

### `developer_profiles`
Accumulated earnings for each developer. Updated atomically using SQL arithmetic to prevent race conditions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `userId` | UUID FK → users | Unique (one profile per user) |
| `totalEarnedMicrocents` | bigint | Running total, never decremented |
| `totalPaidOutMicrocents` | bigint | Running total of payouts |
| `updatedAt` | timestamptz | |

### `campaigns`
Advertiser campaigns. Budget enforcement uses `spentMicrocents` compared to `budgetMicrocents`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `advertiserId` | UUID FK → users | |
| `name` | text | |
| `status` | text | `draft` \| `pending_review` \| `active` \| `paused` \| `archived` |
| `budgetMicrocents` | bigint | Total campaign budget |
| `dailyBudgetMicrocents` | bigint | Nullable daily cap |
| `cpmBidMicrocents` | bigint | Cost per 1000 impressions |
| `spentMicrocents` | bigint | Running spend, updated atomically |
| `startAt` / `endAt` | timestamptz | Flight dates, nullable |
| `targetAdapterNames` | text[] | Null = all adapters |
| `createdAt` / `updatedAt` | timestamptz | |

### `creatives`
Ad copy attached to campaigns. Must pass human review before serving.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `campaignId` | UUID FK → campaigns | |
| `advertiserId` | UUID FK → users | Denormalized for quick ACL checks |
| `status` | text | `pending_review` \| `approved` \| `rejected` \| `archived` |
| `headline` | text | Max 80 chars (validated at API layer) |
| `body` | text | Nullable, max 200 chars |
| `displayUrl` | text | Shown to user |
| `clickUrl` | text | Destination URL |
| `createdAt` / `updatedAt` | timestamptz | |

### `creative_reviews`
Audit trail of each manual review decision.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `creativeId` | UUID FK → creatives | |
| `reviewerId` | UUID FK → users | Admin who reviewed |
| `decision` | text | `approved` \| `rejected` |
| `reviewNote` | text | Nullable internal note |
| `reviewedAt` | timestamptz | |

### `ad_delivery_decisions`
Short-lived record created when the server selects an ad. Extension uses `id` as `adDecisionId` in subsequent events. Expires after 30 seconds.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Returned to extension as `adDecisionId` |
| `campaignId` / `creativeId` | UUID FK | |
| `deviceId` | text | Indexed |
| `userId` | UUID | Nullable (anonymous) |
| `adapterName` | text | Which adapter triggered the decision |
| `cpmBidMicrocents` | bigint | Locked-in bid at decision time |
| `decidedAt` | timestamptz | |
| `expiresAt` | timestamptz | 30 seconds after `decidedAt` |
| `wasServed` | boolean | Flipped when `impression_requested` received |

### `impression_events`
Lifecycle record for each ad impression: `requested → rendered → viewable → billable → reconciled`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `idempotencyKey` | text | `eventId` from extension, unique |
| `adDecisionId` | UUID FK → ad_delivery_decisions | |
| `campaignId` / `creativeId` | UUID FK | Denormalized for reporting |
| `deviceId` | text | |
| `userId` | UUID FK → users | |
| `adapterName` | text | |
| `status` | text | See lifecycle above |
| `requestedAt` | timestamptz | |
| `renderedAt` | timestamptz | Nullable |
| `viewableAt` | timestamptz | Nullable |
| `billableAt` | timestamptz | Nullable |
| `displayedDurationMs` | integer | Nullable, set on viewability event |
| `fraudScore` | integer | 0–100, 0 if not fraud-scored |
| `fraudSignals` | jsonb | Array of signal objects |
| `createdAt` / `updatedAt` | timestamptz | |

### `click_events`
Click tracking. FK to `impression_events` enforces that a click cannot exist without a prior impression.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `idempotencyKey` | text | Unique per click event |
| `impressionEventId` | UUID FK → impression_events | |
| `adDecisionId` | UUID FK | |
| `campaignId` / `creativeId` | UUID FK | |
| `deviceId` | text | |
| `userId` | UUID FK → users | |
| `status` | text | `pending` \| `billable` \| `fraud_blocked` |
| `clickedAt` | timestamptz | |
| `fraudScore` | integer | |
| `fraudSignals` | jsonb | |
| `createdAt` | timestamptz | |

### `ledger_entries`
Double-entry ledger. Each billable impression creates three entries (advertiser charge, developer credit, platform fee) that sum to zero across accounts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `entryType` | text | `advertiser_charge` \| `developer_credit` \| `platform_fee` |
| `referenceType` | text | `impression` \| `click` \| `payout` |
| `referenceId` | text | ID of the source event |
| `accountId` | text | User ID or `platform` |
| `accountType` | text | `advertiser` \| `developer` \| `platform` |
| `amountMicrocents` | bigint | Signed: negative = debit |
| `balanceAfterMicrocents` | bigint | Running balance snapshot |
| `description` | text | Human-readable memo |
| `createdAt` | timestamptz | Immutable once written |

**Balance invariant**: for any billable event, `advertiser_charge + developer_credit + platform_fee = 0` must hold. Verified in `LedgerCalculator.verifyBalance()` before every write.

### `event_deduplication_keys`
DB-side dedup store. Redis provides the fast path (24h TTL); this table provides durability across Redis restarts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `key` | text | `eventId` from extension, unique |
| `eventType` | text | |
| `processedAt` | timestamptz | |
| `expiresAt` | timestamptz | 24h after `processedAt` |

### `admin_audit_logs`
Immutable audit trail for all admin actions. IPs are stored as SHA-256 hashes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `actorId` | UUID FK → users | |
| `actorEmail` | text | Denormalized snapshot |
| `action` | text | e.g. `creative.approved` |
| `targetType` | text | e.g. `creative` |
| `targetId` | text | |
| `details` | jsonb | Action-specific metadata |
| `ipAddressHash` | text | SHA-256 of request IP |
| `createdAt` | timestamptz | |

### `feature_flags`
Runtime kill switches and feature gates.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | text | Unique slug, e.g. `kill_switch_all_ads` |
| `isEnabled` | boolean | |
| `description` | text | |
| `updatedBy` | UUID FK → users | Nullable |
| `updatedAt` / `createdAt` | timestamptz | |

---

## Money Arithmetic Rules

1. All monetary values are stored as `bigint` (PostgreSQL `bigint`) in microcents.
2. `1 USD = 1,000,000 microcents`.
3. Division uses integer (bigint) division — never floating point.
4. Per-impression value: `cpmBidMicrocents / 1000` (bigint division).
5. Developer share: `(totalMicrocents * developerSharePercent) / 100`.
6. Platform fee: `totalMicrocents - developerAmountMicrocents` (no rounding error).
7. Click bonus: `impressionValue * 10n` (10× CPM impression value).
8. Ledger balance check: `developerAmount + platformAmount === totalAmount` — must be exact.

---

## Privacy Constraints

The following fields are structurally absent from every table (enforced by schema review and tests in `packages/shared`):

- `sourceCode`, `fileContent`, `filePath`, `fileName`, `projectPath`
- `promptText`, `aiResponse`, `chatHistory`, `terminalContent`
- `projectStructure`, `workspacePath`, `gitRemote`
- `envVariables`, `apiKey`, `secret`, `password`, `token`

The `deviceId` field is a client-generated random token (not a hardware fingerprint). IP addresses in audit logs are SHA-256 hashed before storage.
