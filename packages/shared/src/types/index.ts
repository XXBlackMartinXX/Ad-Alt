// ---------------------------------------------------------------------------
// Branded primitive types
// ---------------------------------------------------------------------------

/** Unique identifier for a user account */
export type UserId = string & { readonly __brand: "UserId" };

/** Pseudonymous identifier for a developer's device (from extension) */
export type DeviceId = string & { readonly __brand: "DeviceId" };

/** Unique identifier for an advertising campaign */
export type CampaignId = string & { readonly __brand: "CampaignId" };

/** Unique identifier for an ad creative */
export type CreativeId = string & { readonly __brand: "CreativeId" };

/** Unique identifier for an impression event */
export type ImpressionId = string & { readonly __brand: "ImpressionId" };

/** Unique identifier for a click event */
export type ClickId = string & { readonly __brand: "ClickId" };

/** Unique identifier for a ledger entry */
export type LedgerEntryId = string & { readonly __brand: "LedgerEntryId" };

/** Monetary amount expressed in microcents (1 USD = 1,000,000 microcents) */
export type Microcents = number & { readonly __brand: "Microcents" };

/** ISO 8601 timestamp string, e.g. "2024-01-15T12:00:00.000Z" */
export type ISOTimestamp = string & { readonly __brand: "ISOTimestamp" };

/** UUID used as an idempotency key for event processing */
export type EventIdempotencyKey = string & { readonly __brand: "EventIdempotencyKey" };

// ---------------------------------------------------------------------------
// Enum-style union types
// ---------------------------------------------------------------------------

/** Roles a user can hold in the system */
export type UserRole = "developer" | "advertiser" | "admin" | "finance";

/** Lifecycle states of an advertising campaign */
export type CampaignStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "paused"
  | "exhausted"
  | "archived";

/** Lifecycle states of an ad creative */
export type CreativeStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "archived";

/** Lifecycle states of an impression event */
export type ImpressionStatus =
  | "requested"
  | "rendered"
  | "viewable"
  | "billable"
  | "reconciled"
  | "fraud_blocked";

/** Lifecycle states of a click event */
export type ClickStatus = "pending" | "validated" | "billable" | "fraud_blocked";

/** Outcome of a fraud evaluation */
export type FraudDecision = "pass" | "review" | "block";

/** Types of entries in the financial ledger */
export type LedgerEntryType =
  | "advertiser_charge"
  | "developer_credit"
  | "platform_fee"
  | "refund_debit"
  | "refund_credit"
  | "payout_debit";

/** Identifiers for VS Code extension adapters that detect wait states */
export type AdapterName =
  | "copilot_status"
  | "ai_status_bar"
  | "mock"
  | "manual";

// ---------------------------------------------------------------------------
// Composite types
// ---------------------------------------------------------------------------

/** Payload emitted when an adapter detects a developer entering a wait state */
export type WaitStateEvent = {
  adapterId: AdapterName;
  startedAt: ISOTimestamp;
  sessionId: string;
};
