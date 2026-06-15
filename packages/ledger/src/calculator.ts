import { PLATFORM_FEE_PERCENT, DEVELOPER_SHARE_PERCENT } from "@ad-alt/shared";
import type { ImpressionLedgerResult, ClickLedgerResult, LedgerAccount } from "./types.js";

const CLICK_IMPRESSION_MULTIPLIER = 10n;

export class LedgerCalculator {
  /** Retained for parity checking and display; computation uses developerSharePercent. */
  readonly platformFeePercent: bigint;
  private readonly developerSharePercent: bigint;

  constructor(
    platformFeePercent = PLATFORM_FEE_PERCENT,
    developerSharePercent = DEVELOPER_SHARE_PERCENT
  ) {
    if (platformFeePercent + developerSharePercent !== 100) {
      throw new Error("Platform fee % + developer share % must equal 100");
    }
    this.platformFeePercent = BigInt(platformFeePercent);
    this.developerSharePercent = BigInt(developerSharePercent);
  }

  calculateImpressionEntries(params: {
    impressionId: string;
    advertiserId: string;
    developerId: string;
    cpmBidMicrocents: bigint;
  }): ImpressionLedgerResult {
    // CPM = cost per 1000 impressions, so per-impression = CPM / 1000
    const totalMicrocents = params.cpmBidMicrocents / 1000n;
    const developerAmountMicrocents = (totalMicrocents * this.developerSharePercent) / 100n;
    const platformAmountMicrocents = totalMicrocents - developerAmountMicrocents;

    const advertiserAccount: LedgerAccount = { id: params.advertiserId, type: "advertiser" };
    const developerAccount: LedgerAccount = { id: params.developerId, type: "developer" };
    const platformAccount: LedgerAccount = { id: "platform", type: "platform" };

    return {
      advertiserCharge: {
        entryType: "advertiser_charge",
        referenceType: "impression",
        referenceId: params.impressionId,
        account: advertiserAccount,
        amountMicrocents: totalMicrocents,
        description: `Impression charge: ${params.impressionId}`,
      },
      developerCredit: {
        entryType: "developer_credit",
        referenceType: "impression",
        referenceId: params.impressionId,
        account: developerAccount,
        amountMicrocents: developerAmountMicrocents,
        description: `Impression earning: ${params.impressionId}`,
      },
      platformFee: {
        entryType: "platform_fee",
        referenceType: "impression",
        referenceId: params.impressionId,
        account: platformAccount,
        amountMicrocents: platformAmountMicrocents,
        description: `Platform fee: ${params.impressionId}`,
      },
      totalMicrocents,
      developerAmountMicrocents,
      platformAmountMicrocents,
    };
  }

  calculateClickEntries(params: {
    clickId: string;
    advertiserId: string;
    developerId: string;
    cpmBidMicrocents: bigint;
  }): ClickLedgerResult {
    // Click value = impression value * CLICK_IMPRESSION_MULTIPLIER
    const impressionValue = params.cpmBidMicrocents / 1000n;
    const totalMicrocents = impressionValue * CLICK_IMPRESSION_MULTIPLIER;
    const developerAmountMicrocents = (totalMicrocents * this.developerSharePercent) / 100n;
    const platformAmountMicrocents = totalMicrocents - developerAmountMicrocents;

    const advertiserAccount: LedgerAccount = { id: params.advertiserId, type: "advertiser" };
    const developerAccount: LedgerAccount = { id: params.developerId, type: "developer" };
    const platformAccount: LedgerAccount = { id: "platform", type: "platform" };

    return {
      advertiserCharge: {
        entryType: "advertiser_charge",
        referenceType: "click",
        referenceId: params.clickId,
        account: advertiserAccount,
        amountMicrocents: totalMicrocents,
        description: `Click charge: ${params.clickId}`,
      },
      developerCredit: {
        entryType: "developer_credit",
        referenceType: "click",
        referenceId: params.clickId,
        account: developerAccount,
        amountMicrocents: developerAmountMicrocents,
        description: `Click earning: ${params.clickId}`,
      },
      platformFee: {
        entryType: "platform_fee",
        referenceType: "click",
        referenceId: params.clickId,
        account: platformAccount,
        amountMicrocents: platformAmountMicrocents,
        description: `Platform fee: ${params.clickId}`,
      },
      totalMicrocents,
      developerAmountMicrocents,
      platformAmountMicrocents,
    };
  }

  verifyBalance(result: ImpressionLedgerResult | ClickLedgerResult): boolean {
    return result.developerAmountMicrocents + result.platformAmountMicrocents === result.totalMicrocents;
  }

  formatMicrocents(microcents: bigint): string {
    const cents = microcents / 10000n;
    const dollars = cents / 100n;
    const remainingCents = cents % 100n;
    return `$${dollars}.${remainingCents.toString().padStart(2, "0")} (${microcents} µ¢)`;
  }
}
