/**
 * Seed script for local development.
 *
 * Run with:  pnpm --filter @ad-alt/database db:seed
 *
 * Creates:
 *  - 1 admin user
 *  - 1 developer user (opted in)
 *  - 1 advertiser user with advertiser profile
 *  - 1 active campaign with 1 approved creative
 *  - Feature flags: kill_switch_all_ads, disable_adapter_mock
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index.js";

const connectionString =
  process.env["DATABASE_URL"] ??
  "postgresql://promptprofit:promptprofit_dev@localhost:5432/promptprofit_dev";

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql, { schema });

async function seed(): Promise<void> {
  console.log("Starting seed...");

  // Idempotency guard: skip if already seeded.
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@promptprofit.dev"))
    .limit(1);
  if (existing.length > 0) {
    console.log("Seed already applied — nothing to do");
    await sql.end();
    return;
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  const [adminUser] = await db
    .insert(schema.users)
    .values({
      email: "admin@promptprofit.dev",
      name: "PromptProfit Admin",
      role: "admin",
      emailVerified: new Date(),
    })
    .returning();

  if (!adminUser) throw new Error("Failed to insert admin user");

  const [developerUser] = await db
    .insert(schema.users)
    .values({
      email: "dev@example.com",
      name: "Alice Developer",
      role: "developer",
      emailVerified: new Date(),
    })
    .returning();

  if (!developerUser) throw new Error("Failed to insert developer user");

  const [advertiserUser] = await db
    .insert(schema.users)
    .values({
      email: "advertiser@example.com",
      name: "Bob Advertiser",
      role: "advertiser",
      emailVerified: new Date(),
    })
    .returning();

  if (!advertiserUser) throw new Error("Failed to insert advertiser user");

  console.log("  Created users:", adminUser.email, developerUser.email, advertiserUser.email);

  // ---------------------------------------------------------------------------
  // Developer profile (opted in)
  // ---------------------------------------------------------------------------

  const [developerProfile] = await db
    .insert(schema.developerProfiles)
    .values({
      userId: developerUser.id,
      optedInAt: new Date(),
      consentVersion: "1.0",
      payoutEmail: "dev@example.com",
      displaySurface: "status_bar",
      preferredAdapterName: "ai_status_bar",
      totalEarnedMicrocents: 0,
      totalPaidOutMicrocents: 0,
    })
    .returning();

  if (!developerProfile) throw new Error("Failed to insert developer profile");

  console.log("  Created developer profile for:", developerUser.email);

  // ---------------------------------------------------------------------------
  // Advertiser profile
  // ---------------------------------------------------------------------------

  const [advertiserProfile] = await db
    .insert(schema.advertiserProfiles)
    .values({
      userId: advertiserUser.id,
      companyName: "Acme Corp",
      website: "https://acme.example.com",
      billingEmail: "billing@acme.example.com",
      creditBalanceMicrocents: 50_000_000, // $50.00 starting credit
    })
    .returning();

  if (!advertiserProfile) throw new Error("Failed to insert advertiser profile");

  console.log("  Created advertiser profile for:", advertiserUser.email);

  // ---------------------------------------------------------------------------
  // Campaign (active)
  // ---------------------------------------------------------------------------

  const [campaign] = await db
    .insert(schema.campaigns)
    .values({
      advertiserId: advertiserProfile.id,
      name: "Acme Dev Tools Launch",
      status: "active",
      budgetMicrocents: 10_000_000, // $10.00 total budget
      dailyBudgetMicrocents: 2_000_000, // $2.00/day
      cpmBidMicrocents: 500_000, // $0.50 CPM
      spentMicrocents: 0,
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      targetAdapterNames: ["copilot_status", "ai_status_bar"],
    })
    .returning();

  if (!campaign) throw new Error("Failed to insert campaign");

  console.log("  Created campaign:", campaign.name);

  // ---------------------------------------------------------------------------
  // Creative (approved)
  // ---------------------------------------------------------------------------

  const [creative] = await db
    .insert(schema.creatives)
    .values({
      campaignId: campaign.id,
      advertiserId: advertiserProfile.id,
      status: "approved",
      headline: "Ship faster with Acme Dev Tools",
      body: "Autocomplete, linting, and AI assist — all in one extension.",
      displayUrl: "acme.example.com/devtools",
      clickUrl: "https://acme.example.com/devtools?utm_source=promptprofit&utm_medium=vscode",
      impressionCount: 0,
      clickCount: 0,
    })
    .returning();

  if (!creative) throw new Error("Failed to insert creative");

  console.log("  Created creative:", creative.headline);

  // ---------------------------------------------------------------------------
  // Creative review record (approved by admin)
  // ---------------------------------------------------------------------------

  await db.insert(schema.creativeReviews).values({
    creativeId: creative.id,
    reviewerId: adminUser.id,
    decision: "approved",
    reviewNote: "Looks good — compliant with ad copy guidelines.",
    reviewedAt: new Date(),
  });

  console.log("  Created creative review (approved)");

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  await db.insert(schema.balances).values([
    {
      accountId: advertiserProfile.id,
      accountType: "advertiser",
      balanceMicrocents: 50_000_000,
    },
    {
      // Keyed by userId (not developerProfile.id) to match the accountId
      // convention LedgerCalculator/LedgerService use for developer_credit entries.
      accountId: developerUser.id,
      accountType: "developer",
      balanceMicrocents: 0,
    },
    {
      accountId: "platform",
      accountType: "platform",
      balanceMicrocents: 0,
    },
  ]);

  console.log("  Created balances");

  // ---------------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------------

  await db.insert(schema.featureFlags).values([
    {
      name: "kill_switch_all_ads",
      isEnabled: false,
      description:
        "Emergency kill switch — when enabled, suppresses ALL ad delivery across every adapter.",
      updatedBy: adminUser.id,
    },
    {
      name: "disable_adapter_mock",
      isEnabled: false,
      description:
        "When enabled, the mock adapter will not serve ads (useful to hide test traffic in staging).",
      updatedBy: adminUser.id,
    },
  ]);

  console.log("  Created feature flags: kill_switch_all_ads, disable_adapter_mock");

  // ---------------------------------------------------------------------------
  // Admin audit log entry for the seed run
  // ---------------------------------------------------------------------------

  await db.insert(schema.adminAuditLogs).values({
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: "seed.run",
    targetType: "system",
    targetId: "local_dev",
    details: {
      seededEntities: ["users", "developerProfiles", "advertiserProfiles", "campaigns", "creatives", "featureFlags"],
    },
    ipAddressHash:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", // SHA-256 of empty string (placeholder)
  });

  console.log("  Created audit log entry for seed run");

  // ---------------------------------------------------------------------------
  // Done
  // ---------------------------------------------------------------------------

  await sql.end();
  console.log("Seed completed");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
