# Ad-Alt Privacy and Telemetry Specification

> **Historical naming note:** Authored under the original working name **"Ad-Alt,"** since rebranded **PromptProfit**. Read "Ad-Alt" below as "PromptProfit" (including the illustrative `AdAltEventEnvelope` type name). Retained verbatim for historical record; the GitHub repository name `Ad-Alt` is unrelated and unchanged.

**Version:** 1.0  
**Last Updated:** 2026-06-15  
**Classification:** Internal – Engineering + Legal  

---

## 1. Governing Principles

Ad-Alt is built on a **privacy-by-construction** model: the system is architected so that transmitting sensitive developer data is structurally impossible, not merely policy-prohibited. The VS Code extension enforces this by design — there is no code path through which source code, file names, prompt text, or AI responses can be included in any outbound payload.

The privacy model rests on five pillars:

1. **Minimal collection:** Only data required to operate the platform is collected. Data that would be nice-to-have but not operationally necessary is explicitly excluded.
2. **Local-first processing:** Wait-state detection, adapter logic, and event construction happen on-device. The server receives only the outcome of local computation.
3. **Pseudonymity:** Developer identities are decoupled from device identities. Neither is linked to any off-platform identifier without explicit developer action (e.g., payout KYC).
4. **Hard technical boundaries:** The extension's VS Code permission manifest does not declare permissions that would allow reading file content or workspace structure.
5. **Auditability:** Developers can inspect, export, and delete their data at any time.

---

## 2. Data Collected — Exhaustive List

The following is the complete list of data fields collected by Ad-Alt, across all surfaces.

### 2.1 Account Data (Web Registration)

| Field | Type | Purpose |
|---|---|---|
| `email` | string | Account identity, transactional email delivery |
| `email_verified` | boolean | Confirm working email before activation |
| `display_name` | string (optional) | Shown in developer dashboard |
| `account_type` | enum: `developer \| advertiser` | Determines platform routing |
| `created_at` | timestamptz | Account lifecycle tracking |
| `last_login_at` | timestamptz | Session security, inactivity detection |
| `auth_provider` | enum: `email \| github \| google` | OAuth flow routing |
| `auth_provider_subject` | string | OAuth subject ID (opaque to Ad-Alt) |

### 2.2 Developer Profile Data

| Field | Type | Purpose |
|---|---|---|
| `opted_in_at` | timestamptz | Records explicit opt-in timestamp (required before any content shown) |
| `opted_out_at` | timestamptz | Records opt-out timestamp |
| `payout_enabled` | boolean | Whether the developer has completed KYC for payouts |
| `tax_id` | string (encrypted) | Required for 1099 issuance above $600/year |
| `payout_method` | string (encrypted) | Stripe Connect account reference |
| `fraud_score` | integer 0–100 | Aggregate fraud signal score |
| `cohort_id` | string | Statistical cohort assignment (e.g., VS Code version bucket) |

### 2.3 Device Data

| Field | Type | Purpose |
|---|---|---|
| `device_id` | UUID | Pseudonymous per-device identifier |
| `device_fingerprint_hash` | string | HMAC-SHA256 of stable device attributes; used for device continuity |
| `vscode_version` | string | Adapter compatibility checking |
| `extension_version` | string | Version tracking for deprecation and migration |
| `os_platform` | enum: `win32 \| darwin \| linux` | Adapter variant selection |
| `registered_at` | timestamptz | Device lifecycle |
| `last_seen_at` | timestamptz | Device activity for fraud detection |
| `country_code` | string (2-letter ISO) | Inferred from IP at registration time; not updated thereafter |
| `ip_subnet_hash` | string | HMAC-SHA256(/24 subnet of registration IP); never raw IP |

### 2.4 Event Telemetry

Described in full in Section 4.

### 2.5 Fraud Signal Data

| Field | Type | Purpose |
|---|---|---|
| `signal_type` | enum (see fraud taxonomy) | Classification of the detected anomaly |
| `signal_value` | jsonb | Signal-specific metadata (e.g., velocity count, score) |
| `ip_reputation_score` | integer 0–100 | Score from IP reputation service at event time |
| `ip_risk_flags` | string[] | e.g., `['vpn', 'datacenter']`; no raw IP stored |
| `created_at` | timestamptz | Signal timestamp |

### 2.6 Advertiser Data

| Field | Type | Purpose |
|---|---|---|
| `company_name` | string | Identity, invoice generation |
| `billing_email` | string | Invoice delivery |
| `stripe_customer_id` | string | Payment processing reference |
| `vat_number` | string (optional, encrypted) | EU VAT compliance |
| `campaign` fields | various | Described in data model document |

### 2.7 Payout and Ledger Data

| Field | Type | Purpose |
|---|---|---|
| `ledger_entries` | (see data model) | Double-entry accounting of all credits and debits |
| `payout_batches` | (see data model) | Records of disbursements to developers |
| `stripe_transfer_id` | string | Reference to Stripe transfer for reconciliation |

---

## 3. Data NEVER Collected — Explicit Exclusion List

The following data is explicitly excluded from all collection, by both policy and technical design. Where a technical control enforces the exclusion, it is noted.

| Excluded Data | Rationale | Technical Control |
|---|---|---|
| **Source code content** | Core privacy commitment; unnecessary for platform operation | Extension has no `readFile` permission; no code path reads file content |
| **File paths** | Reveals project structure and technology choices | Extension uses only `window.activeTextEditor.document.languageId` (language type), never `.fileName` |
| **File names** | Reveals project naming and structure | Same as above |
| **Workspace folder names** | Reveals project identity | Extension does not read `workspace.workspaceFolders[].name` |
| **AI prompt text** | Developer's intellectual property and potentially sensitive business data | Extension reads only AI extension status events, never message content |
| **AI response content** | May contain sensitive inferred information | Same as above |
| **Terminal content** | Contains commands, credentials, output that is highly sensitive | Extension does not access the integrated terminal |
| **Clipboard content** | Potentially contains credentials or sensitive data | Extension declares no clipboard access |
| **Editor selection / cursor position** | Reveals code context | Not read or transmitted |
| **Git repository URL or remote** | Reveals project identity and organizational affiliation | Not read or transmitted |
| **Git commit messages or diffs** | Source code adjacent | Not read or transmitted |
| **Installed extension list** | Fingerprinting vector; privacy-sensitive | Extension reads only the specific extensions it adapts (to check version), not the full list |
| **Raw IP address** | PII in most jurisdictions | Never written to any database table; only subnet hash and reputation score stored |
| **Precise geolocation** | More granular than required for operations | Only country-level geo inference from IP, at registration only |
| **Operating system username** | PII | Not read or transmitted |
| **Machine hostname** | PII / fingerprinting | Not read or transmitted |
| **Screen resolution or display configuration** | Fingerprinting vector | Not read or transmitted |
| **Browser history or bookmarks** | Not relevant; PII | Not applicable (extension context, not browser) |
| **Keystrokes or typing patterns** | Behaviorally sensitive | Extension does not instrument keyboard events |
| **Mouse movement or click coordinates within editor** | Behaviorally sensitive | Not read or transmitted |
| **Language model API keys** (Copilot tokens, etc.) | Credential; out of scope | Extension has no access to other extensions' secrets |

---

## 4. Local-Only Processing

The following operations are performed entirely on the developer's machine and produce only derived, non-sensitive outputs that are transmitted:

1. **Wait-state detection.** The adapter observes status events from the AI extension (e.g., Copilot's `InlineCompletionList` status). The wait-state start and end timestamps are recorded locally. Only the computed duration (in milliseconds) is transmitted, not the reason for the wait-state or any content associated with it.

2. **Device fingerprint hashing.** A stable device fingerprint is computed from `vscode.env.machineId` (an opaque VS Code-generated identifier) and the OS platform string. The raw `machineId` is HMAC-SHA256 hashed before any transmission. The raw value never leaves the device.

3. **Event signing.** HMAC signatures over event payloads are computed locally using the device secret stored in the OS keychain. The signing key never leaves the device.

4. **Adapter health assessment.** Each adapter evaluates its own operational status locally and reports a summary status (`active | degraded | disabled`), not raw internal state.

5. **Opt-in state gating.** The extension checks opt-in state locally before preparing any event payload. If the developer has not opted in, no events are constructed and no network requests are made.

---

## 5. Event Payload Schemas

All events share a common envelope. Specific event types extend this envelope with type-specific fields.

### 5.1 Common Event Envelope

```typescript
/**
 * Common envelope for all Ad-Alt telemetry events.
 * All monetary values are integer microcents (1/1,000,000 of a dollar).
 * All timestamps are Unix epoch milliseconds (integer).
 */
interface AdAltEventEnvelope {
  /** RFC 4122 v4 UUID. Used as idempotency key. Generated fresh for every event. */
  event_id: string;

  /** Event type discriminator. Determines which payload type is present. */
  event_type:
    | 'impression_requested'
    | 'impression_rendered'
    | 'viewability_threshold_met'
    | 'impression_billable'
    | 'click_event';

  /** Pseudonymous device identifier. UUID v4, registered with the server. */
  device_id: string;

  /** Ad-Alt developer account ID. UUID v4. */
  developer_account_id: string;

  /** Unix epoch milliseconds at which the event occurred on-device. */
  event_timestamp: number;

  /** Ad-Alt extension version string, e.g. "1.4.2". */
  extension_version: string;

  /** Server-issued session nonce. Bound to a specific extension session. */
  session_nonce: string;

  /** HMAC-SHA256(canonical_payload, device_secret). Covers all fields above plus type-specific fields. */
  signature: string;
}
```

### 5.2 `impression_requested` Event

Emitted when a wait-state is detected and an ad decision request is about to be made to the server. This event is emitted before the server responds; it records the request, not the outcome.

```typescript
interface ImpressionRequestedPayload extends AdAltEventEnvelope {
  event_type: 'impression_requested';

  /** Unix epoch ms at which the AI wait-state began. */
  wait_start_ms: number;

  /** VS Code language identifier of the active document at wait-state start. */
  language_id: string;

  /**
   * Which adapter detected the wait-state.
   * Never includes the name of the active file.
   */
  adapter_id: 'copilot_v2' | 'cursor_v1' | 'codeium_v1' | string;

  /** Adapter's self-reported health status at the time of detection. */
  adapter_status: 'active' | 'degraded';
}
```

**Hard exclusion verification:** `ImpressionRequestedPayload` MUST NOT contain:  
`file_path`, `file_name`, `workspace_name`, `prompt_text`, `completion_text`, `source_code`, `cursor_offset`, `selection_text`

### 5.3 `impression_rendered` Event

Emitted when a sponsored message has been displayed to the developer in the VS Code panel.

```typescript
interface ImpressionRenderedPayload extends AdAltEventEnvelope {
  event_type: 'impression_rendered';

  /**
   * Server-issued impression ID, received in the ad decision response.
   * Links this rendered event to the server-side delivery decision.
   */
  impression_id: string;

  /** ID of the campaign this impression belongs to. */
  campaign_id: string;

  /** ID of the creative displayed. */
  creative_id: string;

  /** Unix epoch ms at which the creative was displayed. */
  render_timestamp_ms: number;

  /**
   * Duration of the AI wait-state that triggered this impression, in milliseconds.
   * Computed locally. Not the content of the wait — just how long it lasted.
   */
  wait_duration_ms: number;
}
```

### 5.4 `viewability_threshold_met` Event

Emitted when a rendered impression has been visible in the VS Code panel for at least 1 continuous second (the minimum viewability threshold for billing eligibility).

```typescript
interface ViewabilityThresholdMetPayload extends AdAltEventEnvelope {
  event_type: 'viewability_threshold_met';

  /** Links to the ImpressionRenderedPayload. */
  impression_id: string;

  /** Total milliseconds the impression was visible before this threshold was met. */
  visible_duration_ms: number;

  /**
   * Whether the VS Code window had OS focus during the visibility window.
   * Used to assess quality of the impression.
   */
  window_focused: boolean;
}
```

### 5.5 `impression_billable` Event

Emitted server-side (not by the extension) after the server has validated that an impression meets all billing criteria: viewability threshold met, fraud score acceptable, creative approved, and campaign has remaining budget. This event is written directly to the database by the billing service. It is included here for completeness of the event lifecycle.

```typescript
interface ImpressionBillablePayload {
  /** Same impression_id as the preceding events in the lifecycle. */
  impression_id: string;

  campaign_id: string;
  creative_id: string;
  developer_account_id: string;

  /**
   * Amount billed to the advertiser in microcents.
   * Amount credited to the developer's ledger in microcents.
   * These may differ due to the platform revenue share.
   */
  advertiser_charge_microcents: number;
  developer_credit_microcents: number;

  /** Ad-Alt's revenue share in microcents (= advertiser_charge - developer_credit). */
  platform_fee_microcents: number;

  /** Unix epoch ms at which billing was confirmed. Server-side timestamp. */
  billed_at: number;
}
```

### 5.6 `click_event` Event

Emitted when a developer clicks on the sponsored message's call-to-action link.

```typescript
interface ClickEventPayload extends AdAltEventEnvelope {
  event_type: 'click_event';

  /** Must reference an existing impression_id that has met the viewability threshold. */
  impression_id: string;

  campaign_id: string;
  creative_id: string;

  /** Unix epoch ms at which the click occurred. */
  click_timestamp_ms: number;

  /**
   * Milliseconds elapsed between render_timestamp_ms and click_timestamp_ms.
   * Computed locally. Used for click validity checking (sub-200 ms = suspicious).
   */
  time_to_click_ms: number;
}
```

---

## 6. Data Retention Policy

| Entity / Field Category | Retention Period | Rationale |
|---|---|---|
| **Raw impression events** | 13 months | Covers one full advertising calendar year plus one month for year-end reconciliation |
| **Aggregated impression statistics** | 7 years | Financial reporting requirement |
| **Click events** | 13 months | Same as impressions |
| **Viewability events** | 13 months | Same as impressions |
| **Event deduplication keys** | 7 days | Only needed for replay protection window |
| **Fraud signals** | 24 months | Needed for pattern detection across multiple fraud cycles |
| **Fraud reviews** | 7 years | Legal liability documentation |
| **Ledger entries** | 7 years | Financial records legal requirement |
| **Payout records** | 7 years | Tax documentation (IRS record-keeping requirement) |
| **Admin audit logs** | 7 years | Compliance and accountability |
| **Device records** | 2 years after last activity | Fraud detection continuity; deleted on account deletion |
| **Account metadata** | Duration of account + 30 days after deletion | Grace period for accidental deletion; then purged |
| **IP subnet hashes** | 90 days after registration | Fraud pattern detection window; then purged |
| **Tax IDs** | 7 years after last payout | IRS requirement |
| **Creative content** | Duration of campaign + 13 months | Advertiser dispute resolution |
| **API keys** | Deleted immediately on revocation | No retention after revocation |
| **Session nonces** | Session lifetime + 5 minutes | Replay protection only |

---

## 7. User Deletion and Export Flow

### 7.1 Developer Account Deletion

A developer may delete their account at any time from the web dashboard at `/settings/account`. The deletion flow is:

1. **Confirmation step.** Developer confirms deletion by re-entering their email address. A 24-hour grace period begins.
2. **Grace period.** During the 24-hour window, the account is locked but not deleted. The developer may cancel deletion by clicking the link in a confirmation email.
3. **Soft deletion (T+24h).** The account record is marked `deleted_at = NOW()`. The developer is logged out of all sessions. API keys are immediately revoked.
4. **Personal data purge (T+30 days).** A scheduled job purges:
   - Email address → replaced with `[deleted]@[deleted]`
   - Display name → replaced with `[deleted]`
   - Auth provider subject ID → replaced with null
   - Tax ID (if stored) → purged immediately, does not wait 30 days
   - Payout method reference → purged
   - Device fingerprint hashes → purged
   - IP subnet hashes → purged
5. **Financial data retention.** Ledger entries, payout records, and fraud reviews are retained per the retention schedule above (7 years) but are disassociated from any identifiable personal data. The `developer_account_id` UUID is retained as a pseudonymous reference.

### 7.2 Data Export (Right to Portability)

Developers may request a data export from `/settings/privacy/export`. The export is produced as a JSON archive within 72 hours and made available via a time-limited signed download URL (valid for 48 hours).

The export includes:

```json
{
  "account": { "email": "...", "created_at": "...", "opted_in_at": "..." },
  "devices": [{ "device_id": "...", "os_platform": "...", "registered_at": "..." }],
  "impression_summary": {
    "total_impressions": 1234,
    "total_clicks": 12,
    "by_month": [{ "month": "2026-01", "impressions": 200, "clicks": 2 }]
  },
  "ledger_summary": {
    "total_earned_microcents": 45000000,
    "total_paid_out_microcents": 40000000,
    "pending_microcents": 5000000
  },
  "payout_history": [{ "paid_at": "...", "amount_usd_cents": 1000, "status": "complete" }]
}
```

The export explicitly does **not** include raw event payloads (to avoid leaking campaign or creative details that belong to advertisers) or fraud signal details (to avoid revealing detection methods).

---

## 8. Pseudonymous Device Identity

### 8.1 Device ID Generation

Device IDs are UUID v4 values generated by the extension on first run and stored in the OS keychain (`keytar` library, VS Code secret storage API). The device ID is:

- Not derived from any hardware identifier, MAC address, or CPU serial number
- Not linked to the developer's OS username, email, or any other PII
- Not shared across user accounts on the same machine (each user's VS Code instance generates its own device ID)

### 8.2 Device Fingerprint Hash

For device continuity across extension reinstalls, a device fingerprint hash is computed as:

```
device_fingerprint_hash = HMAC-SHA256(
  key = HMAC-SHA256(vscode.env.machineId, platform_salt),
  data = os_platform || ":" || vscode_version_major || ":" || extension_host_version_major
)
```

Where `platform_salt` is a server-issued per-platform constant (different for win32/darwin/linux) that is not a secret but prevents trivial cross-platform correlation. The raw `vscode.env.machineId` never leaves the device.

### 8.3 Device ID Rotation

Developers may rotate their device ID from the extension's settings panel. Rotation:

1. Generates a new UUID v4 device ID
2. Registers the new device ID with the server
3. Stores the new ID in the OS keychain, overwriting the old one
4. The old device ID is marked `rotated_at = NOW()` in the server database and is no longer accepted for event ingestion
5. Impression history associated with the old device ID is retained in aggregate (for ledger purposes) but the old device ID is no longer linkable to the new one in normal queries

Rotation is encouraged every 6 months and prompted in the extension UI.

---

## 9. IP Address Handling Strategy

**No raw IP addresses are stored at any point in the Ad-Alt system.**

At event ingestion and device registration time, the following processing occurs:

1. The raw IP is extracted from the incoming request at the API gateway layer.
2. The raw IP is passed to an IP reputation service (MaxMind minFraud or equivalent) via a synchronous API call.
3. The reputation service returns: country code, risk score (0–100), and risk flags (`['vpn', 'datacenter', 'tor', 'proxy']`).
4. The /24 subnet of the raw IP is extracted, HMAC-SHA256 hashed with a server-side secret key, and stored as `ip_subnet_hash`.
5. The raw IP is discarded immediately after steps 2–4 complete. It is never written to any log file, database row, or message queue.

For the country code: only the 2-letter ISO 3166-1 alpha-2 code is stored (`country_code` on the `devices` table), and only at device registration time. Subsequent events do not update the country code. This prevents building a location history for the developer.

**IP subnet hash rotation:** The HMAC key used for IP subnet hashing is rotated every 90 days. After rotation, old hashes are no longer comparable to new hashes, providing forward unlinkability. Old hashes are purged after 90 days per the retention schedule.

---

## 10. Hashing and Salting Strategy

| Data Element | Algorithm | Key/Salt Type | Key Rotation |
|---|---|---|---|
| Device fingerprint hash | HMAC-SHA256 | Server-managed platform salt (per OS) | Annual |
| IP subnet hash | HMAC-SHA256 | Server-managed secret key | 90 days |
| Email (for duplicate detection) | HMAC-SHA256 | Server-managed secret key | Annual |
| Tax ID (at-rest) | AES-256-GCM | KMS-managed per-field key | Annual |
| Payout method reference (at-rest) | AES-256-GCM | KMS-managed per-field key | Annual |

Hashing keys are stored in AWS KMS (or equivalent) and are never present in application source code, environment files, or deployment artifacts. The application accesses keys via the KMS SDK with least-privilege IAM roles.

---

## 11. Access Control

| Role | Can See | Cannot See |
|---|---|---|
| **Developer (self)** | Own account data, own impression/click counts, own ledger balance, own device list | Other developers' data, raw fraud signals, campaign details, creative content |
| **Advertiser (self)** | Own campaigns, own creatives, aggregate impression/click stats per campaign (no per-developer breakdown), own invoices | Individual developer identities, individual developer impression data, fraud signals |
| **Moderator** | Creative text and URL for review, advertiser company name | Developer data, ledger data, fraud signals, other advertisers' campaigns |
| **Fraud Analyst** | Aggregate fraud signals, fraud score distributions, fraud review queue | Raw event payloads, developer PII, advertiser billing details |
| **Finance Reviewer** | Payout batch details, ledger summaries, Stripe transfer references | Developer PII (beyond payout-necessary fields), fraud signals, creative content |
| **Super Admin** | All of the above | Nothing is hidden from Super Admin — but all access is logged in `admin_audit_logs` |
| **Infra / DevOps** | Infrastructure metrics, application logs (PII-stripped) | Database contents (database access requires separate MFA-gated bastion) |

Row-level security (RLS) is enforced at the PostgreSQL layer for all non-admin roles using `SET ROLE` switching and RLS policies on each table.

---

## 12. Auditability

### 12.1 Developer Self-Audit

Developers can verify the following from the web dashboard:

- **Impression timeline:** A paginated list of when wait-states were detected and which campaigns served an impression (no creative content, just campaign category)
- **Click history:** Timestamps of clicks, with destination domain (not full URL)
- **Ledger activity:** Every credit and debit entry, with the associated impression or payout reference
- **Device list:** All registered devices, with last-seen timestamps and rotation history
- **Opt-in/out history:** Exact timestamps of opt-in and opt-out events

### 12.2 Advertiser Self-Audit

Advertisers can verify:

- Impression and click counts per campaign per day
- Spend per campaign per day in dollars (converted from microcents at display time)
- Creative approval/rejection history with rejection reasons
- Invoice line items linked to impression batches

### 12.3 Platform Auditability

The `admin_audit_logs` table records every admin action. Super admins can query this table to verify that no unauthorized changes were made. The table is append-only at the database layer.

Third-party audit: Ad-Alt commits to an annual third-party privacy audit by an independent firm, with results published in summary form on the public documentation site.

---

## 13. Hard Privacy Rules

The following fields MUST NEVER appear in any telemetry payload, database table, log file, or message queue entry. These are enforced by both code review policy and automated schema tests (see Section 14).

```
FORBIDDEN_TELEMETRY_FIELDS = [
  "source_code",
  "file_content",
  "file_path",
  "file_name",
  "workspace_name",
  "workspace_path",
  "repository_url",
  "repository_name",
  "git_remote",
  "git_branch",
  "git_commit_message",
  "prompt_text",
  "completion_text",
  "ai_response",
  "ai_prompt",
  "terminal_output",
  "terminal_command",
  "clipboard_content",
  "selection_text",
  "editor_content",
  "cursor_position",
  "cursor_offset",
  "raw_ip",
  "ip_address",
  "machine_id",          // VS Code's raw machineId - only the hash is permitted
  "hostname",
  "username",
  "os_username",
  "full_name",
  "screen_resolution",
  "display_config",
  "installed_extensions",
  "vscode_extension_list"
]
```

---

## 14. Schema Privacy Test

The following test must pass in CI on every commit that touches event schema files (`packages/shared/src/schemas/events.ts` and any file in `packages/shared/src/schemas/`).

```typescript
// packages/shared/src/__tests__/privacy-schema.test.ts

import { describe, it, expect } from 'vitest';
import {
  ImpressionRequestedPayloadSchema,
  ImpressionRenderedPayloadSchema,
  ViewabilityThresholdMetPayloadSchema,
  ClickEventPayloadSchema,
} from '../schemas/events';

/**
 * These field names must NEVER appear in any event schema.
 * If this test fails, a forbidden field was added to a telemetry payload.
 * Do not add exceptions without a documented privacy review and legal sign-off.
 */
const FORBIDDEN_FIELDS: string[] = [
  'source_code',
  'file_content',
  'file_path',
  'file_name',
  'workspace_name',
  'workspace_path',
  'repository_url',
  'repository_name',
  'git_remote',
  'git_branch',
  'git_commit_message',
  'prompt_text',
  'completion_text',
  'ai_response',
  'ai_prompt',
  'terminal_output',
  'terminal_command',
  'clipboard_content',
  'selection_text',
  'editor_content',
  'cursor_position',
  'cursor_offset',
  'raw_ip',
  'ip_address',
  'machine_id',
  'hostname',
  'username',
  'os_username',
  'full_name',
  'screen_resolution',
  'display_config',
  'installed_extensions',
  'vscode_extension_list',
];

const ALL_SCHEMAS = [
  { name: 'ImpressionRequestedPayload', schema: ImpressionRequestedPayloadSchema },
  { name: 'ImpressionRenderedPayload', schema: ImpressionRenderedPayloadSchema },
  { name: 'ViewabilityThresholdMetPayload', schema: ViewabilityThresholdMetPayloadSchema },
  { name: 'ClickEventPayload', schema: ClickEventPayloadSchema },
];

/**
 * Recursively extracts all key names from a Zod schema's shape.
 * Works for ZodObject and ZodEffects wrapping ZodObject.
 */
function extractKeys(schema: unknown): string[] {
  const s = schema as Record<string, unknown>;
  // ZodObject
  if (s._def && (s._def as Record<string, unknown>).typeName === 'ZodObject') {
    const shape = (s._def as Record<string, unknown>).shape as Record<string, unknown>;
    const shapeObj = typeof shape === 'function' ? (shape as () => Record<string, unknown>)() : shape;
    const ownKeys = Object.keys(shapeObj);
    const nestedKeys = Object.values(shapeObj).flatMap((v) => extractKeys(v));
    return [...ownKeys, ...nestedKeys];
  }
  // ZodEffects (e.g. .refine())
  if (s._def && (s._def as Record<string, unknown>).typeName === 'ZodEffects') {
    return extractKeys((s._def as Record<string, unknown>).schema);
  }
  // ZodOptional / ZodNullable
  if (s._def && (s._def as Record<string, unknown>).innerType) {
    return extractKeys((s._def as Record<string, unknown>).innerType);
  }
  return [];
}

describe('Privacy: Telemetry schema forbidden field check', () => {
  for (const { name, schema } of ALL_SCHEMAS) {
    describe(name, () => {
      const schemaKeys = extractKeys(schema);

      for (const forbidden of FORBIDDEN_FIELDS) {
        it(`must not contain field "${forbidden}"`, () => {
          expect(schemaKeys).not.toContain(forbidden);
        });
      }
    });
  }
});

describe('Privacy: Forbidden field list is non-empty and up to date', () => {
  it('has at least 30 forbidden fields defined', () => {
    // This ensures the list is not accidentally emptied.
    expect(FORBIDDEN_FIELDS.length).toBeGreaterThanOrEqual(30);
  });
});
```

This test is run as part of the `pnpm test:privacy` script in the `packages/shared` workspace, which is itself a required step in CI before any pull request may be merged.

---

## 15. Consent and Opt-In Flow

### 15.1 First-Run Consent

On the first activation of the Ad-Alt extension after installation, the extension displays a consent panel in VS Code. The panel:

1. Explains in plain language what Ad-Alt does (shows sponsored text messages during AI wait-states)
2. Lists exactly what data is collected (pointing to this document)
3. Lists exactly what is NOT collected (source code, prompts, file names)
4. Provides a one-click opt-in button
5. Provides a one-click decline button
6. Links to the full privacy policy on the web

No events are generated, no API calls are made, and no data is collected before the developer explicitly clicks opt-in. The consent timestamp is recorded server-side as `developer_profiles.opted_in_at`.

### 15.2 Opt-Out

Developers may opt out at any time from:
- The VS Code extension status bar icon
- The `/settings/privacy` page in the web dashboard

On opt-out:
- `developer_profiles.opted_out_at` is set immediately
- All active sessions receive an opt-out signal within 30 seconds (via the next heartbeat check)
- The extension immediately stops generating events
- No further sponsored content is displayed

Opt-out does not delete previously earned revenue. Developers who opt out and re-opt-in retain their accumulated balance.

---

## 16. Third-Party Data Sharing

Ad-Alt shares data with the following third parties, and only for the stated purposes:

| Third Party | Data Shared | Purpose | Data Processing Agreement |
|---|---|---|---|
| Stripe | Email, tax ID, payout bank details | Payment processing, KYC, payout disbursement | Yes (Stripe is a data processor) |
| MaxMind / IPQualityScore | Request IP at ingestion time | IP reputation scoring | Yes |
| Google Safe Browsing | Advertiser-submitted URLs | Malicious URL detection | Subject to Google's API ToS |
| Postmark / SendGrid | Developer/advertiser email | Transactional email delivery | Yes |

No developer behavioral data (events, device data, impression history) is shared with any third party for advertising, analytics, or profiling purposes. Ad-Alt does not sell developer data.
