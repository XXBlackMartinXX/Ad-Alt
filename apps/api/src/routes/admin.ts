import { Hono } from "hono";
import { requireApiKey, requireAdmin } from "../middleware/auth.js";
import {
  db,
  creatives,
  creativeReviews,
  impressionEvents,
  adminAuditLogs,
  campaigns,
  users,
} from "@ad-alt/database";
import { eq, desc } from "@ad-alt/database";
import type { AppEnv } from "../types.js";
import { ReviewCreativeSchema } from "@ad-alt/shared";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { z } from "zod";

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("/v1/admin/*", requireApiKey);
adminRoutes.use("/v1/admin/*", requireAdmin);

// List creatives pending review
adminRoutes.get("/v1/admin/creatives/pending", async (c) => {
  const pending = await db
    .select()
    .from(creatives)
    .where(eq(creatives.status, "pending_review"))
    .orderBy(creatives.createdAt)
    .limit(50);
  return c.json({ data: pending });
});

// Review a creative
adminRoutes.post(
  "/v1/admin/creatives/:id/review",
  zValidator("json", ReviewCreativeSchema),
  async (c) => {
    const adminUserId = c.get("userId") as string;
    const creativeId = c.req.param("id");
    const { decision, reviewNote } = c.req.valid("json");

    const [creative] = await db
      .select()
      .from(creatives)
      .where(eq(creatives.id, creativeId))
      .limit(1);
    if (!creative) return c.json({ error: "not_found", message: "Creative not found" }, 404);

    // Update creative status
    const [updated] = await db
      .update(creatives)
      .set({ status: decision, updatedAt: new Date() })
      .where(eq(creatives.id, creativeId))
      .returning();

    // Create review record
    await db.insert(creativeReviews).values({
      id: randomUUID(),
      creativeId,
      reviewerId: adminUserId,
      decision,
      reviewNote: reviewNote ?? null,
      reviewedAt: new Date(),
    });

    // Fetch admin email for audit log
    const [adminUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, adminUserId))
      .limit(1);

    // Audit log
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await db.insert(adminAuditLogs).values({
      id: randomUUID(),
      actorId: adminUserId,
      actorEmail: adminUser?.email ?? "unknown",
      action: `creative.${decision}`,
      targetType: "creative",
      targetId: creativeId,
      details: { decision, reviewNote },
      ipAddressHash: createHash("sha256").update(ip).digest("hex"),
      createdAt: new Date(),
    });

    return c.json({ data: updated });
  },
);

// List impressions held for fraud review
adminRoutes.get("/v1/admin/fraud/pending", async (c) => {
  const pending = await db
    .select()
    .from(impressionEvents)
    .where(eq(impressionEvents.status, "fraud_blocked"))
    .orderBy(desc(impressionEvents.createdAt))
    .limit(50);
  return c.json({ data: pending });
});

// List campaigns pending activation
adminRoutes.get("/v1/admin/campaigns/pending", async (c) => {
  const pending = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.status, "pending_review"))
    .orderBy(campaigns.createdAt)
    .limit(50);
  return c.json({ data: pending });
});

const CampaignReviewSchema = z.object({
  decision: z.enum(["active", "archived"]),
  note: z.string().optional(),
});

// Approve or reject a campaign
adminRoutes.post(
  "/v1/admin/campaigns/:id/review",
  zValidator("json", CampaignReviewSchema),
  async (c) => {
    const adminUserId = c.get("userId") as string;
    const campaignId = c.req.param("id");
    const { decision, note } = c.req.valid("json");

    const [updated] = await db
      .update(campaigns)
      .set({ status: decision, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId))
      .returning();

    if (!updated) return c.json({ error: "not_found", message: "Campaign not found" }, 404);

    // Fetch admin email for audit log
    const [adminUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, adminUserId))
      .limit(1);

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await db.insert(adminAuditLogs).values({
      id: randomUUID(),
      actorId: adminUserId,
      actorEmail: adminUser?.email ?? "unknown",
      action: `campaign.${decision}`,
      targetType: "campaign",
      targetId: campaignId,
      details: { decision, note },
      ipAddressHash: createHash("sha256").update(ip).digest("hex"),
      createdAt: new Date(),
    });

    return c.json({ data: updated });
  },
);
