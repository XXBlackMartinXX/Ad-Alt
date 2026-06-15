import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createHash } from "crypto";
import { db, apiKeys, users, eq } from "@ad-alt/database";
import type { AppEnv } from "../types.js";

// Middleware that requires a valid API key in Authorization: Bearer <key>
export const requireApiKey = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  const rawKey = authHeader.slice(7);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const [keyRecord] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      revokedAt: apiKeys.revokedAt,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!keyRecord) {
    throw new HTTPException(401, { message: "Invalid API key" });
  }
  if (keyRecord.revokedAt) {
    throw new HTTPException(401, { message: "API key has been revoked" });
  }
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    throw new HTTPException(401, { message: "API key has expired" });
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id));

  c.set("userId", keyRecord.userId);
  await next();
});

// Middleware that requires admin role — must be used after requireApiKey
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");
  if (!userId) throw new HTTPException(401, { message: "Authentication required" });

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.role !== "admin") {
    throw new HTTPException(403, { message: "Admin access required" });
  }
  await next();
});

// Optional auth — sets userId if key is valid, continues even without
export const optionalApiKey = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const rawKey = authHeader.slice(7);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const [keyRecord] = await db
      .select({ userId: apiKeys.userId, revokedAt: apiKeys.revokedAt })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);
    if (keyRecord && !keyRecord.revokedAt) {
      c.set("userId", keyRecord.userId);
    }
  }
  await next();
});
