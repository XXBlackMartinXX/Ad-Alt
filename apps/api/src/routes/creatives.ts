import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireApiKey } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { CreateCreativeSchema } from "@ad-alt/shared";
import { db, creatives, campaigns, eq, and } from "@ad-alt/database";
import type { AppEnv } from "../types.js";
import { randomUUID } from "crypto";

export const creativesRoutes = new Hono<AppEnv>();

creativesRoutes.use("/v1/creatives", requireApiKey);
creativesRoutes.use("/v1/creatives/*", requireApiKey);
creativesRoutes.use("/v1/creatives", rateLimit({ limit: 60, windowSeconds: 60 }));
creativesRoutes.use("/v1/creatives/*", rateLimit({ limit: 60, windowSeconds: 60 }));

// List creatives for the authenticated advertiser
creativesRoutes.get("/v1/creatives", async (c) => {
  const userId = c.get("userId") as string;
  const campaignId = c.req.query("campaignId");

  const baseCondition = eq(creatives.advertiserId, userId);
  const allCreatives = await db
    .select()
    .from(creatives)
    .where(
      campaignId
        ? and(baseCondition, eq(creatives.campaignId, campaignId))
        : baseCondition,
    );
  return c.json({ data: allCreatives });
});

// Create a creative
creativesRoutes.post(
  "/v1/creatives",
  zValidator("json", CreateCreativeSchema),
  async (c) => {
    const userId = c.get("userId") as string;
    const body = c.req.valid("json");

    // Verify the campaign belongs to this advertiser
    const [campaign] = await db
      .select({ id: campaigns.id, advertiserId: campaigns.advertiserId })
      .from(campaigns)
      .where(and(eq(campaigns.id, body.campaignId), eq(campaigns.advertiserId, userId)))
      .limit(1);

    if (!campaign) {
      return c.json(
        { error: "not_found", message: "Campaign not found or does not belong to you" },
        404,
      );
    }

    const [creative] = await db
      .insert(creatives)
      .values({
        id: randomUUID(),
        campaignId: body.campaignId,
        advertiserId: userId,
        status: "pending_review",
        headline: body.headline,
        body: body.body ?? null,
        displayUrl: body.displayUrl,
        clickUrl: body.clickUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return c.json({ data: creative }, 201);
  },
);

// Get one creative (must belong to caller)
creativesRoutes.get("/v1/creatives/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");

  const [creative] = await db
    .select()
    .from(creatives)
    .where(and(eq(creatives.id, id), eq(creatives.advertiserId, userId)))
    .limit(1);

  if (!creative) return c.json({ error: "not_found", message: "Creative not found" }, 404);
  return c.json({ data: creative });
});

// Archive a creative (soft delete)
creativesRoutes.delete("/v1/creatives/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");

  const [creative] = await db
    .update(creatives)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(creatives.id, id), eq(creatives.advertiserId, userId)))
    .returning();

  if (!creative) return c.json({ error: "not_found", message: "Creative not found" }, 404);
  return c.json({ data: creative });
});
