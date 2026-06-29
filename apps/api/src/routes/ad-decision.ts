import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ADAPTER_ENUM_VALUES } from "@ad-alt/platform-core";
import { optionalApiKey } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { AdDecisionService } from "../services/ad-decision.service.js";
import { db, adDeliveryDecisions, creatives, eq, and } from "@ad-alt/database";
import type { AppEnv } from "../types.js";

const adDecisionService = new AdDecisionService();

const QuerySchema = z.object({
  deviceId: z.string().min(1).max(64),
  adapterName: z.enum(ADAPTER_ENUM_VALUES),
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

// Click redirect — browser-initiated from vscode.env.openExternal; no auth required.
// Looks up the approved creative's clickUrl and redirects to it.
// The clickUrl is never sent to the extension, preventing leakage in telemetry.
adDecisionRoutes.get("/v1/ads/click/:id", async (c) => {
  const id = c.req.param("id");

  const [decision] = await db
    .select({ creativeId: adDeliveryDecisions.creativeId })
    .from(adDeliveryDecisions)
    .where(eq(adDeliveryDecisions.id, id))
    .limit(1);

  if (!decision) {
    return c.json({ error: "not_found", message: "Ad decision not found" }, 404);
  }

  const [creative] = await db
    .select({ clickUrl: creatives.clickUrl })
    .from(creatives)
    .where(and(eq(creatives.id, decision.creativeId), eq(creatives.status, "approved")))
    .limit(1);

  if (!creative) {
    return c.json({ error: "not_found", message: "Creative not found or not approved" }, 404);
  }

  // Defense-in-depth: re-validate the stored URL is still HTTPS before redirecting
  if (!creative.clickUrl.startsWith("https://")) {
    return c.json({ error: "invalid_url" }, 422);
  }

  return c.redirect(creative.clickUrl, 302);
});
