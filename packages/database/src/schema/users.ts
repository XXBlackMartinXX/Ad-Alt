import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// users — core user accounts
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    role: text("role", {
      enum: ["developer", "advertiser", "admin", "finance"],
    })
      .notNull()
      .default("developer"),
    name: text("name"),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({ usersEmailIdx: index("users_email_idx").on(table.email) }),
);

export const usersRelations = relations(users, ({ one, many }) => ({
  developerProfile: one(developerProfiles, {
    fields: [users.id],
    references: [developerProfiles.userId],
  }),
  advertiserProfile: one(advertiserProfiles, {
    fields: [users.id],
    references: [advertiserProfiles.userId],
  }),
  accounts: many(accounts),
  sessions: many(sessions),
  apiKeys: many(apiKeys),
  devices: many(devices),
}));

// ---------------------------------------------------------------------------
// accounts — OAuth / auth provider accounts (NextAuth compatible)
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["oauth", "email", "credentials"] }).notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (table) => ({
    accountsProviderIdx: uniqueIndex("accounts_provider_provider_account_id_idx").on(
      table.provider,
      table.providerAccountId,
    ),
    accountsUserIdIdx: index("accounts_user_id_idx").on(table.userId),
  }),
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// sessions — NextAuth sessions
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionToken: text("session_token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => ({ sessionsUserIdIdx: index("sessions_user_id_idx").on(table.userId) }),
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// verificationTokens — NextAuth magic links
// ---------------------------------------------------------------------------

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => ({
    verificationTokensIdentifierTokenIdx: uniqueIndex("verification_tokens_identifier_token_idx").on(
      table.identifier,
      table.token,
    ),
  }),
);

// ---------------------------------------------------------------------------
// developerProfiles — developer-specific data
// ---------------------------------------------------------------------------

export const developerProfiles = pgTable(
  "developer_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    optedInAt: timestamp("opted_in_at", { withTimezone: true }),
    consentVersion: text("consent_version"),
    payoutEmail: text("payout_email"),
    displaySurface: text("display_surface", {
      enum: ["status_bar", "webview"],
    })
      .notNull()
      .default("status_bar"),
    preferredAdapterName: text("preferred_adapter_name"),
    totalEarnedMicrocents: bigint("total_earned_microcents", { mode: "number" })
      .notNull()
      .default(0),
    totalPaidOutMicrocents: bigint("total_paid_out_microcents", {
      mode: "number",
    })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ developerProfilesUserIdIdx: index("developer_profiles_user_id_idx").on(table.userId) }),
);

export const developerProfilesRelations = relations(
  developerProfiles,
  ({ one }) => ({
    user: one(users, {
      fields: [developerProfiles.userId],
      references: [users.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// advertiserProfiles — advertiser-specific data
// ---------------------------------------------------------------------------

export const advertiserProfiles = pgTable(
  "advertiser_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    companyName: text("company_name"),
    website: text("website"),
    billingEmail: text("billing_email"),
    stripeCustomerId: text("stripe_customer_id"),
    creditBalanceMicrocents: bigint("credit_balance_microcents", {
      mode: "number",
    })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ advertiserProfilesUserIdIdx: index("advertiser_profiles_user_id_idx").on(table.userId) }),
);

export const advertiserProfilesRelations = relations(
  advertiserProfiles,
  ({ one }) => ({
    user: one(users, {
      fields: [advertiserProfiles.userId],
      references: [users.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// devices — registered extension devices
// ---------------------------------------------------------------------------

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: text("device_id").notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    extensionVersion: text("extension_version"),
    fraudScore: integer("fraud_score").notNull().default(0),
    isBlocked: boolean("is_blocked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    devicesDeviceIdIdx: index("devices_device_id_idx").on(table.deviceId),
    devicesUserIdIdx: index("devices_user_id_idx").on(table.userId),
  }),
);

export const devicesRelations = relations(devices, ({ one }) => ({
  user: one(users, {
    fields: [devices.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// apiKeys — developer API keys for extension authentication
// ---------------------------------------------------------------------------

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull().unique(),
    name: text("name").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    apiKeysUserIdIdx: index("api_keys_user_id_idx").on(table.userId),
    apiKeysKeyHashIdx: index("api_keys_key_hash_idx").on(table.keyHash),
  }),
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));
