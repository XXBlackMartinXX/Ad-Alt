import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, apiKeys, users, devices } from "@ad-alt/database";
import { eq } from "@ad-alt/database";
import { createHash, randomBytes } from "crypto";
import { randomUUID } from "crypto";
import { rateLimit } from "../middleware/rate-limit.js";

export const authRoutes = new Hono();

/**
 * Device token exchange: the VS Code extension calls this with a device ID
 * and an optional NextAuth session token to exchange for a persistent API key.
 *
 * In the real flow the NextAuth session token is validated server-side; here we
 * accept an authenticated user ID directly (set by the web dashboard after OAuth).
 */
const ExchangeSchema = z.object({
  deviceId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  userId: z.string().uuid(),
  keyName: z.string().min(1).max(80).default("VS Code extension"),
});

authRoutes.use(
  "/v1/auth/*",
  rateLimit({ limit: 10, windowSeconds: 60 }),
);

authRoutes.post(
  "/v1/auth/exchange",
  zValidator("json", ExchangeSchema),
  async (c) => {
    const { deviceId, userId, keyName } = c.req.valid("json");

    // Verify user exists
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return c.json({ error: "not_found", message: "User not found" }, 404);
    }

    // Upsert device record
    await db
      .insert(devices)
      .values({
        id: randomUUID(),
        deviceId,
        userId,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .update(devices)
      .set({ lastSeenAt: new Date(), userId })
      .where(eq(devices.deviceId, deviceId));

    // Generate a new API key
    const rawKey = `ppft_${randomBytes(32).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const [apiKey] = await db
      .insert(apiKeys)
      .values({
        id: randomUUID(),
        userId,
        keyHash,
        name: keyName,
        createdAt: new Date(),
      })
      .returning({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt });

    return c.json(
      {
        data: {
          // The raw key is returned exactly once; the server never stores it.
          apiKey: rawKey,
          keyId: apiKey?.id,
          name: apiKey?.name,
          createdAt: apiKey?.createdAt,
        },
      },
      201,
    );
  },
);

authRoutes.delete("/v1/auth/keys/:keyId", async (c) => {
  const keyId = c.req.param("keyId");

  const [revoked] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId))
    .returning({ id: apiKeys.id });

  if (!revoked) {
    return c.json({ error: "not_found", message: "API key not found" }, 404);
  }

  return c.json({ data: { revoked: true, keyId } });
});
