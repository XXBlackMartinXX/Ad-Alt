import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// adminAuditLogs — immutable audit trail for all admin/finance actions
// ---------------------------------------------------------------------------

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    details: jsonb("details"),
    ipAddressHash: text("ip_address_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    adminAuditLogsActorIdIdx: index("admin_audit_logs_actor_id_idx").on(table.actorId),
    adminAuditLogsActionIdx: index("admin_audit_logs_action_idx").on(table.action),
    adminAuditLogsTargetIdx: index("admin_audit_logs_target_type_target_id_idx").on(table.targetType, table.targetId),
    adminAuditLogsCreatedAtIdx: index("admin_audit_logs_created_at_idx").on(table.createdAt),
  }),
);

export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [adminAuditLogs.actorId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// featureFlags — runtime feature gates and kill switches
// ---------------------------------------------------------------------------

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isEnabled: boolean("is_enabled").notNull().default(false),
    description: text("description").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ featureFlagsNameIdx: uniqueIndex("feature_flags_name_idx").on(table.name) }),
);

export const featureFlagsRelations = relations(featureFlags, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [featureFlags.updatedBy],
    references: [users.id],
  }),
}));
