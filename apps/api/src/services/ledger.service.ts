import {
  db,
  campaigns,
  ledgerEntries,
  developerProfiles,
  balances,
} from "@ad-alt/database";
import type { DB } from "@ad-alt/database";
import { eq, sql, and } from "@ad-alt/database";
import { LedgerCalculator } from "@ad-alt/ledger";
import type { LedgerAccount } from "@ad-alt/ledger";
import { randomUUID } from "crypto";
import { logger } from "../middleware/logging.js";

const calculator = new LedgerCalculator();

// The transaction handle type used by every `db.transaction(async (tx) => ...)` callback.
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export class LedgerService {
  /**
   * Atomically applies a signed microcent delta to an account's running balance
   * and returns the resulting balance. Uses `INSERT ... ON CONFLICT DO UPDATE`
   * (an atomic upsert keyed on the unique `accountId` column) rather than a
   * separate select-then-update, so concurrent billable events for the same
   * account serialize on the row without losing updates and without needing
   * a row to be pre-seeded.
   */
  private async applyBalanceDelta(
    tx: Tx,
    account: LedgerAccount,
    deltaMicrocents: number,
    now: Date,
  ): Promise<number> {
    const [row] = await tx
      .insert(balances)
      .values({
        accountId: account.id,
        accountType: account.type,
        balanceMicrocents: deltaMicrocents,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: balances.accountId,
        set: {
          balanceMicrocents: sql`${balances.balanceMicrocents} + ${deltaMicrocents}`,
          updatedAt: now,
        },
      })
      .returning({ balanceMicrocents: balances.balanceMicrocents });

    if (!row) {
      throw new Error("Balance upsert did not return a row");
    }

    return row.balanceMicrocents;
  }

  async recordImpression(
    impressionId: string,
    campaignId: string,
    developerId: string,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Lock the campaign row to prevent concurrent budget over-spend
      const [campaign] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .for("update")
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

      const chargeAmount = Number(result.totalMicrocents);

      // Atomic budget check: if this impression would exceed the total budget, exhaust the campaign
      if (campaign.spentMicrocents + chargeAmount > campaign.budgetMicrocents) {
        logger.warn({ campaignId, impressionId, msg: "ledger_budget_exhausted" });
        await tx
          .update(campaigns)
          .set({ status: "exhausted", updatedAt: new Date() })
          .where(eq(campaigns.id, campaignId));
        return;
      }

      const now = new Date();

      // Apply the balance delta for each account in the same transaction as the
      // ledger-entry insert, so balanceAfterMicrocents reflects the post-write
      // balance and a crash between these steps can never happen.
      const advertiserBalanceAfter = await this.applyBalanceDelta(
        tx,
        result.advertiserCharge.account,
        -Number(result.advertiserCharge.amountMicrocents),
        now,
      );
      const developerBalanceAfter = await this.applyBalanceDelta(
        tx,
        result.developerCredit.account,
        Number(result.developerCredit.amountMicrocents),
        now,
      );
      const platformBalanceAfter = await this.applyBalanceDelta(
        tx,
        result.platformFee.account,
        Number(result.platformFee.amountMicrocents),
        now,
      );

      await tx.insert(ledgerEntries).values([
        {
          id: randomUUID(),
          entryType: result.advertiserCharge.entryType,
          referenceType: result.advertiserCharge.referenceType,
          referenceId: result.advertiserCharge.referenceId,
          accountId: result.advertiserCharge.account.id,
          accountType: result.advertiserCharge.account.type,
          amountMicrocents: Number(result.advertiserCharge.amountMicrocents),
          balanceAfterMicrocents: advertiserBalanceAfter,
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
          balanceAfterMicrocents: developerBalanceAfter,
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
          balanceAfterMicrocents: platformBalanceAfter,
          description: result.platformFee.description,
          createdAt: now,
        },
      ]);

      await tx
        .update(developerProfiles)
        .set({
          totalEarnedMicrocents: sql`${developerProfiles.totalEarnedMicrocents} + ${Number(result.developerAmountMicrocents)}`,
          updatedAt: now,
        })
        .where(eq(developerProfiles.userId, developerId));

      await tx
        .update(campaigns)
        .set({
          spentMicrocents: sql`${campaigns.spentMicrocents} + ${chargeAmount}`,
          updatedAt: now,
        })
        .where(eq(campaigns.id, campaignId));
    });
  }

  async recordClick(
    clickId: string,
    campaignId: string,
    developerId: string,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const [campaign] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .for("update")
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

      const chargeAmount = Number(result.totalMicrocents);

      if (campaign.spentMicrocents + chargeAmount > campaign.budgetMicrocents) {
        logger.warn({ campaignId, clickId, msg: "ledger_budget_exhausted_for_click" });
        await tx
          .update(campaigns)
          .set({ status: "exhausted", updatedAt: new Date() })
          .where(eq(campaigns.id, campaignId));
        return;
      }

      const now = new Date();

      const advertiserBalanceAfter = await this.applyBalanceDelta(
        tx,
        result.advertiserCharge.account,
        -Number(result.advertiserCharge.amountMicrocents),
        now,
      );
      const developerBalanceAfter = await this.applyBalanceDelta(
        tx,
        result.developerCredit.account,
        Number(result.developerCredit.amountMicrocents),
        now,
      );
      const platformBalanceAfter = await this.applyBalanceDelta(
        tx,
        result.platformFee.account,
        Number(result.platformFee.amountMicrocents),
        now,
      );

      await tx.insert(ledgerEntries).values([
        {
          id: randomUUID(),
          entryType: result.advertiserCharge.entryType,
          referenceType: result.advertiserCharge.referenceType,
          referenceId: result.advertiserCharge.referenceId,
          accountId: result.advertiserCharge.account.id,
          accountType: result.advertiserCharge.account.type,
          amountMicrocents: Number(result.advertiserCharge.amountMicrocents),
          balanceAfterMicrocents: advertiserBalanceAfter,
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
          balanceAfterMicrocents: developerBalanceAfter,
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
          balanceAfterMicrocents: platformBalanceAfter,
          description: result.platformFee.description,
          createdAt: now,
        },
      ]);

      await tx
        .update(developerProfiles)
        .set({
          totalEarnedMicrocents: sql`${developerProfiles.totalEarnedMicrocents} + ${Number(result.developerAmountMicrocents)}`,
          updatedAt: now,
        })
        .where(eq(developerProfiles.userId, developerId));

      await tx
        .update(campaigns)
        .set({
          spentMicrocents: sql`${campaigns.spentMicrocents} + ${chargeAmount}`,
          updatedAt: now,
        })
        .where(eq(campaigns.id, campaignId));
    });
  }
}
