import {
  db,
  campaigns,
  ledgerEntries,
  developerProfiles,
} from "@ad-alt/database";
import { eq, sql } from "@ad-alt/database";
import { LedgerCalculator } from "@ad-alt/ledger";
import { randomUUID } from "crypto";
import { logger } from "../middleware/logging.js";

const calculator = new LedgerCalculator();

export class LedgerService {
  async recordImpression(
    impressionId: string,
    campaignId: string,
    developerId: string,
  ): Promise<void> {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      logger.warn({ impressionId, campaignId, msg: "ledger_campaign_not_found" });
      return;
    }

    const result = calculator.calculateImpressionEntries({
      impressionId,
      advertiserId: campaign.advertiserId,
      developerId,
      cpmBidMicrocents: BigInt(campaign.cpmBidMicrocents),
    });

    if (!calculator.verifyBalance(result)) {
      logger.error({ impressionId, msg: "ledger_balance_mismatch" });
      throw new Error("Ledger balance verification failed");
    }

    const now = new Date();

    await db.insert(ledgerEntries).values([
      {
        id: randomUUID(),
        entryType: result.advertiserCharge.entryType,
        referenceType: result.advertiserCharge.referenceType,
        referenceId: result.advertiserCharge.referenceId,
        accountId: result.advertiserCharge.account.id,
        accountType: result.advertiserCharge.account.type,
        amountMicrocents: Number(result.advertiserCharge.amountMicrocents),
        balanceAfterMicrocents: 0,
        description: result.advertiserCharge.description,
        createdAt: now,
      },
      {
        id: randomUUID(),
        entryType: result.developerCredit.entryType,
        referenceType: result.developerCredit.referenceType,
        referenceId: result.developerCredit.referenceId,
        accountId: result.developerCredit.account.id,
        accountType: result.developerCredit.account.type,
        amountMicrocents: Number(result.developerCredit.amountMicrocents),
        balanceAfterMicrocents: 0,
        description: result.developerCredit.description,
        createdAt: now,
      },
      {
        id: randomUUID(),
        entryType: result.platformFee.entryType,
        referenceType: result.platformFee.referenceType,
        referenceId: result.platformFee.referenceId,
        accountId: result.platformFee.account.id,
        accountType: result.platformFee.account.type,
        amountMicrocents: Number(result.platformFee.amountMicrocents),
        balanceAfterMicrocents: 0,
        description: result.platformFee.description,
        createdAt: now,
      },
    ]);

    // Increment developer's total earned using SQL arithmetic to avoid races
    await db
      .update(developerProfiles)
      .set({
        totalEarnedMicrocents: sql`${developerProfiles.totalEarnedMicrocents} + ${Number(result.developerAmountMicrocents)}`,
        updatedAt: now,
      })
      .where(eq(developerProfiles.userId, developerId));

    // Increment campaign spend
    await db
      .update(campaigns)
      .set({
        spentMicrocents: sql`${campaigns.spentMicrocents} + ${Number(result.totalMicrocents)}`,
        updatedAt: now,
      })
      .where(eq(campaigns.id, campaignId));
  }

  async recordClick(
    clickId: string,
    campaignId: string,
    developerId: string,
  ): Promise<void> {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      logger.warn({ clickId, campaignId, msg: "ledger_campaign_not_found_for_click" });
      return;
    }

    const result = calculator.calculateClickEntries({
      clickId,
      advertiserId: campaign.advertiserId,
      developerId,
      cpmBidMicrocents: BigInt(campaign.cpmBidMicrocents),
    });

    if (!calculator.verifyBalance(result)) {
      logger.error({ clickId, msg: "click_ledger_balance_mismatch" });
      throw new Error("Click ledger balance verification failed");
    }

    const now = new Date();

    await db.insert(ledgerEntries).values([
      {
        id: randomUUID(),
        entryType: result.advertiserCharge.entryType,
        referenceType: result.advertiserCharge.referenceType,
        referenceId: result.advertiserCharge.referenceId,
        accountId: result.advertiserCharge.account.id,
        accountType: result.advertiserCharge.account.type,
        amountMicrocents: Number(result.advertiserCharge.amountMicrocents),
        balanceAfterMicrocents: 0,
        description: result.advertiserCharge.description,
        createdAt: now,
      },
      {
        id: randomUUID(),
        entryType: result.developerCredit.entryType,
        referenceType: result.developerCredit.referenceType,
        referenceId: result.developerCredit.referenceId,
        accountId: result.developerCredit.account.id,
        accountType: result.developerCredit.account.type,
        amountMicrocents: Number(result.developerCredit.amountMicrocents),
        balanceAfterMicrocents: 0,
        description: result.developerCredit.description,
        createdAt: now,
      },
      {
        id: randomUUID(),
        entryType: result.platformFee.entryType,
        referenceType: result.platformFee.referenceType,
        referenceId: result.platformFee.referenceId,
        accountId: result.platformFee.account.id,
        accountType: result.platformFee.account.type,
        amountMicrocents: Number(result.platformFee.amountMicrocents),
        balanceAfterMicrocents: 0,
        description: result.platformFee.description,
        createdAt: now,
      },
    ]);

    // Increment developer earnings for the click bonus
    await db
      .update(developerProfiles)
      .set({
        totalEarnedMicrocents: sql`${developerProfiles.totalEarnedMicrocents} + ${Number(result.developerAmountMicrocents)}`,
        updatedAt: now,
      })
      .where(eq(developerProfiles.userId, developerId));

    // Increment campaign spend for the click bonus
    await db
      .update(campaigns)
      .set({
        spentMicrocents: sql`${campaigns.spentMicrocents} + ${Number(result.totalMicrocents)}`,
        updatedAt: now,
      })
      .where(eq(campaigns.id, campaignId));
  }
}
