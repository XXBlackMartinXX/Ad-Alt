import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { optionalApiKey } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { AdDecisionService } from "../services/ad-decision.service.js";
import type { AppEnv } from "../types.js";

const adDecisionService = new AdDecisionService();

const QuerySchema = z.object({
  deviceId: z.string().min(1).max(64),
  adapterName: z.enum(["copilot_status", "ai_status_bar", "mock", "manual"]),
  extensionVersion: z.string(),
});

export const adDecisionRoutes = new Hono<AppEnv>();

adDecisionRoutes.use("/v1/ads/*", optionalApiKey);
adDecisionRoutes.use("/v1/ads/*", rateLimit({ limit: 120, windowSeconds: 60 }));

adDecisionRoutes.get("/v1/ads/decision", zValidator("query", QuerySchema), async (c) => {
  const { deviceId, adapterName, extensionVersion } = c.req.valid("query");
  const userId = c.get("userId") as string | undefined;

  const decision = await adDecisionService.selectAd({
    deviceId,
    adapterName,
    extensionVersion,
    ...(userId !== undefined && { userId }),
  });

  if (!decision) {
    return c.body(null, 204);
  }

  return c.json({ data: decision });
});
