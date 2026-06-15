import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  bigint,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { advertiserProfiles, users } from "./users.js";

// ---------------------------------------------------------------------------
// campaigns
// ---------------------------------------------------------------------------

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advertiserId: uuid("advertiser_id")
      .notNull()
      .references(() => advertiserProfiles.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    status: text("status", {
      enum: [
        "draft",
        "pending_review",
        "active",
        "paused",
        "exhausted",
        "archived",
      ],
    })
      .notNull()
      .default("draft"),
    budgetMicrocents: bigint("budget_microcents", { mode: "number" }).notNull(),
    dailyBudgetMicrocents: bigint("daily_budget_microcents", {
      mode: "number",
    }),
    spentMicrocents: bigint("spent_microcents", { mode: "number" })
      .notNull()
      .default(0),
    cpmBidMicrocents: bigint("cpm_bid_microcents", { mode: "number" }).notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    targetAdapterNames: jsonb("target_adapter_names"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    campaignsAdvertiserIdIdx: index("campaigns_advertiser_id_idx").on(table.advertiserId),
    campaignsStatusIdx: index("campaigns_status_idx").on(table.status),
  }),
);

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  advertiser: one(advertiserProfiles, {
    fields: [campaigns.advertiserId],
    references: [advertiserProfiles.id],
  }),
  creatives: many(creatives),
  adDeliveryDecisions: many(adDeliveryDecisions),
}));

// ---------------------------------------------------------------------------
// creatives
// ---------------------------------------------------------------------------

export const creatives = pgTable(
  "creatives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    advertiserId: uuid("advertiser_id")
      .notNull()
      .references(() => advertiserProfiles.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["pending_review", "approved", "rejected", "archived"],
    })
      .notNull()
      .default("pending_review"),
    headline: text("headline").notNull(),
    body: text("body"),
    displayUrl: text("display_url").notNull(),
    clickUrl: text("click_url").notNull(),
    impressionCount: bigint("impression_count", { mode: "number" })
      .notNull()
      .default(0),
    clickCount: bigint("click_count", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    creativesCampaignIdIdx: index("creatives_campaign_id_idx").on(table.campaignId),
    creativesAdvertiserIdIdx: index("creatives_advertiser_id_idx").on(table.advertiserId),
    creativesStatusIdx: index("creatives_status_idx").on(table.status),
  }),
);

export const creativesRelations = relations(creatives, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [creatives.campaignId],
    references: [campaigns.id],
  }),
  advertiser: one(advertiserProfiles, {
    fields: [creatives.advertiserId],
    references: [advertiserProfiles.id],
  }),
  reviews: many(creativeReviews),
  adDeliveryDecisions: many(adDeliveryDecisions),
}));

// ---------------------------------------------------------------------------
// creativeReviews
// ---------------------------------------------------------------------------

export const creativeReviews = pgTable(
  "creative_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creativeId: uuid("creative_id")
      .notNull()
      .references(() => creatives.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: text("decision", { enum: ["approved", "rejected"] }).notNull(),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    creativeReviewsCreativeIdIdx: index("creative_reviews_creative_id_idx").on(table.creativeId),
    creativeReviewsReviewerIdIdx: index("creative_reviews_reviewer_id_idx").on(table.reviewerId),
  }),
);

export const creativeReviewsRelations = relations(
  creativeReviews,
  ({ one }) => ({
    creative: one(creatives, {
      fields: [creativeReviews.creativeId],
      references: [creatives.id],
    }),
    reviewer: one(users, {
      fields: [creativeReviews.reviewerId],
      references: [users.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// adDeliveryDecisions
// ---------------------------------------------------------------------------

export const adDeliveryDecisions = pgTable(
  "ad_delivery_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    cpmBidMicrocents: bigint("cpm_bid_microcents", { mode: "number" }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    wasServed: boolean("was_served").notNull().default(false),
  },
  (table) => ({
    adDeliveryCampaignIdIdx: index("ad_delivery_decisions_campaign_id_idx").on(table.campaignId),
    adDeliveryCreativeIdIdx: index("ad_delivery_decisions_creative_id_idx").on(table.creativeId),
    adDeliveryDeviceIdIdx: index("ad_delivery_decisions_device_id_idx").on(table.deviceId),
    adDeliveryExpiresAtIdx: index("ad_delivery_decisions_expires_at_idx").on(table.expiresAt),
  }),
);

export const adDeliveryDecisionsRelations = relations(
  adDeliveryDecisions,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [adDeliveryDecisions.campaignId],
      references: [campaigns.id],
    }),
    creative: one(creatives, {
      fields: [adDeliveryDecisions.creativeId],
      references: [creatives.id],
    }),
    user: one(users, {
      fields: [adDeliveryDecisions.userId],
      references: [users.id],
    }),
  }),
);
