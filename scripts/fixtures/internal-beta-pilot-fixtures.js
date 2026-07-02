'use strict';
/**
 * Deterministic synthetic fixtures for the Internal Beta Pilot Rehearsal.
 *
 * Everything in this file is synthetic, fixed, and reproducible: fixed IDs
 * (prefixed `rehearsal-`), fixed amounts (bigint microcents), fixed email
 * addresses on the reserved `example.test` domain, and no random values
 * anywhere. Timestamps used for "delayed replay" simulation are relative
 * millisecond delays (`delayMs`), not wall-clock dates, so the scenario
 * data itself never changes run to run -- only a report's own generatedAt
 * stamp (written by the rehearsal script, not by this file) changes.
 *
 * NO REAL DATA: no real advertiser, no real developer, no real payment
 * data, no real API keys, no ChatGPT prompt/response/page content of any
 * kind. See docs/internal-beta/monetization/PILOT_REHEARSAL_PLAN.md.
 *
 * The "expected*" exports below are computed with a small, independent,
 * well-known pricing formula defined once in this file (see
 * computeImpressionSplit/computeClickSplit) -- NOT by importing the real
 * @ad-alt/ledger calculator. This is deliberate: the rehearsal script
 * compares these independently-computed expectations against the REAL
 * production LedgerCalculator's actual output, giving a genuine two-sided
 * cross-check rather than comparing a value against itself.
 */

// ---------------------------------------------------------------------------
// Pricing formula (mirrors @ad-alt/ledger's documented rules exactly:
// impression = cpmBid / 1000; click = impression value x 10; developer
// share = 60%; platform fee = remainder). Kept intentionally simple so it
// is trivially auditable against packages/ledger/src/calculator.ts.
// ---------------------------------------------------------------------------

const DEVELOPER_SHARE_PERCENT = 60n;
const CLICK_MULTIPLIER = 10n;

function computeImpressionSplit(cpmBidMicrocents) {
  const total = cpmBidMicrocents / 1000n;
  const developer = (total * DEVELOPER_SHARE_PERCENT) / 100n;
  const platform = total - developer;
  return { total, developer, platform };
}

function computeClickSplit(cpmBidMicrocents) {
  const impressionValue = cpmBidMicrocents / 1000n;
  const total = impressionValue * CLICK_MULTIPLIER;
  const developer = (total * DEVELOPER_SHARE_PERCENT) / 100n;
  const platform = total - developer;
  return { total, developer, platform };
}

// ---------------------------------------------------------------------------
// 1. syntheticAdvertiser
// ---------------------------------------------------------------------------

const syntheticAdvertiser = {
  id: 'rehearsal-advertiser-001',
  name: 'Rehearsal Synthetic Advertiser',
  email: 'advertiser@example.test',
  cpmBidMicrocents: 5_000_000n, // $5.00 CPM
  budgetMicrocents: 100_000_000n, // $100.00 synthetic budget cap
};

// ---------------------------------------------------------------------------
// 2. syntheticDeveloper -- primary developer for the core event-flow walkthrough
// ---------------------------------------------------------------------------

const syntheticDeveloper = {
  id: 'rehearsal-developer-001',
  payoutEmail: 'developer@example.test',
};

// ---------------------------------------------------------------------------
// 3. syntheticCampaign
// ---------------------------------------------------------------------------

const syntheticCampaign = {
  id: 'rehearsal-campaign-001',
  advertiserId: syntheticAdvertiser.id,
  name: 'Rehearsal Synthetic Campaign',
  cpmBidMicrocents: syntheticAdvertiser.cpmBidMicrocents,
  budgetMicrocents: syntheticAdvertiser.budgetMicrocents,
  targetAdapterNames: ['browser_chatgpt'],
};

// ---------------------------------------------------------------------------
// 4. syntheticPlacement
// ---------------------------------------------------------------------------

const syntheticPlacement = {
  id: 'rehearsal-placement-001',
  campaignId: syntheticCampaign.id,
  adapterName: 'browser_chatgpt',
  surface: 'sponsored_moment_banner',
};

// ---------------------------------------------------------------------------
// 5. syntheticImpressionEvents -- the single valid impression (scenario 1)
// ---------------------------------------------------------------------------

const syntheticImpressionEvents = [
  {
    scenarioId: 'valid-impression',
    eventId: 'rehearsal-evt-imp-001-valid',
    impressionId: 'rehearsal-imp-001',
    campaignId: syntheticCampaign.id,
    advertiserId: syntheticAdvertiser.id,
    developerId: syntheticDeveloper.id,
    cpmBidMicrocents: syntheticCampaign.cpmBidMicrocents,
    displayedDurationMs: 5200, // above IMPRESSION_MIN_THRESHOLD_MS (3000ms), plausible
    expectBilled: true,
  },
];

// ---------------------------------------------------------------------------
// 6. syntheticClickEvents -- the single valid click after a billable impression (scenario 4)
// ---------------------------------------------------------------------------

const syntheticClickEvents = [
  {
    scenarioId: 'valid-click-after-impression',
    eventId: 'rehearsal-evt-click-001-valid',
    clickId: 'rehearsal-click-001',
    impressionId: 'rehearsal-imp-001', // must reference a billable impression above
    campaignId: syntheticCampaign.id,
    advertiserId: syntheticAdvertiser.id,
    developerId: syntheticDeveloper.id,
    cpmBidMicrocents: syntheticCampaign.cpmBidMicrocents,
    expectBilled: true,
  },
];

// ---------------------------------------------------------------------------
// 7. duplicateReplayEvents -- scenarios 2, 3, 6
// ---------------------------------------------------------------------------

const duplicateReplayEvents = {
  duplicateImpression: {
    scenarioId: 'duplicate-impression',
    eventId: 'rehearsal-evt-imp-001-valid', // SAME eventId as the valid impression above
    impressionId: 'rehearsal-imp-001',
    campaignId: syntheticCampaign.id,
    advertiserId: syntheticAdvertiser.id,
    developerId: syntheticDeveloper.id,
    cpmBidMicrocents: syntheticCampaign.cpmBidMicrocents,
    displayedDurationMs: 5200,
    delayMs: 0, // resent immediately, simulating a client-side double-fire
    expectBilled: false,
    expectReason: 'duplicate_event_id',
  },
  replayedImpression: {
    scenarioId: 'replayed-impression',
    eventId: 'rehearsal-evt-imp-001-valid', // SAME eventId, resent after a delay
    impressionId: 'rehearsal-imp-001',
    campaignId: syntheticCampaign.id,
    advertiserId: syntheticAdvertiser.id,
    developerId: syntheticDeveloper.id,
    cpmBidMicrocents: syntheticCampaign.cpmBidMicrocents,
    displayedDurationMs: 5200,
    delayMs: 25, // simulates a retried network request arriving later
    expectBilled: false,
    expectReason: 'duplicate_event_id',
  },
  repeatedClick: {
    scenarioId: 'repeated-click',
    eventId: 'rehearsal-evt-click-001-valid', // SAME eventId as the valid click above
    clickId: 'rehearsal-click-001',
    impressionId: 'rehearsal-imp-001',
    campaignId: syntheticCampaign.id,
    advertiserId: syntheticAdvertiser.id,
    developerId: syntheticDeveloper.id,
    cpmBidMicrocents: syntheticCampaign.cpmBidMicrocents,
    delayMs: 10,
    expectBilled: false,
    expectReason: 'duplicate_event_id',
  },
};

// ---------------------------------------------------------------------------
// 8. fraudReviewEvents -- scenarios 5 and 7
// ---------------------------------------------------------------------------

const fraudReviewEvents = {
  // Scenario 5: click without a prior billable impression -> fraud-blocked.
  clickWithoutImpression: {
    scenarioId: 'click-without-prior-impression',
    eventId: 'rehearsal-evt-click-999-no-impression',
    clickId: 'rehearsal-click-999',
    impressionId: 'rehearsal-imp-999-never-billed', // deliberately never billed
    campaignId: syntheticCampaign.id,
    advertiserId: syntheticAdvertiser.id,
    developerId: syntheticDeveloper.id,
    cpmBidMicrocents: syntheticCampaign.cpmBidMicrocents,
    expectBilled: false,
    expectReason: 'fraud_block',
  },
  // Scenario 7 (part 1): an implausibly SHORT dwell time is a real
  // FraudScorer signal (impossibleDurationSignal with tooLong=false, score
  // 90 >= BLOCK_THRESHOLD 85) -- a genuine "review/fraud" event using the
  // real production scorer, not a synthetic reimplementation of fraud
  // logic. NOTE: the "too long" branch of this same signal only scores 50
  // (< REVIEW_THRESHOLD 60, so it would PASS, not block) -- verified by
  // direct inspection of packages/fraud/src/signals.ts
  // (`score: tooLong ? 50 : 90`); the too-SHORT branch is what actually
  // blocks, so this fixture uses a duration below IMPRESSION_MIN_THRESHOLD_MS
  // (3000ms), not an implausibly long one.
  implausibleDwellTime: {
    scenarioId: 'implausible-dwell-time',
    eventId: 'rehearsal-evt-imp-002-implausible',
    impressionId: 'rehearsal-imp-002-implausible',
    campaignId: syntheticCampaign.id,
    advertiserId: syntheticAdvertiser.id,
    developerId: syntheticDeveloper.id,
    cpmBidMicrocents: syntheticCampaign.cpmBidMicrocents,
    displayedDurationMs: 200, // well below the 3000ms minimum -- triggers block
    expectBilled: false,
    expectReason: 'fraud_block',
  },
  // Scenario 7 (part 2): a batch of mostly-legitimate impressions mixed
  // with a meaningful proportion of fraud-blocked (implausible-duration)
  // impressions for a SEPARATE synthetic developer, producing a "suspicious
  // fraud-ratio" profile once earnings are aggregated for payout
  // classification (feeds into the manual_review-by-fraud-ratio payout
  // scenario, item 10, alongside the plain "held" scenario below).
  fraudRatioDeveloper: {
    developerId: 'rehearsal-developer-fraud-ratio',
    payoutEmail: 'fraud-ratio-developer@example.test',
    campaignId: 'rehearsal-campaign-payout-002',
    advertiserId: 'rehearsal-advertiser-payout-002',
    cpmBidMicrocents: 10_000_000n, // $10.00 CPM, distinct campaign for payout scenarios
    billedImpressionCount: 2000,
    fraudBlockedImpressionCount: 600, // ratio = 600 / 2600 = ~23%
    fraudBlockRatioReviewThreshold: 0.2, // 20% -- must match simulate-payouts.js's policy constant
  },
};

// ---------------------------------------------------------------------------
// Payout-classification scenarios (items 8, 9, 10) -- a distinct small
// campaign/CPM so these numbers are easy to eyeball, and distinct
// synthetic developers so each payout status is unambiguous.
// ---------------------------------------------------------------------------

const PAYOUT_SCENARIO_CPM_MICROCENTS = 10_000_000n; // $10.00 CPM
const PAYOUT_SCENARIO_CAMPAIGN_ID = 'rehearsal-campaign-payout-001';
const PAYOUT_SCENARIO_ADVERTISER_ID = 'rehearsal-advertiser-payout-001';

const MIN_PAYOUT_THRESHOLD_MICROCENTS = 10_000_000n; // $10.00 -- matches simulate-payouts.js policy placeholder
const LARGE_PAYOUT_REVIEW_THRESHOLD_MICROCENTS = 100_000_000n; // $100.00

// Scenario 8: developer below payout threshold.
const payoutDeveloperBelowThreshold = {
  developerId: 'rehearsal-developer-below-threshold',
  payoutEmail: 'below-threshold-developer@example.test',
  campaignId: PAYOUT_SCENARIO_CAMPAIGN_ID,
  advertiserId: PAYOUT_SCENARIO_ADVERTISER_ID,
  cpmBidMicrocents: PAYOUT_SCENARIO_CPM_MICROCENTS,
  billedImpressionCount: 5,
  expectedStatus: 'pending',
};

// Scenario 9: developer payable (above threshold, below large-payout review, has payoutEmail).
const payoutDeveloperPayable = {
  developerId: 'rehearsal-developer-payable',
  payoutEmail: 'payable-developer@example.test',
  campaignId: PAYOUT_SCENARIO_CAMPAIGN_ID,
  advertiserId: PAYOUT_SCENARIO_ADVERTISER_ID,
  cpmBidMicrocents: PAYOUT_SCENARIO_CPM_MICROCENTS,
  billedImpressionCount: 2000, // 2000 * 6000 microcents = 12,000,000 = $12.00 -> payable
  expectedStatus: 'payable',
};

// Scenario 10a: developer held (no payoutEmail on file -- held regardless of amount).
const payoutDeveloperHeld = {
  developerId: 'rehearsal-developer-held',
  payoutEmail: null,
  campaignId: PAYOUT_SCENARIO_CAMPAIGN_ID,
  advertiserId: PAYOUT_SCENARIO_ADVERTISER_ID,
  cpmBidMicrocents: PAYOUT_SCENARIO_CPM_MICROCENTS,
  billedImpressionCount: 500,
  expectedStatus: 'held',
};

// Scenario 10b: developer manual_review (via suspicious fraud-block ratio --
// see fraudReviewEvents.fraudRatioDeveloper above, same developer).
const payoutDeveloperManualReview = {
  developerId: fraudReviewEvents.fraudRatioDeveloper.developerId,
  payoutEmail: fraudReviewEvents.fraudRatioDeveloper.payoutEmail,
  campaignId: fraudReviewEvents.fraudRatioDeveloper.campaignId,
  advertiserId: fraudReviewEvents.fraudRatioDeveloper.advertiserId,
  cpmBidMicrocents: fraudReviewEvents.fraudRatioDeveloper.cpmBidMicrocents,
  billedImpressionCount: fraudReviewEvents.fraudRatioDeveloper.billedImpressionCount,
  fraudBlockedImpressionCount: fraudReviewEvents.fraudRatioDeveloper.fraudBlockedImpressionCount,
  expectedStatus: 'manual_review',
};

// ---------------------------------------------------------------------------
// 9. expectedLedgerEntries -- for the core walkthrough (scenarios 1 + 4 only;
//    every rejected/fraud-blocked scenario must produce ZERO entries, which
//    the rehearsal script asserts separately per-scenario).
// ---------------------------------------------------------------------------

const impressionSplit001 = computeImpressionSplit(syntheticCampaign.cpmBidMicrocents);
const clickSplit001 = computeClickSplit(syntheticCampaign.cpmBidMicrocents);

const expectedLedgerEntries = {
  validImpression: {
    impressionId: 'rehearsal-imp-001',
    entries: [
      { entryType: 'advertiser_charge', referenceType: 'impression', amountMicrocents: impressionSplit001.total },
      { entryType: 'developer_credit', referenceType: 'impression', amountMicrocents: impressionSplit001.developer },
      { entryType: 'platform_fee', referenceType: 'impression', amountMicrocents: impressionSplit001.platform },
    ],
  },
  validClick: {
    clickId: 'rehearsal-click-001',
    entries: [
      { entryType: 'advertiser_charge', referenceType: 'click', amountMicrocents: clickSplit001.total },
      { entryType: 'developer_credit', referenceType: 'click', amountMicrocents: clickSplit001.developer },
      { entryType: 'platform_fee', referenceType: 'click', amountMicrocents: clickSplit001.platform },
    ],
  },
};

// ---------------------------------------------------------------------------
// 10. expectedBillingTotals -- core walkthrough aggregate (1 impression + 1 click billed)
// ---------------------------------------------------------------------------

const expectedBillingTotals = {
  totalAdvertiserCharge: impressionSplit001.total + clickSplit001.total,
  totalDeveloperCredit: impressionSplit001.developer + clickSplit001.developer,
  totalPlatformFee: impressionSplit001.platform + clickSplit001.platform,
  acceptedEventCount: 2, // 1 impression + 1 click
  rejectedDuplicateCount: 3, // duplicateImpression + replayedImpression + repeatedClick
  fraudBlockedCount: 2, // clickWithoutImpression + implausibleDwellTime
};

// ---------------------------------------------------------------------------
// 11. expectedPayoutSimulation -- items 8, 9, 10
// ---------------------------------------------------------------------------

const payoutSplitBelow = computeImpressionSplit(PAYOUT_SCENARIO_CPM_MICROCENTS);
const payoutSplitPayable = computeImpressionSplit(PAYOUT_SCENARIO_CPM_MICROCENTS);
const payoutSplitHeld = computeImpressionSplit(PAYOUT_SCENARIO_CPM_MICROCENTS);
const payoutSplitManualReview = computeImpressionSplit(fraudReviewEvents.fraudRatioDeveloper.cpmBidMicrocents);

const expectedPayoutSimulation = {
  minPayoutThresholdMicrocents: MIN_PAYOUT_THRESHOLD_MICROCENTS,
  largePayoutReviewThresholdMicrocents: LARGE_PAYOUT_REVIEW_THRESHOLD_MICROCENTS,
  fraudBlockRatioReviewThreshold: fraudReviewEvents.fraudRatioDeveloper.fraudBlockRatioReviewThreshold,
  developers: [
    {
      developerId: payoutDeveloperBelowThreshold.developerId,
      expectedStatus: 'pending',
      expectedEarnedMicrocents: payoutSplitBelow.developer * BigInt(payoutDeveloperBelowThreshold.billedImpressionCount),
    },
    {
      developerId: payoutDeveloperPayable.developerId,
      expectedStatus: 'payable',
      expectedEarnedMicrocents: payoutSplitPayable.developer * BigInt(payoutDeveloperPayable.billedImpressionCount),
    },
    {
      developerId: payoutDeveloperHeld.developerId,
      expectedStatus: 'held',
      expectedEarnedMicrocents: payoutSplitHeld.developer * BigInt(payoutDeveloperHeld.billedImpressionCount),
    },
    {
      developerId: payoutDeveloperManualReview.developerId,
      expectedStatus: 'manual_review',
      expectedEarnedMicrocents: payoutSplitManualReview.developer * BigInt(payoutDeveloperManualReview.billedImpressionCount),
    },
  ],
};

// ---------------------------------------------------------------------------
// 12. expectedReconciliationOutcome -- grand total across the ENTIRE
//     rehearsal run (core walkthrough + all payout-scenario developers'
//     billed impressions). Every number here is derived from the same
//     independent pricing formula as the sections above.
// ---------------------------------------------------------------------------

const payoutScenarioAdvertiserChargeTotal =
  payoutSplitBelow.total * BigInt(payoutDeveloperBelowThreshold.billedImpressionCount) +
  payoutSplitPayable.total * BigInt(payoutDeveloperPayable.billedImpressionCount) +
  payoutSplitHeld.total * BigInt(payoutDeveloperHeld.billedImpressionCount) +
  payoutSplitManualReview.total * BigInt(payoutDeveloperManualReview.billedImpressionCount);

const payoutScenarioDeveloperCreditTotal =
  payoutSplitBelow.developer * BigInt(payoutDeveloperBelowThreshold.billedImpressionCount) +
  payoutSplitPayable.developer * BigInt(payoutDeveloperPayable.billedImpressionCount) +
  payoutSplitHeld.developer * BigInt(payoutDeveloperHeld.billedImpressionCount) +
  payoutSplitManualReview.developer * BigInt(payoutDeveloperManualReview.billedImpressionCount);

const payoutScenarioPlatformFeeTotal =
  payoutSplitBelow.platform * BigInt(payoutDeveloperBelowThreshold.billedImpressionCount) +
  payoutSplitPayable.platform * BigInt(payoutDeveloperPayable.billedImpressionCount) +
  payoutSplitHeld.platform * BigInt(payoutDeveloperHeld.billedImpressionCount) +
  payoutSplitManualReview.platform * BigInt(payoutDeveloperManualReview.billedImpressionCount);

const expectedReconciliationOutcome = {
  grandTotalAdvertiserCharge: expectedBillingTotals.totalAdvertiserCharge + payoutScenarioAdvertiserChargeTotal,
  grandTotalDeveloperCredit: expectedBillingTotals.totalDeveloperCredit + payoutScenarioDeveloperCreditTotal,
  grandTotalPlatformFee: expectedBillingTotals.totalPlatformFee + payoutScenarioPlatformFeeTotal,
  invariantHolds: true, // asserted by the rehearsal script, not assumed here
};

module.exports = {
  syntheticAdvertiser,
  syntheticDeveloper,
  syntheticCampaign,
  syntheticPlacement,
  syntheticImpressionEvents,
  syntheticClickEvents,
  duplicateReplayEvents,
  fraudReviewEvents,
  expectedLedgerEntries,
  expectedBillingTotals,
  expectedPayoutSimulation,
  expectedReconciliationOutcome,
  // Additional fixture data needed by the rehearsal script to actually
  // generate the payout-scenario events (not part of the mandatory 12
  // exports, but exported for reuse rather than duplicated inline).
  payoutDeveloperBelowThreshold,
  payoutDeveloperPayable,
  payoutDeveloperHeld,
  payoutDeveloperManualReview,
  computeImpressionSplit,
  computeClickSplit,
};
