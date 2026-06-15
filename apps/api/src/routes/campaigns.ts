import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireApiKey } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { CreateCampaignSchema, UpdateCampaignSchema } from "@ad-alt/shared";
import { db, campaigns, eq, and } from "@ad-alt/database";
import type { AppEnv } from "../types.js";
import { randomUUID } from "crypto";

export const campaignRoutes = new Hono<AppEnv>();

campaignRoutes.use("/v1/campaigns", requireApiKey);
campaignRoutes.use("/v1/campaigns/*", requireApiKey);
campaignRoutes.use("/v1/campaigns", rateLimit({ limit: 60, windowSeconds: 60 }));
campaignRoutes.use("/v1/campaigns/*", rateLimit({ limit: 60, windowSeconds: 60 }));

// List campaigns for the authenticated advertiser
campaignRoutes.get("/v1/campaigns", async (c) => {
  const userId = c.get("userId") as string;
  const advertiserCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.advertiserId, userId));
  return c.json({ data: advertiserCampaigns });
});

// Create campaign
campaignRoutes.post(
  "/v1/campaigns",
  zValidator("json", CreateCampaignSchema),
  async (c) => {
    const userId = c.get("userId") as string;
    const body = c.req.valid("json");

    const [campaign] = await db
      .insert(campaigns)
      .values({
        id: randomUUID(),
        advertiserId: userId,
        name: body.name,
        status: "draft",
        budgetMicrocents: body.budgetMicrocents,
        dailyBudgetMicrocents: body.dailyBudgetMicrocents ?? null,
        cpmBidMicrocents: body.cpmBidMicrocents,
        startAt: body.startAt ? new Date(body.startAt) : null,
        endAt: body.endAt ? new Date(body.endAt) : null,
        targetAdapterNames: body.targetAdapterNames ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return c.json({ data: campaign }, 201);
  },
);

// Get one campaign (must belong to caller)
campaignRoutes.get("/v1/campaigns/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.advertiserId, userId)))
    .limit(1);
  if (!campaign) return c.json({ error: "not_found", message: "Campaign not found" }, 404);
  return c.json({ data: campaign });
});

// Update campaign
campaignRoutes.patch(
  "/v1/campaigns/:id",
  zValidator("json", UpdateCampaignSchema),
  async (c) => {
    const userId = c.get("userId") as string;
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [campaign] = await db
      .update(campaigns)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.budgetMicrocents !== undefined && {
          budgetMicrocents: body.budgetMicrocents,
        }),
        ...(body.cpmBidMicrocents !== undefined && {
          cpmBidMicrocents: body.cpmBidMicrocents,
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(campaigns.id, id), eq(campaigns.advertiserId, userId)))
      .returning();

    if (!campaign) return c.json({ error: "not_found", message: "Campaign not found" }, 404);
    return c.json({ data: campaign });
  },
);
