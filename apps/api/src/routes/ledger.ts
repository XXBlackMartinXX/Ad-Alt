import { Hono } from "hono";
import { requireApiKey } from "../middleware/auth.js";
import { db, ledgerEntries, developerProfiles, eq, and, desc } from "@ad-alt/database";
import type { AppEnv } from "../types.js";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export const ledgerRoutes = new Hono<AppEnv>();
ledgerRoutes.use("/v1/ledger/*", requireApiKey);

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

// Developer's earnings ledger
ledgerRoutes.get(
  "/v1/ledger/me",
  zValidator("query", QuerySchema),
  async (c) => {
    const userId = c.get("userId") as string;
    const { limit, page } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const [profile] = await db
      .select()
      .from(developerProfiles)
      .where(eq(developerProfiles.userId, userId))
      .limit(1);

    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.accountId, userId),
          eq(ledgerEntries.accountType, "developer"),
        ),
      )
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(limit)
      .offset(offset);

    const totalEarned = profile?.totalEarnedMicrocents ?? 0;
    const totalPaidOut = profile?.totalPaidOutMicrocents ?? 0;

    return c.json({
      data: {
        totalEarnedMicrocents: String(totalEarned),
        totalPaidOutMicrocents: String(totalPaidOut),
        pendingMicrocents: String(totalEarned - totalPaidOut),
        entries: entries.map((e) => ({
          ...e,
          amountMicrocents: String(e.amountMicrocents),
          balanceAfterMicrocents: String(e.balanceAfterMicrocents),
        })),
        pagination: { page, limit },
      },
    });
  },
);
