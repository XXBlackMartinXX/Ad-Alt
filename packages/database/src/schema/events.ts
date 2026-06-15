import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { adDeliveryDecisions, campaigns, creatives } from "./campaigns.js";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// impressionEvents
// ---------------------------------------------------------------------------

export const impressionEvents = pgTable(
  "impression_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    adDecisionId: uuid("ad_decision_id")
      .notNull()
      .references(() => adDeliveryDecisions.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    creativeId: uuid("creative_id")
      .notNull()
      .references(() => creatives.id, { onDelete: "restrict" }),
    deviceId: text("device_id").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    adapterName: text("adapter_name").notNull(),
    status: text("status", {
      enum: [
        "requested",
        "rendered",
        "viewable",
        "billable",
        "reconciled",
        "fraud_blocked",
      ],
    })
      .notNull()
      .default("requested"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    renderedAt: timestamp("rendered_at", { withTimezone: true }),
    viewableAt: timestamp("viewable_at", { withTimezone: true }),
    billableAt: timestamp("billable_at", { withTimezone: true }),
    displayedDurationMs: integer("displayed_duration_ms"),
    fraudScore: integer("fraud_score").notNull().default(0),
    fraudSignals: jsonb("fraud_signals"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    impressionEventsIdempotencyKeyIdx: uniqueIndex("impression_events_idempotency_key_idx").on(table.idempotencyKey),
    impressionEventsAdDecisionIdIdx: index("impression_events_ad_decision_id_idx").on(table.adDecisionId),
    impressionEventsCampaignIdIdx: index("impression_events_campaign_id_idx").on(table.campaignId),
    impressionEventsDeviceIdIdx: index("impression_events_device_id_idx").on(table.deviceId),
    impressionEventsStatusIdx: index("impression_events_status_idx").on(table.status),
    impressionEventsRequestedAtIdx: index("impression_events_requested_at_idx").on(table.requestedAt),
  }),
);

export const impressionEventsRelations = relations(
  impressionEvents,
  ({ one, many }) => ({
    adDecision: one(adDeliveryDecisions, {
      fields: [impressionEvents.adDecisionId],
      references: [adDeliveryDecisions.id],
    }),
    campaign: one(campaigns, {
      fields: [impressionEvents.campaignId],
      references: [campaigns.id],
    }),
    creative: one(creatives, {
      fields: [impressionEvents.creativeId],
      references: [creatives.id],
    }),
    user: one(users, {
      fields: [impressionEvents.userId],
      references: [users.id],
    }),
    clickEvents: many(clickEvents),
  }),
);

// ---------------------------------------------------------------------------
// clickEvents
// ---------------------------------------------------------------------------

export const clickEvents = pgTable(
  "click_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    impressionEventId: uuid("impression_event_id")
      .notNull()
      .references(() => impressionEvents.id, { onDelete: "restrict" }),
    adDecisionId: uuid("ad_decision_id")
      .notNull()
      .references(() => adDeliveryDecisions.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    creativeId: uuid("creative_id")
      .notNull()
      .references(() => creatives.id, { onDelete: "restrict" }),
    deviceId: text("device_id").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["pending", "validated", "billable", "fraud_blocked"],
    })
      .notNull()
      .default("pending"),
    clickedAt: timestamp("clicked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    fraudScore: integer("fraud_score").notNull().default(0),
    fraudSignals: jsonb("fraud_signals"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    clickEventsIdempotencyKeyIdx: uniqueIndex("click_events_idempotency_key_idx").on(table.idempotencyKey),
    clickEventsImpressionEventIdIdx: index("click_events_impression_event_id_idx").on(table.impressionEventId),
    clickEventsCampaignIdIdx: index("click_events_campaign_id_idx").on(table.campaignId),
    clickEventsDeviceIdIdx: index("click_events_device_id_idx").on(table.deviceId),
    clickEventsStatusIdx: index("click_events_status_idx").on(table.status),
    clickEventsClickedAtIdx: index("click_events_clicked_at_idx").on(table.clickedAt),
  }),
);

export const clickEventsRelations = relations(clickEvents, ({ one }) => ({
  impressionEvent: one(impressionEvents, {
    fields: [clickEvents.impressionEventId],
    references: [impressionEvents.id],
  }),
  adDecision: one(adDeliveryDecisions, {
    fields: [clickEvents.adDecisionId],
    references: [adDeliveryDecisions.id],
  }),
  campaign: one(campaigns, {
    fields: [clickEvents.campaignId],
    references: [campaigns.id],
  }),
  creative: one(creatives, {
    fields: [clickEvents.creativeId],
    references: [creatives.id],
  }),
  user: one(users, {
    fields: [clickEvents.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// eventDeduplicationKeys
// ---------------------------------------------------------------------------

export const eventDeduplicationKeys = pgTable(
  "event_deduplication_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    eventDedupKeysKeyIdx: uniqueIndex("event_dedup_keys_key_idx").on(table.key),
    eventDedupKeysExpiresAtIdx: index("event_dedup_keys_expires_at_idx").on(table.expiresAt),
  }),
);

// ---------------------------------------------------------------------------
// fraudSignals
// ---------------------------------------------------------------------------

export const fraudSignals = pgTable(
  "fraud_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type", {
      enum: ["impression", "click", "device"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    signalName: text("signal_name").notNull(),
    signalScore: integer("signal_score").notNull(),
    details: jsonb("details"),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    fraudSignalsEntityIdx: index("fraud_signals_entity_type_entity_id_idx").on(table.entityType, table.entityId),
    fraudSignalsSignalNameIdx: index("fraud_signals_signal_name_idx").on(table.signalName),
    fraudSignalsDetectedAtIdx: index("fraud_signals_detected_at_idx").on(table.detectedAt),
  }),
);

// ---------------------------------------------------------------------------
// fraudReviews
// ---------------------------------------------------------------------------

export const fraudReviews = pgTable(
  "fraud_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    reviewerId: uuid("reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decision: text("decision", {
      enum: ["pass", "block", "appeal_granted"],
    }).notNull(),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    fraudReviewsEntityIdx: index("fraud_reviews_entity_type_entity_id_idx").on(table.entityType, table.entityId),
    fraudReviewsReviewerIdIdx: index("fraud_reviews_reviewer_id_idx").on(table.reviewerId),
  }),
);

export const fraudReviewsRelations = relations(fraudReviews, ({ one }) => ({
  reviewer: one(users, {
    fields: [fraudReviews.reviewerId],
    references: [users.id],
  }),
}));
