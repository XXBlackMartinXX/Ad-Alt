import { Hono } from "hono";
import { db, sql } from "@ad-alt/database";
import { getRedis } from "../redis.js";

export const healthRoutes = new Hono();

healthRoutes.get("/health", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};

  // Check database
  try {
    await db.execute(sql`SELECT 1`);
    checks["database"] = "ok";
  } catch {
    checks["database"] = "error";
  }

  // Check Redis
  try {
    await getRedis().ping();
    checks["redis"] = "ok";
  } catch {
    checks["redis"] = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return c.json(
    { status: allOk ? "ok" : "degraded", checks, timestamp: new Date().toISOString() },
    allOk ? 200 : 503,
  );
});
