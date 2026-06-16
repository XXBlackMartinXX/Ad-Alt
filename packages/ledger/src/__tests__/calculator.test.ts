import { describe, it, expect } from "vitest";
import { LedgerCalculator } from "../calculator.js";
import { PLATFORM_FEE_PERCENT, DEVELOPER_SHARE_PERCENT } from "@ad-alt/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_IMPRESSION_ID = "imp-001";
const DEFAULT_CLICK_ID = "click-001";
const DEFAULT_ADVERTISER_ID = "adv-001";
const DEFAULT_DEVELOPER_ID = "dev-001";

// $10.00 CPM = 10,000,000 microcents per 1000 impressions
const CPM_10_DOLLARS = 10_000_000n;

// $1.00 CPM = 1,000,000 microcents per 1000 impressions
const CPM_1_DOLLAR = 1_000_000n;

// Tiny CPM for edge cases: 1000 microcents per 1000 impressions → 1 microcent per impression
const CPM_TINY = 1000n;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LedgerCalculator", () => {
  const calc = new LedgerCalculator();

  // -------------------------------------------------------------------------
  // Constructor validation
  // -------------------------------------------------------------------------

  describe("constructor", () => {
    it("constructs with default percentages from @ad-alt/shared", () => {
      expect(() => new LedgerCalculator()).not.toThrow();
    });

    it("throws when percentages do not sum to 100", () => {
      expect(() => new LedgerCalculator(50, 40)).toThrow(
        "Platform fee % + developer share % must equal 100"
      );
    });

    it("throws when percentages sum to more than 100", () => {
      expect(() => new LedgerCalculator(60, 60)).toThrow();
    });

    it("constructs with custom 50/50 split", () => {
      expect(() => new LedgerCalculator(50, 50)).not.toThrow();
    });

    it("constructs with 0/100 split (all to developer)", () => {
      expect(() => new LedgerCalculator(0, 100)).not.toThrow();
    });

    it("uses the expected default values from shared constants", () => {
      // Sanity check: verify PLATFORM_FEE_PERCENT + DEVELOPER_SHARE_PERCENT === 100
      expect(PLATFORM_FEE_PERCENT + DEVELOPER_SHARE_PERCENT).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // calculateImpressionEntries
  // -------------------------------------------------------------------------

  describe("calculateImpressionEntries", () => {
    it("calculates correct per-impression value from $10.00 CPM", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      // $10.00 CPM = 10,000,000 µ¢ / 1000 = 10,000 µ¢ per impression
      expect(result.totalMicrocents).toBe(10_000n);
    });

    it("splits correctly with default 60/40 (developer/platform) for $10 CPM", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      // 10,000 * 60% = 6,000 developer, 10,000 - 6,000 = 4,000 platform
      expect(result.developerAmountMicrocents).toBe(6_000n);
      expect(result.platformAmountMicrocents).toBe(4_000n);
    });

    it("developer + platform amounts equal total (balance invariant)", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.developerAmountMicrocents + result.platformAmountMicrocents).toBe(
        result.totalMicrocents
      );
    });

    it("produces correct ledger entry types", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.advertiserCharge.entryType).toBe("advertiser_charge");
      expect(result.developerCredit.entryType).toBe("developer_credit");
      expect(result.platformFee.entryType).toBe("platform_fee");
    });

    it("sets referenceType to 'impression' on all entries", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.advertiserCharge.referenceType).toBe("impression");
      expect(result.developerCredit.referenceType).toBe("impression");
      expect(result.platformFee.referenceType).toBe("impression");
    });

    it("sets correct account types", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.advertiserCharge.account.type).toBe("advertiser");
      expect(result.advertiserCharge.account.id).toBe(DEFAULT_ADVERTISER_ID);
      expect(result.developerCredit.account.type).toBe("developer");
      expect(result.developerCredit.account.id).toBe(DEFAULT_DEVELOPER_ID);
      expect(result.platformFee.account.type).toBe("platform");
      expect(result.platformFee.account.id).toBe("platform");
    });

    it("handles very small CPM (1000 µ¢): per-impression = 1 µ¢, developer = 0, platform = 1", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_TINY,
      });
      // 1000 / 1000 = 1 µ¢ per impression
      expect(result.totalMicrocents).toBe(1n);
      // 1 * 60 / 100 = 0 (floor division in BigInt)
      expect(result.developerAmountMicrocents).toBe(0n);
      // 1 - 0 = 1
      expect(result.platformAmountMicrocents).toBe(1n);
      // Balance still holds
      expect(result.developerAmountMicrocents + result.platformAmountMicrocents).toBe(
        result.totalMicrocents
      );
    });

    it("works with $1.00 CPM", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_1_DOLLAR,
      });
      // $1.00 CPM = 1,000,000 µ¢ / 1000 = 1,000 µ¢ per impression
      expect(result.totalMicrocents).toBe(1_000n);
      expect(result.developerAmountMicrocents).toBe(600n); // 60%
      expect(result.platformAmountMicrocents).toBe(400n); // 40%
    });
  });

  // -------------------------------------------------------------------------
  // calculateClickEntries
  // -------------------------------------------------------------------------

  describe("calculateClickEntries", () => {
    it("click value equals impression value * 10 for $10 CPM", () => {
      const result = calc.calculateClickEntries({
        clickId: DEFAULT_CLICK_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      // $10.00 CPM → 10,000 µ¢ impression value → 100,000 µ¢ click value
      expect(result.totalMicrocents).toBe(100_000n);
    });

    it("splits correctly with default 60/40 for click", () => {
      const result = calc.calculateClickEntries({
        clickId: DEFAULT_CLICK_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.developerAmountMicrocents).toBe(60_000n); // 60% of 100,000
      expect(result.platformAmountMicrocents).toBe(40_000n); // 40% of 100,000
    });

    it("developer + platform equals total (balance invariant)", () => {
      const result = calc.calculateClickEntries({
        clickId: DEFAULT_CLICK_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.developerAmountMicrocents + result.platformAmountMicrocents).toBe(
        result.totalMicrocents
      );
    });

    it("produces correct ledger entry types", () => {
      const result = calc.calculateClickEntries({
        clickId: DEFAULT_CLICK_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.advertiserCharge.entryType).toBe("advertiser_charge");
      expect(result.developerCredit.entryType).toBe("developer_credit");
      expect(result.platformFee.entryType).toBe("platform_fee");
    });

    it("sets referenceType to 'click' on all entries", () => {
      const result = calc.calculateClickEntries({
        clickId: DEFAULT_CLICK_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.advertiserCharge.referenceType).toBe("click");
      expect(result.developerCredit.referenceType).toBe("click");
      expect(result.platformFee.referenceType).toBe("click");
    });

    it("handles very small CPM for clicks", () => {
      const result = calc.calculateClickEntries({
        clickId: DEFAULT_CLICK_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_TINY,
      });
      // impression = 1, click = 10
      expect(result.totalMicrocents).toBe(10n);
      // 10 * 60 / 100 = 6
      expect(result.developerAmountMicrocents).toBe(6n);
      // 10 - 6 = 4
      expect(result.platformAmountMicrocents).toBe(4n);
    });
  });

  // -------------------------------------------------------------------------
  // verifyBalance
  // -------------------------------------------------------------------------

  describe("verifyBalance", () => {
    it("returns true for a valid impression result", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(calc.verifyBalance(result)).toBe(true);
    });

    it("returns true for a valid click result", () => {
      const result = calc.calculateClickEntries({
        clickId: DEFAULT_CLICK_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(calc.verifyBalance(result)).toBe(true);
    });

    it("returns false when balances have been tampered with", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      // Tamper with the result
      const tampered = { ...result, developerAmountMicrocents: result.developerAmountMicrocents + 1n };
      expect(calc.verifyBalance(tampered)).toBe(false);
    });

    it("returns true for tiny CPM edge case", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_TINY,
      });
      expect(calc.verifyBalance(result)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Custom percentage splits
  // -------------------------------------------------------------------------

  describe("custom percentage splits", () => {
    it("50/50 split distributes evenly for round numbers", () => {
      const calc5050 = new LedgerCalculator(50, 50);
      const result = calc5050.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      // 10,000 µ¢ total, 50/50 split → 5,000 each
      expect(result.developerAmountMicrocents).toBe(5_000n);
      expect(result.platformAmountMicrocents).toBe(5_000n);
      expect(calc5050.verifyBalance(result)).toBe(true);
    });

    it("0/100 split assigns everything to developer", () => {
      const calcAllDev = new LedgerCalculator(0, 100);
      const result = calcAllDev.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.developerAmountMicrocents).toBe(10_000n);
      expect(result.platformAmountMicrocents).toBe(0n);
      expect(calcAllDev.verifyBalance(result)).toBe(true);
    });

    it("100/0 split assigns everything to platform", () => {
      const calcAllPlatform = new LedgerCalculator(100, 0);
      const result = calcAllPlatform.calculateImpressionEntries({
        impressionId: DEFAULT_IMPRESSION_ID,
        advertiserId: DEFAULT_ADVERTISER_ID,
        developerId: DEFAULT_DEVELOPER_ID,
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.developerAmountMicrocents).toBe(0n);
      expect(result.platformAmountMicrocents).toBe(10_000n);
      expect(calcAllPlatform.verifyBalance(result)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // formatMicrocents
  // -------------------------------------------------------------------------

  describe("formatMicrocents", () => {
    it("formats 10,000 µ¢ as $0.01 (1 cent)", () => {
      expect(calc.formatMicrocents(10_000n)).toBe("$0.01 (10000 µ¢)");
    });

    it("formats 0 µ¢", () => {
      expect(calc.formatMicrocents(0n)).toBe("$0.00 (0 µ¢)");
    });

    it("formats 1,000,000 µ¢ as $1.00", () => {
      expect(calc.formatMicrocents(1_000_000n)).toBe("$1.00 (1000000 µ¢)");
    });

    it("includes the µ¢ raw amount in the output", () => {
      const result = calc.formatMicrocents(6_000n);
      expect(result).toContain("6000 µ¢");
    });

    it("produces a $ sign in all cases", () => {
      expect(calc.formatMicrocents(100_000n)).toContain("$");
    });
  });

  // -------------------------------------------------------------------------
  // Reconciliation invariants
  // -------------------------------------------------------------------------

  describe("reconciliation invariants", () => {
    it("developer_credit + platform_fee === total for impression", () => {
      const result = calc.calculateImpressionEntries({
        impressionId: "rec-imp-001",
        advertiserId: "adv-rec",
        developerId: "dev-rec",
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.developerCredit.amountMicrocents + result.platformFee.amountMicrocents)
        .toBe(result.advertiserCharge.amountMicrocents);
    });

    it("developer_credit + platform_fee === total for click", () => {
      const result = calc.calculateClickEntries({
        clickId: "rec-click-001",
        advertiserId: "adv-rec",
        developerId: "dev-rec",
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.developerCredit.amountMicrocents + result.platformFee.amountMicrocents)
        .toBe(result.advertiserCharge.amountMicrocents);
    });

    it("sum of N impression charges equals N * per-impression value", () => {
      const N = 100;
      let totalCharged = 0n;
      let totalDeveloper = 0n;
      let totalPlatform = 0n;
      for (let i = 0; i < N; i++) {
        const r = calc.calculateImpressionEntries({
          impressionId: `imp-${i}`,
          advertiserId: "adv-agg",
          developerId: "dev-agg",
          cpmBidMicrocents: CPM_10_DOLLARS,
        });
        totalCharged += r.advertiserCharge.amountMicrocents;
        totalDeveloper += r.developerCredit.amountMicrocents;
        totalPlatform += r.platformFee.amountMicrocents;
      }
      // All N impressions reconcile
      expect(totalDeveloper + totalPlatform).toBe(totalCharged);
      // $10.00 CPM / 1000 impressions * 100 impressions = $1.00 total = 1,000,000 µ¢
      expect(totalCharged).toBe(1_000_000n);
    });

    it("reconciles with custom 50/50 platform/developer split", () => {
      const calc5050 = new LedgerCalculator(50, 50);
      const result = calc5050.calculateImpressionEntries({
        impressionId: "rec-5050",
        advertiserId: "adv-5050",
        developerId: "dev-5050",
        cpmBidMicrocents: CPM_10_DOLLARS,
      });
      expect(result.developerCredit.amountMicrocents).toBe(result.platformFee.amountMicrocents);
      expect(result.developerCredit.amountMicrocents + result.platformFee.amountMicrocents)
        .toBe(result.totalMicrocents);
    });

    it("reconciles over a mixed impression+click session", () => {
      let totalCharged = 0n;
      let totalDev = 0n;
      let totalPlatform = 0n;

      for (let i = 0; i < 10; i++) {
        const r = calc.calculateImpressionEntries({
          impressionId: `session-imp-${i}`,
          advertiserId: "adv-session",
          developerId: "dev-session",
          cpmBidMicrocents: CPM_1_DOLLAR,
        });
        totalCharged += r.advertiserCharge.amountMicrocents;
        totalDev += r.developerCredit.amountMicrocents;
        totalPlatform += r.platformFee.amountMicrocents;
      }

      // 2 clicks in the session
      for (let i = 0; i < 2; i++) {
        const r = calc.calculateClickEntries({
          clickId: `session-click-${i}`,
          advertiserId: "adv-session",
          developerId: "dev-session",
          cpmBidMicrocents: CPM_1_DOLLAR,
        });
        totalCharged += r.advertiserCharge.amountMicrocents;
        totalDev += r.developerCredit.amountMicrocents;
        totalPlatform += r.platformFee.amountMicrocents;
      }

      expect(totalDev + totalPlatform).toBe(totalCharged);
    });

    it("verifyBalance returns true for all valid results", () => {
      const cpmValues = [CPM_TINY, CPM_1_DOLLAR, CPM_10_DOLLARS, 999_000_000n];
      for (const cpm of cpmValues) {
        const imp = calc.calculateImpressionEntries({
          impressionId: "verify-imp",
          advertiserId: "adv",
          developerId: "dev",
          cpmBidMicrocents: cpm,
        });
        expect(calc.verifyBalance(imp)).toBe(true);

        const click = calc.calculateClickEntries({
          clickId: "verify-click",
          advertiserId: "adv",
          developerId: "dev",
          cpmBidMicrocents: cpm,
        });
        expect(calc.verifyBalance(click)).toBe(true);
      }
    });

    it("rounding never creates money — developer + platform === total exactly", () => {
      // Use odd CPM to force truncation in integer division
      const oddCpm = 3_000_001n; // 3,000,001 µ¢/1000 = 3,000.001 µ¢ per impression (truncates)
      const result = calc.calculateImpressionEntries({
        impressionId: "rounding-test",
        advertiserId: "adv-rounding",
        developerId: "dev-rounding",
        cpmBidMicrocents: oddCpm,
      });
      // Must reconcile exactly — no rounding error creates or destroys value
      expect(result.developerCredit.amountMicrocents + result.platformFee.amountMicrocents)
        .toBe(result.totalMicrocents);
      expect(calc.verifyBalance(result)).toBe(true);
    });
  });
});
