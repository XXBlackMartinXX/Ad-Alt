'use strict';
/**
 * Payout Simulation — synthetic-data-only projection of what developer
 * payouts would look like, given the REAL `@ad-alt/ledger` split math.
 *
 * THIS SCRIPT DOES NOT MOVE MONEY. There is no payment-processor
 * integration anywhere in this repository (confirmed in
 * docs/internal-beta/monetization/MONETIZATION_SOURCE_AUDIT.md, Q18): the
 * `payouts`/`payout_batches` tables exist in the schema but no route,
 * service, or script ever writes to them or calls Stripe/PayPal/a bank
 * API. This script simulates what a payout BATCH would compute, entirely
 * in memory, using synthetic developers, advertisers, and events.
 *
 * Usage:
 *   node scripts/simulate-payouts.js
 *   pnpm -w run simulate:payouts
 */

const fs = require('fs');
const path = require('path');
const { importFile } = require('./lib/import-file.js');
const { writeReportIfChanged } = require('./lib/report-writer.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(
  REPO_ROOT,
  'docs/internal-beta/monetization/PAYOUT_SIMULATION_REPORT.md',
);

// Simulation-only policy values. These are NOT shipped application
// constants (no such constant exists in packages/shared -- confirmed by
// source review) -- they are placeholder business-policy inputs for this
// simulation pending an explicit real payout-policy decision.
const MIN_PAYOUT_THRESHOLD_MICROCENTS = 10_000_000n; // $10.00
const LARGE_PAYOUT_REVIEW_THRESHOLD_MICROCENTS = 100_000_000n; // $100.00
const HIGH_FRAUD_BLOCK_RATIO_REVIEW_THRESHOLD = 0.2; // 20%

function fmtUsd(microcents) {
  const neg = microcents < 0n;
  const abs = neg ? -microcents : microcents;
  const cents = abs / 10_000n;
  const dollars = cents / 100n;
  const remCents = cents % 100n;
  return `${neg ? '-' : ''}$${dollars}.${remCents.toString().padStart(2, '0')}`;
}

async function main() {
  console.log('[>>] Payout Simulation (synthetic data only, no real money movement)');
  console.log('------------------------------------------------------------');
  console.log('');
  console.log('No payment processor is called. No real developer or advertiser');
  console.log('accounts are used. All IDs and amounts below are synthetic fixtures.');
  console.log('');

  const ledgerMod = await importFile(path.join(REPO_ROOT, 'packages/ledger/dist/index.js'));
  const calculator = new ledgerMod.LedgerCalculator();

  // ---------------------------------------------------------------------
  // Synthetic fixtures
  // ---------------------------------------------------------------------

  const advertisers = [
    { id: 'synthetic-advertiser-alpha', cpmBidMicrocents: 50_000_000n },
    { id: 'synthetic-advertiser-beta', cpmBidMicrocents: 100_000_000n },
  ];

  // Each synthetic developer gets a fixed number of impressions/clicks so
  // the resulting earned totals land intentionally above/below the payout
  // threshold and the review thresholds, to exercise every code path
  // (payable, pending, held, manual_review-large, manual_review-fraud-ratio).
  const developers = [
    { id: 'synthetic-developer-01', payoutEmail: 'dev01@example.test', impressions: 300, clicks: 15, advertiser: 0 }, // $13.50 -> payable
    { id: 'synthetic-developer-02', payoutEmail: 'dev02@example.test', impressions: 5, clicks: 0, advertiser: 0 }, // $0.15 -> pending
    { id: 'synthetic-developer-03', payoutEmail: null, impressions: 100, clicks: 5, advertiser: 1 }, // $9.00, no payoutEmail -> held
    { id: 'synthetic-developer-04', payoutEmail: 'dev04@example.test', impressions: 1000, clicks: 100, advertiser: 1 }, // $120.00 -> manual review (large)
    { id: 'synthetic-developer-05', payoutEmail: 'dev05@example.test', impressions: 200, clicks: 30, advertiser: 0, fraudBlockedImpressions: 60 }, // $15.00, 23% fraud-blocked -> manual review (fraud ratio)
  ];

  const rows = [];

  for (const dev of developers) {
    const adv = advertisers[dev.advertiser];
    let grossCharged = 0n;
    let developerEarned = 0n;
    let platformRetained = 0n;
    let billedImpressions = 0;
    let billedClicks = 0;
    const fraudBlocked = dev.fraudBlockedImpressions ?? 0;

    for (let i = 0; i < dev.impressions; i++) {
      const result = calculator.calculateImpressionEntries({
        impressionId: `${dev.id}-imp-${i}`,
        advertiserId: adv.id,
        developerId: dev.id,
        cpmBidMicrocents: adv.cpmBidMicrocents,
      });
      if (!calculator.verifyBalance(result)) {
        throw new Error(`unbalanced synthetic impression for ${dev.id}`);
      }
      grossCharged += result.advertiserCharge.amountMicrocents;
      developerEarned += result.developerCredit.amountMicrocents;
      platformRetained += result.platformFee.amountMicrocents;
      billedImpressions++;
    }

    for (let i = 0; i < dev.clicks; i++) {
      const result = calculator.calculateClickEntries({
        clickId: `${dev.id}-click-${i}`,
        advertiserId: adv.id,
        developerId: dev.id,
        cpmBidMicrocents: adv.cpmBidMicrocents,
      });
      if (!calculator.verifyBalance(result)) {
        throw new Error(`unbalanced synthetic click for ${dev.id}`);
      }
      grossCharged += result.advertiserCharge.amountMicrocents;
      developerEarned += result.developerCredit.amountMicrocents;
      platformRetained += result.platformFee.amountMicrocents;
      billedClicks++;
    }

    const totalAttempts = billedImpressions + fraudBlocked;
    const fraudBlockRatio = totalAttempts > 0 ? fraudBlocked / totalAttempts : 0;

    let status;
    let reason;
    if (!dev.payoutEmail) {
      status = 'held';
      reason = 'no payoutEmail on file (developerProfiles.payoutEmail is null)';
    } else if (developerEarned < MIN_PAYOUT_THRESHOLD_MICROCENTS) {
      status = 'pending';
      reason = `below minimum payout threshold (${fmtUsd(MIN_PAYOUT_THRESHOLD_MICROCENTS)})`;
    } else if (developerEarned >= LARGE_PAYOUT_REVIEW_THRESHOLD_MICROCENTS) {
      status = 'manual_review';
      reason = `payout amount >= large-payout review threshold (${fmtUsd(LARGE_PAYOUT_REVIEW_THRESHOLD_MICROCENTS)})`;
    } else if (fraudBlockRatio >= HIGH_FRAUD_BLOCK_RATIO_REVIEW_THRESHOLD) {
      status = 'manual_review';
      reason = `fraud-block ratio ${(fraudBlockRatio * 100).toFixed(0)}% >= review threshold (${HIGH_FRAUD_BLOCK_RATIO_REVIEW_THRESHOLD * 100}%)`;
    } else {
      status = 'payable';
      reason = 'meets minimum threshold, below review thresholds, payoutEmail present';
    }

    rows.push({
      developerId: dev.id,
      payoutEmail: dev.payoutEmail,
      billedImpressions,
      billedClicks,
      fraudBlocked,
      grossCharged,
      developerEarned,
      platformRetained,
      status,
      reason,
    });
  }

  // ---------------------------------------------------------------------
  // Totals
  // ---------------------------------------------------------------------

  const totals = rows.reduce(
    (acc, r) => {
      acc.grossCharged += r.grossCharged;
      acc.developerEarned += r.developerEarned;
      acc.platformRetained += r.platformRetained;
      if (r.status === 'payable') acc.payable += r.developerEarned;
      if (r.status === 'pending') acc.pending += r.developerEarned;
      if (r.status === 'held') acc.held += r.developerEarned;
      if (r.status === 'manual_review') acc.manualReview += r.developerEarned;
      return acc;
    },
    { grossCharged: 0n, developerEarned: 0n, platformRetained: 0n, payable: 0n, pending: 0n, held: 0n, manualReview: 0n },
  );

  const invariantOk = totals.developerEarned + totals.platformRetained === totals.grossCharged;

  // ---------------------------------------------------------------------
  // Console output
  // ---------------------------------------------------------------------

  console.log('== Per-developer simulated payout batch ==');
  for (const r of rows) {
    console.log(
      `  ${r.developerId.padEnd(28)} earned=${fmtUsd(r.developerEarned).padStart(10)} status=${r.status.padEnd(14)} (${r.reason})`,
    );
  }
  console.log('');
  console.log('== Batch totals ==');
  console.log(`  Gross advertiser charged: ${fmtUsd(totals.grossCharged)}`);
  console.log(`  Developer earned (total): ${fmtUsd(totals.developerEarned)}`);
  console.log(`  Platform retained:        ${fmtUsd(totals.platformRetained)}`);
  console.log(`  Payable this batch:       ${fmtUsd(totals.payable)}`);
  console.log(`  Pending (below min):      ${fmtUsd(totals.pending)}`);
  console.log(`  Held (missing payout info): ${fmtUsd(totals.held)}`);
  console.log(`  Manual review required:   ${fmtUsd(totals.manualReview)}`);
  console.log('');
  console.log(`  Invariant (earned + retained == charged): ${invariantOk ? 'PASS' : 'FAIL'}`);
  console.log('');
  console.log('No payout was sent. No payment processor was called. No real funds moved.');

  writeReport(rows, totals, invariantOk);

  process.exit(invariantOk ? 0 : 1);
}

function writeReport(rows, totals, invariantOk) {
  const now = new Date().toISOString();
  const lines = [];
  lines.push('# PromptProfit -- Payout Simulation Report');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Generator:** scripts/simulate-payouts.js`);
  lines.push(`**Invariant (developer earned + platform retained == advertiser charged):** ${invariantOk ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('> **This is a SIMULATION. No real money moves.** No payment processor');
  lines.push('> (Stripe, PayPal, bank transfer, or otherwise) is called anywhere in this');
  lines.push('> script or in the application code it models. Confirmed by source review');
  lines.push('> (`docs/internal-beta/monetization/MONETIZATION_SOURCE_AUDIT.md`, Q18):');
  lines.push('> the `payouts`/`payout_batches` database tables exist in the schema, but');
  lines.push('> no route, service, or script in `apps/api/src` ever writes to them or');
  lines.push('> calls a payment processor. All developer/advertiser IDs below are');
  lines.push('> synthetic fixtures defined in this script, not real accounts.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Simulation policy inputs (placeholders, not shipped constants)');
  lines.push('');
  lines.push('No minimum-payout-threshold or manual-review-threshold constant exists');
  lines.push('anywhere in `packages/shared` or the application code -- these are');
  lines.push('simulation-only placeholder values pending a real business-policy decision:');
  lines.push('');
  lines.push(`- Minimum payout threshold: ${fmtUsd(MIN_PAYOUT_THRESHOLD_MICROCENTS)}`);
  lines.push(`- Large-payout manual-review threshold: ${fmtUsd(LARGE_PAYOUT_REVIEW_THRESHOLD_MICROCENTS)}`);
  lines.push(`- Fraud-block-ratio manual-review threshold: ${HIGH_FRAUD_BLOCK_RATIO_REVIEW_THRESHOLD * 100}%`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Synthetic developers');
  lines.push('');
  lines.push('| Developer (synthetic) | Impressions | Clicks | Fraud-blocked | Gross charged | Developer earned | Platform retained | Status | Reason |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(
      `| ${r.developerId} | ${r.billedImpressions} | ${r.billedClicks} | ${r.fraudBlocked} | ${fmtUsd(r.grossCharged)} | ${fmtUsd(r.developerEarned)} | ${fmtUsd(r.platformRetained)} | ${r.status} | ${r.reason} |`,
    );
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Batch totals');
  lines.push('');
  lines.push('| Field | Amount |');
  lines.push('|-------|--------|');
  lines.push(`| Gross advertiser charged | ${fmtUsd(totals.grossCharged)} |`);
  lines.push(`| Developer earned (total) | ${fmtUsd(totals.developerEarned)} |`);
  lines.push(`| Platform retained | ${fmtUsd(totals.platformRetained)} |`);
  lines.push(`| Payable this batch | ${fmtUsd(totals.payable)} |`);
  lines.push(`| Pending (below minimum threshold) | ${fmtUsd(totals.pending)} |`);
  lines.push(`| Held (missing payout info) | ${fmtUsd(totals.held)} |`);
  lines.push(`| Manual review required | ${fmtUsd(totals.manualReview)} |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Refund / adjustment placeholder');
  lines.push('');
  lines.push('Refunds and voids are **not implemented** anywhere in the application code');
  lines.push('(`refund_debit`/`refund_credit` ledger entry types exist only in the type');
  lines.push('enum -- see `MONETIZATION_SOURCE_AUDIT.md` Q17). This simulation therefore');
  lines.push('applies zero refunds/adjustments to every developer. If a real pilot needs');
  lines.push('to adjust a developer\'s payable amount downward (e.g. a post-hoc fraud');
  lines.push('finding), that requires new application code, not just a simulation change.');
  lines.push('');
  lines.push('| Developer | Adjustment | Reason |');
  lines.push('|-----------|-----------|--------|');
  for (const r of rows) {
    lines.push(`| ${r.developerId} | $0.00 | refund/void not implemented in application code |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Next steps to a real payout provider integration');
  lines.push('');
  lines.push('1. Choose and integrate a real payout provider (e.g. Stripe Connect) --');
  lines.push('   none is integrated today; `advertiserProfiles.stripeCustomerId` and');
  lines.push('   `payouts.stripeTransferId` are schema placeholders only.');
  lines.push('2. Implement a real batch-payout service that writes to `payout_batches`');
  lines.push('   and `payouts`, and updates `developerProfiles.totalPaidOutMicrocents`');
  lines.push('   (today nothing ever writes to either).');
  lines.push('3. Decide and codify the minimum-payout and manual-review thresholds used');
  lines.push('   above as real, reviewed business policy (not simulation placeholders).');
  lines.push('4. Implement refund/void ledger entries before enabling any adjustment flow.');
  lines.push('5. Add staging reconciliation for payouts per');
  lines.push('   `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md` section 5 (Payout Integrity).');
  lines.push('6. Only after 1-5: pilot with a small number of real developers under a');
  lines.push('   explicit, sign-off-gated real-money policy.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('**Privacy warning: Do not add real developer emails, real payout details,');
  lines.push('real API keys, or real financial account data to this report or to this');
  lines.push('script\'s synthetic fixtures.**');
  lines.push('');

  const result = writeReportIfChanged(REPORT_PATH, lines.join('\n'));
  console.log('');
  console.log(
    `Report ${result.written ? 'written' : 'unchanged'}: ${path.relative(REPO_ROOT, REPORT_PATH)} (${result.reason})`,
  );
}

main().catch((err) => {
  console.error('[ERR]', err && err.stack ? err.stack : err);
  process.exit(1);
});
