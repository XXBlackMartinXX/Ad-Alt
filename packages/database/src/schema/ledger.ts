import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { advertiserProfiles, developerProfiles } from "./users.js";

// ---------------------------------------------------------------------------
// ledgerEntries — immutable financial ledger (no updatedAt by design)
// ---------------------------------------------------------------------------

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryType: text("entry_type", {
      enum: [
        "advertiser_charge",
        "developer_credit",
        "platform_fee",
        "refund_debit",
        "refund_credit",
        "payout_debit",
      ],
    }).notNull(),
    referenceType: text("reference_type", {
      enum: ["impression", "click", "refund", "payout"],
    }).notNull(),
    referenceId: text("reference_id").notNull(),
    accountId: text("account_id").notNull(),
    accountType: text("account_type", {
      enum: ["advertiser", "developer", "platform"],
    }).notNull(),
    amountMicrocents: bigint("amount_microcents", { mode: "number" }).notNull(),
    balanceAfterMicrocents: bigint("balance_after_microcents", {
      mode: "number",
    }).notNull(),
    description: text("description").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // NOTE: No updatedAt — ledger entries are immutable once written.
  },
  (table) => ({
    ledgerEntriesAccountIdIdx: index("ledger_entries_account_id_idx").on(table.accountId),
    ledgerEntriesEntryTypeIdx: index("ledger_entries_entry_type_idx").on(table.entryType),
    ledgerEntriesReferenceIdx: index("ledger_entries_reference_type_reference_id_idx").on(table.referenceType, table.referenceId),
    ledgerEntriesCreatedAtIdx: index("ledger_entries_created_at_idx").on(table.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// balances — running account balances (denormalized for read performance)
// ---------------------------------------------------------------------------

export const balances = pgTable(
  "balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull().unique(),
    accountType: text("account_type", {
      enum: ["advertiser", "developer", "platform"],
    }).notNull(),
    balanceMicrocents: bigint("balance_microcents", { mode: "number" })
      .notNull()
      .default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ balancesAccountIdIdx: uniqueIndex("balances_account_id_idx").on(table.accountId) }),
);

// ---------------------------------------------------------------------------
// payoutBatches — batch payout runs
// ---------------------------------------------------------------------------

export const payoutBatches = pgTable(
  "payout_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    totalMicrocents: bigint("total_microcents", { mode: "number" }).notNull(),
    developerCount: integer("developer_count").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ payoutBatchesStatusIdx: index("payout_batches_status_idx").on(table.status) }),
);

export const payoutBatchesRelations = relations(
  payoutBatches,
  ({ many }) => ({
    payouts: many(payouts),
  }),
);

// ---------------------------------------------------------------------------
// payouts — individual developer payouts within a batch
// ---------------------------------------------------------------------------

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payoutBatchId: uuid("payout_batch_id")
      .notNull()
      .references(() => payoutBatches.id, { onDelete: "restrict" }),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developerProfiles.id, { onDelete: "restrict" }),
    amountMicrocents: bigint("amount_microcents", { mode: "number" }).notNull(),
    payoutEmail: text("payout_email").notNull(),
    status: text("status", {
      enum: ["pending", "sent", "failed"],
    })
      .notNull()
      .default("pending"),
    stripeTransferId: text("stripe_transfer_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    payoutsPayoutBatchIdIdx: index("payouts_payout_batch_id_idx").on(table.payoutBatchId),
    payoutsDeveloperIdIdx: index("payouts_developer_id_idx").on(table.developerId),
    payoutsStatusIdx: index("payouts_status_idx").on(table.status),
  }),
);

export const payoutsRelations = relations(payouts, ({ one }) => ({
  payoutBatch: one(payoutBatches, {
    fields: [payouts.payoutBatchId],
    references: [payoutBatches.id],
  }),
  developer: one(developerProfiles, {
    fields: [payouts.developerId],
    references: [developerProfiles.id],
  }),
}));

// ---------------------------------------------------------------------------
// advertiserInvoices — Stripe payment records
// ---------------------------------------------------------------------------

export const advertiserInvoices = pgTable(
  "advertiser_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advertiserId: uuid("advertiser_id")
      .notNull()
      .references(() => advertiserProfiles.id, { onDelete: "restrict" }),
    stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
    amountMicrocents: bigint("amount_microcents", { mode: "number" }).notNull(),
    status: text("status", {
      enum: ["pending", "paid", "failed", "refunded"],
    })
      .notNull()
      .default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    advertiserInvoicesAdvertiserIdIdx: index("advertiser_invoices_advertiser_id_idx").on(table.advertiserId),
    advertiserInvoicesStatusIdx: index("advertiser_invoices_status_idx").on(table.status),
    advertiserInvoicesStripeIdx: index("advertiser_invoices_stripe_payment_intent_id_idx").on(table.stripePaymentIntentId),
  }),
);

export const advertiserInvoicesRelations = relations(
  advertiserInvoices,
  ({ one }) => ({
    advertiser: one(advertiserProfiles, {
      fields: [advertiserInvoices.advertiserId],
      references: [advertiserProfiles.id],
    }),
  }),
);
