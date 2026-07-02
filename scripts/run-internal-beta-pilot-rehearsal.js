'use strict';
/**
 * Internal Beta Pilot Rehearsal — runs the full deterministic synthetic
 * pilot scenario (advertiser, developer, campaign, placement, impressions,
 * clicks, duplicate/replay attempts, fraud scenarios, ledger verification,
 * reconciliation, and payout-status classification) end to end, using the
 * REAL, built `@ad-alt/ledger` and `@ad-alt/fraud` production packages
 * (not a reimplementation of the money math or fraud scoring), driven
 * through a synthetic in-memory engine because the real DB-coupled
 * services (`apps/api/src/services/ledger.service.ts`,
 * `event-processor.ts`) require a live Postgres/Redis connection that a
 * plain `node` script cannot provide (same reasoning documented in
 * scripts/check-ledger-confidence.js).
 *
 * THIS IS A REHEARSAL, NOT A REAL PILOT. No real money, no real
 * advertiser, no real developer, no real payout, no payment processor,
 * no ChatGPT session. See
 * docs/internal-beta/monetization/PILOT_REHEARSAL_PLAN.md.
 *
 * Usage:
 *   node scripts/run-internal-beta-pilot-rehearsal.js
 *   pnpm -w run pilot:rehearsal
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { importFile } = require('./lib/import-file.js');
const fixtures = require('./fixtures/internal-beta-pilot-fixtures.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(
  REPO_ROOT,
  'docs/internal-beta/monetization/PILOT_REHEARSAL_REPORT.md',
);

let passed = 0;
let failed = 0;
const findings = []; // { severity: 'critical'|'normal', name, ok, detail }

function record(name, ok, detail, severity) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
  findings.push({ name, ok, detail: detail || '', severity: severity || 'normal' });
}

function bi(v) {
  return typeof v === 'bigint' ? v.toString() : String(v);
}

function fmtUsd(microcents) {
  const neg = microcents < 0n;
  const abs = neg ? -microcents : microcents;
  const cents = abs / 10_000n;
  const dollars = cents / 100n;
  const remCents = cents % 100n;
  return `${neg ? '-' : ''}$${dollars}.${remCents.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Fixture schema validation
// ---------------------------------------------------------------------------

function validateFixtureSchema() {
  const requiredExports = [
    'syntheticAdvertiser', 'syntheticDeveloper', 'syntheticCampaign', 'syntheticPlacement',
    'syntheticImpressionEvents', 'syntheticClickEvents', 'duplicateReplayEvents',
    'fraudReviewEvents', 'expectedLedgerEntries', 'expectedBillingTotals',
    'expectedPayoutSimulation', 'expectedReconciliationOutcome',
  ];
  const missing = requiredExports.filter((k) => fixtures[k] === undefined);
  record(
    `Fixture module exports all ${requiredExports.length} required scenario objects`,
    missing.length === 0,
    missing.length ? `missing: ${JSON.stringify(missing)}` : '',
    'critical',
  );

  const idsLookDeterministic =
    fixtures.syntheticAdvertiser.id.startsWith('rehearsal-') &&
    fixtures.syntheticDeveloper.id.startsWith('rehearsal-') &&
    fixtures.syntheticCampaign.id.startsWith('rehearsal-') &&
    fixtures.syntheticPlacement.id.startsWith('rehearsal-');
  record('Core fixture IDs are deterministic (rehearsal- prefixed, not random)', idsLookDeterministic);

  const emailsAreSynthetic =
    fixtures.syntheticAdvertiser.email.endsWith('@example.test') &&
    fixtures.syntheticDeveloper.payoutEmail.endsWith('@example.test');
  record(
    'Synthetic emails use the reserved example.test domain, not a real domain',
    emailsAreSynthetic,
    '',
    'critical',
  );
}

// ---------------------------------------------------------------------------
// Synthetic pilot engine -- mirrors LedgerService/EventProcessor
// invariants using in-memory state, driven by the REAL LedgerCalculator
// and FraudScorer. Self-contained in this file (not imported from
// check-ledger-confidence.js) so this rehearsal does not modify or depend
// on that already-verified script's internals.
// ---------------------------------------------------------------------------

class SyntheticPilotEngine {
  constructor(calculator, fraudScorer) {
    this.calculator = calculator;
    this.fraudScorer = fraudScorer;
    this.seenEventIds = new Set();
    this.balances = new Map();
    this.ledgerEntries = [];
    this.impressions = new Map(); // impressionId -> { status }
  }

  applyDelta(accountId, deltaMicrocents) {
    const prev = this.balances.get(accountId) ?? 0n;
    const next = prev + deltaMicrocents;
    this.balances.set(accountId, next);
    return next;
  }

  checkDedup(eventId) {
    if (this.seenEventIds.has(eventId)) return { duplicate: true };
    this.seenEventIds.add(eventId);
    return { duplicate: false };
  }

  recordImpression(evt) {
    const dedup = this.checkDedup(evt.eventId);
    if (dedup.duplicate) return { billed: false, reason: 'duplicate_event_id' };

    if (evt.displayedDurationMs !== undefined) {
      const fraudResult = this.fraudScorer.scoreViewability({
        deviceId: 'synthetic-device',
        sessionId: 'synthetic-session',
        impressionsInLastHour: 0,
        deviceIsBlocked: false,
        deviceFraudScore: 0,
        sequenceNumber: 1,
        displayedDurationMs: evt.displayedDurationMs,
      });
      if (fraudResult.decision === 'block') {
        return { billed: false, reason: 'fraud_block', fraudResult };
      }
    }

    const result = this.calculator.calculateImpressionEntries({
      impressionId: evt.impressionId,
      advertiserId: evt.advertiserId,
      developerId: evt.developerId,
      cpmBidMicrocents: evt.cpmBidMicrocents,
    });
    if (!this.calculator.verifyBalance(result)) {
      throw new Error(`ledger balance verification failed for ${evt.impressionId}`);
    }

    this.applyDelta(result.advertiserCharge.account.id, -result.advertiserCharge.amountMicrocents);
    this.applyDelta(result.developerCredit.account.id, result.developerCredit.amountMicrocents);
    this.applyDelta(result.platformFee.account.id, result.platformFee.amountMicrocents);
    this.ledgerEntries.push(result.advertiserCharge, result.developerCredit, result.platformFee);
    this.impressions.set(evt.impressionId, { status: 'billable' });

    return { billed: true, result };
  }

  recordClick(evt) {
    const dedup = this.checkDedup(evt.eventId);
    if (dedup.duplicate) return { billed: false, reason: 'duplicate_event_id' };

    const impression = this.impressions.get(evt.impressionId);
    const hasValidPriorImpression = impression?.status === 'billable' || impression?.status === 'reconciled';

    const fraudResult = this.fraudScorer.scoreClick({
      deviceId: 'synthetic-device',
      sessionId: 'synthetic-session',
      impressionsInLastHour: 0,
      deviceIsBlocked: false,
      deviceFraudScore: 0,
      sequenceNumber: 1,
      hasValidPriorImpression,
    });
    if (fraudResult.decision !== 'pass') {
      return { billed: false, reason: `fraud_${fraudResult.decision}`, fraudResult };
    }

    const result = this.calculator.calculateClickEntries({
      clickId: evt.clickId,
      advertiserId: evt.advertiserId,
      developerId: evt.developerId,
      cpmBidMicrocents: evt.cpmBidMicrocents,
    });
    if (!this.calculator.verifyBalance(result)) {
      throw new Error(`click ledger balance verification failed for ${evt.clickId}`);
    }

    this.applyDelta(result.advertiserCharge.account.id, -result.advertiserCharge.amountMicrocents);
    this.applyDelta(result.developerCredit.account.id, result.developerCredit.amountMicrocents);
    this.applyDelta(result.platformFee.account.id, result.platformFee.amountMicrocents);
    this.ledgerEntries.push(result.advertiserCharge, result.developerCredit, result.platformFee);

    return { billed: true, result, fraudResult };
  }
}

// ---------------------------------------------------------------------------
// Payout status classification -- mirrors simulate-payouts.js's policy
// (same threshold values, sourced from the fixture module so both scripts
// draw from a single definition of "policy placeholder").
// ---------------------------------------------------------------------------

function classifyPayoutStatus({ payoutEmail, earnedMicrocents, fraudBlockedCount, billedCount }, policy) {
  const totalAttempts = billedCount + (fraudBlockedCount || 0);
  const fraudBlockRatio = totalAttempts > 0 ? (fraudBlockedCount || 0) / totalAttempts : 0;

  if (!payoutEmail) return 'held';
  if (earnedMicrocents < policy.minPayoutThresholdMicrocents) return 'pending';
  if (earnedMicrocents >= policy.largePayoutReviewThresholdMicrocents) return 'manual_review';
  if (fraudBlockRatio >= policy.fraudBlockRatioReviewThreshold) return 'manual_review';
  return 'payable';
}

// ---------------------------------------------------------------------------
// Git metadata (best-effort; never fatal)
// ---------------------------------------------------------------------------

function getGitInfo() {
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return {
    commit: commit.status === 0 ? commit.stdout.trim() : 'not available',
    branch: branch.status === 0 ? branch.stdout.trim() : 'not available',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[>>] Internal Beta Pilot Rehearsal (synthetic data only, no real money)');
  console.log('------------------------------------------------------------');
  console.log('');

  validateFixtureSchema();

  const ledgerMod = await importFile(path.join(REPO_ROOT, 'packages/ledger/dist/index.js'));
  const fraudMod = await importFile(path.join(REPO_ROOT, 'packages/fraud/dist/index.js'));
  const platformCoreMod = await importFile(path.join(REPO_ROOT, 'packages/platform-core/dist/index.js'));

  const calculator = new ledgerMod.LedgerCalculator();
  const fraudScorer = new fraudMod.FraudScorer();
  const { findForbiddenFields } = platformCoreMod;

  const engine = new SyntheticPilotEngine(calculator, fraudScorer);

  // -----------------------------------------------------------------------
  // Core event-flow walkthrough (scenarios 1-7)
  // -----------------------------------------------------------------------

  console.log('== Core event-flow walkthrough ==');

  const validImpressionEvt = fixtures.syntheticImpressionEvents[0];
  const r1 = engine.recordImpression(validImpressionEvt);
  record('Scenario 1 (valid impression) is billed', r1.billed === true, '', 'critical');
  if (r1.billed) {
    const expected = fixtures.expectedLedgerEntries.validImpression;
    record(
      `Scenario 1 advertiser_charge amount matches expected (${bi(expected.entries[0].amountMicrocents)})`,
      r1.result.advertiserCharge.amountMicrocents === expected.entries[0].amountMicrocents,
      `actual=${bi(r1.result.advertiserCharge.amountMicrocents)}`,
      'critical',
    );
    record(
      `Scenario 1 developer_credit amount matches expected (${bi(expected.entries[1].amountMicrocents)})`,
      r1.result.developerCredit.amountMicrocents === expected.entries[1].amountMicrocents,
      '',
      'critical',
    );
    record(
      `Scenario 1 platform_fee amount matches expected (${bi(expected.entries[2].amountMicrocents)})`,
      r1.result.platformFee.amountMicrocents === expected.entries[2].amountMicrocents,
      '',
      'critical',
    );
  }

  const entriesBeforeDup = engine.ledgerEntries.length;
  const r2 = engine.recordImpression(fixtures.duplicateReplayEvents.duplicateImpression);
  record(
    'Scenario 2 (duplicate impression) is rejected, zero new ledger entries',
    r2.billed === false && r2.reason === 'duplicate_event_id' && engine.ledgerEntries.length === entriesBeforeDup,
    '',
    'critical',
  );

  await new Promise((resolve) => setTimeout(resolve, fixtures.duplicateReplayEvents.replayedImpression.delayMs));
  const entriesBeforeReplay = engine.ledgerEntries.length;
  const r3 = engine.recordImpression(fixtures.duplicateReplayEvents.replayedImpression);
  record(
    'Scenario 3 (delayed replay of the same impression) is rejected, zero new ledger entries',
    r3.billed === false && r3.reason === 'duplicate_event_id' && engine.ledgerEntries.length === entriesBeforeReplay,
    '',
    'critical',
  );

  const validClickEvt = fixtures.syntheticClickEvents[0];
  const r4 = engine.recordClick(validClickEvt);
  record('Scenario 4 (valid click after a billable impression) is billed', r4.billed === true, '', 'critical');
  if (r4.billed) {
    const expected = fixtures.expectedLedgerEntries.validClick;
    record(
      `Scenario 4 advertiser_charge amount matches expected (${bi(expected.entries[0].amountMicrocents)})`,
      r4.result.advertiserCharge.amountMicrocents === expected.entries[0].amountMicrocents,
      '',
      'critical',
    );
  }

  const r5 = engine.recordClick(fixtures.fraudReviewEvents.clickWithoutImpression);
  record(
    'Scenario 5 (click without prior billable impression) is fraud-blocked, not billed',
    r5.billed === false && r5.reason === 'fraud_block',
    `reason=${r5.reason}`,
    'critical',
  );

  await new Promise((resolve) => setTimeout(resolve, fixtures.duplicateReplayEvents.repeatedClick.delayMs));
  const entriesBeforeRepeatClick = engine.ledgerEntries.length;
  const r6 = engine.recordClick(fixtures.duplicateReplayEvents.repeatedClick);
  record(
    'Scenario 6 (repeated click, same eventId) is rejected, zero new ledger entries',
    r6.billed === false && r6.reason === 'duplicate_event_id' && engine.ledgerEntries.length === entriesBeforeRepeatClick,
    '',
    'critical',
  );

  const r7 = engine.recordImpression(fixtures.fraudReviewEvents.implausibleDwellTime);
  record(
    'Scenario 7 (implausibly short dwell time) is fraud-blocked, not billed',
    r7.billed === false && r7.reason === 'fraud_block',
    `reason=${r7.reason}`,
    'critical',
  );

  console.log('');
  console.log('== Core walkthrough aggregate checks ==');

  const coreAdvertiserCharge = engine.ledgerEntries
    .filter((e) => e.entryType === 'advertiser_charge')
    .reduce((s, e) => s + e.amountMicrocents, 0n);
  const coreDeveloperCredit = engine.ledgerEntries
    .filter((e) => e.entryType === 'developer_credit')
    .reduce((s, e) => s + e.amountMicrocents, 0n);
  const corePlatformFee = engine.ledgerEntries
    .filter((e) => e.entryType === 'platform_fee')
    .reduce((s, e) => s + e.amountMicrocents, 0n);

  record(
    'Core billing totals match expected (advertiser_charge)',
    coreAdvertiserCharge === fixtures.expectedBillingTotals.totalAdvertiserCharge,
    `actual=${bi(coreAdvertiserCharge)} expected=${bi(fixtures.expectedBillingTotals.totalAdvertiserCharge)}`,
    'critical',
  );
  record(
    'Core billing totals match expected (developer_credit)',
    coreDeveloperCredit === fixtures.expectedBillingTotals.totalDeveloperCredit,
    '',
    'critical',
  );
  record(
    'Core billing totals match expected (platform_fee)',
    corePlatformFee === fixtures.expectedBillingTotals.totalPlatformFee,
    '',
    'critical',
  );
  record(
    'Split invariant exact for core walkthrough: advertiser_charge === developer_credit + platform_fee',
    coreAdvertiserCharge === coreDeveloperCredit + corePlatformFee,
    '',
    'critical',
  );
  record(
    `Accepted event count matches expected (${fixtures.expectedBillingTotals.acceptedEventCount})`,
    engine.ledgerEntries.length === fixtures.expectedBillingTotals.acceptedEventCount * 3,
    `actual ledger entries=${engine.ledgerEntries.length}, expected=${fixtures.expectedBillingTotals.acceptedEventCount * 3}`,
    'critical',
  );
  record(
    'No double billing: total ledger entries === accepted events x 3, exactly (event idempotency holds)',
    engine.ledgerEntries.length === 6,
    `actual=${engine.ledgerEntries.length}`,
    'critical',
  );

  // -----------------------------------------------------------------------
  // Payout-scenario developers (scenarios 8, 9, 10)
  // -----------------------------------------------------------------------

  console.log('');
  console.log('== Payout-scenario developers (items 8, 9, 10) ==');

  const payoutPolicy = {
    minPayoutThresholdMicrocents: fixtures.expectedPayoutSimulation.minPayoutThresholdMicrocents,
    largePayoutReviewThresholdMicrocents: fixtures.expectedPayoutSimulation.largePayoutReviewThresholdMicrocents,
    fraudBlockRatioReviewThreshold: fixtures.expectedPayoutSimulation.fraudBlockRatioReviewThreshold,
  };

  const payoutDevs = [
    fixtures.payoutDeveloperBelowThreshold,
    fixtures.payoutDeveloperPayable,
    fixtures.payoutDeveloperHeld,
    fixtures.payoutDeveloperManualReview,
  ];

  const payoutResults = [];
  for (const dev of payoutDevs) {
    let earned = 0n;
    for (let i = 0; i < dev.billedImpressionCount; i++) {
      const res = engine.recordImpression({
        eventId: `${dev.developerId}-evt-${i}`,
        impressionId: `${dev.developerId}-imp-${i}`,
        advertiserId: dev.advertiserId,
        developerId: dev.developerId,
        cpmBidMicrocents: dev.cpmBidMicrocents,
        displayedDurationMs: 5200,
      });
      if (res.billed) earned += res.result.developerCredit.amountMicrocents;
    }
    let fraudBlocked = 0;
    if (dev.fraudBlockedImpressionCount) {
      for (let i = 0; i < dev.fraudBlockedImpressionCount; i++) {
        const res = engine.recordImpression({
          eventId: `${dev.developerId}-evt-fraud-${i}`,
          impressionId: `${dev.developerId}-imp-fraud-${i}`,
          advertiserId: dev.advertiserId,
          developerId: dev.developerId,
          cpmBidMicrocents: dev.cpmBidMicrocents,
          displayedDurationMs: 200, // triggers block, verified above
        });
        if (!res.billed && res.reason === 'fraud_block') fraudBlocked++;
      }
    }

    const status = classifyPayoutStatus(
      {
        payoutEmail: dev.payoutEmail,
        earnedMicrocents: earned,
        fraudBlockedCount: fraudBlocked,
        billedCount: dev.billedImpressionCount,
      },
      payoutPolicy,
    );

    const expected = fixtures.expectedPayoutSimulation.developers.find((d) => d.developerId === dev.developerId);
    record(
      `${dev.developerId}: earned ${fmtUsd(earned)}, classified "${status}" matches expected "${expected.expectedStatus}"`,
      status === expected.expectedStatus && earned === expected.expectedEarnedMicrocents,
      `earned actual=${bi(earned)} expected=${bi(expected.expectedEarnedMicrocents)}; status actual=${status} expected=${expected.expectedStatus}`,
    );

    payoutResults.push({ developerId: dev.developerId, earned, status, fraudBlocked, billedCount: dev.billedImpressionCount });
  }

  // -----------------------------------------------------------------------
  // Reconciliation (grand total across the entire rehearsal run)
  // -----------------------------------------------------------------------

  console.log('');
  console.log('== Reconciliation (grand total across entire rehearsal run) ==');

  const grandAdvertiserCharge = engine.ledgerEntries
    .filter((e) => e.entryType === 'advertiser_charge')
    .reduce((s, e) => s + e.amountMicrocents, 0n);
  const grandDeveloperCredit = engine.ledgerEntries
    .filter((e) => e.entryType === 'developer_credit')
    .reduce((s, e) => s + e.amountMicrocents, 0n);
  const grandPlatformFee = engine.ledgerEntries
    .filter((e) => e.entryType === 'platform_fee')
    .reduce((s, e) => s + e.amountMicrocents, 0n);

  record(
    'Grand total advertiser_charge matches expected reconciliation outcome',
    grandAdvertiserCharge === fixtures.expectedReconciliationOutcome.grandTotalAdvertiserCharge,
    `actual=${bi(grandAdvertiserCharge)} expected=${bi(fixtures.expectedReconciliationOutcome.grandTotalAdvertiserCharge)}`,
    'critical',
  );
  record(
    'Grand total developer_credit matches expected reconciliation outcome',
    grandDeveloperCredit === fixtures.expectedReconciliationOutcome.grandTotalDeveloperCredit,
    '',
    'critical',
  );
  record(
    'Grand total platform_fee matches expected reconciliation outcome',
    grandPlatformFee === fixtures.expectedReconciliationOutcome.grandTotalPlatformFee,
    '',
    'critical',
  );
  const reconciliationInvariantHolds = grandAdvertiserCharge === grandDeveloperCredit + grandPlatformFee;
  record(
    'Reconciliation invariant holds across the entire rehearsal run (advertiser_charge === developer_credit + platform_fee)',
    reconciliationInvariantHolds,
    '',
    'critical',
  );

  // -----------------------------------------------------------------------
  // Privacy verification
  // -----------------------------------------------------------------------

  console.log('');
  console.log('== Privacy verification ==');

  let forbiddenFieldHits = [];
  for (const entry of engine.ledgerEntries) {
    const found = findForbiddenFields(entry);
    if (found.length > 0) forbiddenFieldHits = forbiddenFieldHits.concat(found);
  }
  record(
    `No forbidden private fields in any of ${engine.ledgerEntries.length} ledger entries`,
    forbiddenFieldHits.length === 0,
    `hits=${JSON.stringify(forbiddenFieldHits)}`,
    'critical',
  );

  const KEY_RE = /ppft_[0-9a-f]{48,}/i;
  const fixtureSource = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/fixtures/internal-beta-pilot-fixtures.js'),
    'utf8',
  );
  record('No ppft_ API key pattern found in the fixture source file', !KEY_RE.test(fixtureSource), '', 'critical');

  // -----------------------------------------------------------------------
  // Decision
  // -----------------------------------------------------------------------

  const criticalFailures = findings.filter((f) => !f.ok && f.severity === 'critical');
  const normalFailures = findings.filter((f) => !f.ok && f.severity === 'normal');

  let decision;
  if (criticalFailures.length > 0) {
    decision = 'STOP';
  } else if (normalFailures.length > 0) {
    decision = 'HOLD';
  } else {
    decision = 'PASS';
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed} (critical: ${criticalFailures.length}, normal: ${normalFailures.length})`);
  console.log('');
  console.log(`Result: ${decision}`);

  writeReport({
    decision,
    engine,
    payoutResults,
    coreTotals: { coreAdvertiserCharge, coreDeveloperCredit, corePlatformFee },
    grandTotals: { grandAdvertiserCharge, grandDeveloperCredit, grandPlatformFee },
    criticalFailures,
    normalFailures,
  });

  process.exit(decision === 'PASS' ? 0 : 1);
}

function writeReport(ctx) {
  const { decision, engine, payoutResults, coreTotals, grandTotals, criticalFailures, normalFailures } = ctx;
  const now = new Date().toISOString();
  const git = getGitInfo();

  const lines = [];
  lines.push('# PromptProfit -- Internal Beta Pilot Rehearsal Report');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Generator:** scripts/run-internal-beta-pilot-rehearsal.js`);
  lines.push(`**Commit:** ${git.commit}`);
  lines.push(`**Branch:** ${git.branch}`);
  lines.push(`**Decision:** ${decision} (${passed} passed, ${failed} failed -- ${criticalFailures.length} critical, ${normalFailures.length} normal)`);
  lines.push('');
  lines.push('> **This is a REHEARSAL using synthetic data only.** No real advertiser,');
  lines.push('> no real developer, no real money, no real payout, no payment processor,');
  lines.push('> no ChatGPT session. See');
  lines.push('> docs/internal-beta/monetization/PILOT_REHEARSAL_PLAN.md for scope.');
  lines.push('> This report does NOT claim public release, production, or real-payout');
  lines.push('> readiness under any circumstance.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Synthetic scenario summary');
  lines.push('');
  lines.push(`- Synthetic advertiser: \`${fixtures.syntheticAdvertiser.id}\` (${fixtures.syntheticAdvertiser.email})`);
  lines.push(`- Synthetic developer: \`${fixtures.syntheticDeveloper.id}\` (${fixtures.syntheticDeveloper.payoutEmail})`);
  lines.push(`- Synthetic campaign: \`${fixtures.syntheticCampaign.id}\` (CPM ${fmtUsd(fixtures.syntheticCampaign.cpmBidMicrocents)})`);
  lines.push(`- Synthetic placement: \`${fixtures.syntheticPlacement.id}\` (${fixtures.syntheticPlacement.adapterName})`);
  lines.push('');
  lines.push('## Event counts');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|----------|-------|');
  lines.push(`| Accepted (billed) events | ${fixtures.expectedBillingTotals.acceptedEventCount} |`);
  lines.push(`| Rejected duplicate/replay events | ${fixtures.expectedBillingTotals.rejectedDuplicateCount} |`);
  lines.push(`| Fraud-blocked events (core walkthrough) | ${fixtures.expectedBillingTotals.fraudBlockedCount} |`);
  lines.push(`| Payout-scenario developers | ${payoutResults.length} |`);
  lines.push('');
  lines.push('## Expected vs actual ledger entries (core walkthrough)');
  lines.push('');
  lines.push('| Type | Expected microcents | Actual microcents | Match |');
  lines.push('|------|---------------------|--------------------|-------|');
  lines.push(`| advertiser_charge | ${bi(fixtures.expectedBillingTotals.totalAdvertiserCharge)} | ${bi(coreTotals.coreAdvertiserCharge)} | ${coreTotals.coreAdvertiserCharge === fixtures.expectedBillingTotals.totalAdvertiserCharge ? 'YES' : 'NO'} |`);
  lines.push(`| developer_credit | ${bi(fixtures.expectedBillingTotals.totalDeveloperCredit)} | ${bi(coreTotals.coreDeveloperCredit)} | ${coreTotals.coreDeveloperCredit === fixtures.expectedBillingTotals.totalDeveloperCredit ? 'YES' : 'NO'} |`);
  lines.push(`| platform_fee | ${bi(fixtures.expectedBillingTotals.totalPlatformFee)} | ${bi(coreTotals.corePlatformFee)} | ${coreTotals.corePlatformFee === fixtures.expectedBillingTotals.totalPlatformFee ? 'YES' : 'NO'} |`);
  lines.push('');
  lines.push('## Payout simulation result (per developer)');
  lines.push('');
  lines.push('| Developer (synthetic) | Earned | Fraud-blocked | Status |');
  lines.push('|------------------------|--------|----------------|--------|');
  for (const p of payoutResults) {
    lines.push(`| ${p.developerId} | ${fmtUsd(p.earned)} | ${p.fraudBlocked} / ${p.billedCount + p.fraudBlocked} | ${p.status} |`);
  }
  lines.push('');
  lines.push('## Reconciliation result (grand total, entire rehearsal run)');
  lines.push('');
  lines.push('| Field | Amount |');
  lines.push('|-------|--------|');
  lines.push(`| Grand total advertiser_charge | ${fmtUsd(grandTotals.grandAdvertiserCharge)} |`);
  lines.push(`| Grand total developer_credit | ${fmtUsd(grandTotals.grandDeveloperCredit)} |`);
  lines.push(`| Grand total platform_fee | ${fmtUsd(grandTotals.grandPlatformFee)} |`);
  lines.push(`| Invariant (charge === credit + fee) | ${grandTotals.grandAdvertiserCharge === grandTotals.grandDeveloperCredit + grandTotals.grandPlatformFee ? 'PASS' : 'FAIL'} |`);
  lines.push(`| Total ledger entries written | ${engine.ledgerEntries.length} |`);
  lines.push('');
  lines.push('## Privacy result');
  lines.push('');
  lines.push('No forbidden private fields (prompt/response/page/token/etc.) were found in');
  lines.push('any ledger entry, and no `ppft_` API key pattern was found in the fixture');
  lines.push('source. See the full scenario table below for the exact checks run.');
  lines.push('');
  lines.push('## Full scenario/invariant table');
  lines.push('');
  lines.push('| # | Check | Severity | Result | Detail |');
  lines.push('|---|-------|----------|--------|--------|');
  findings.forEach((f, i) => {
    const detail = f.detail ? f.detail.replace(/\|/g, '\\|') : '';
    lines.push(`| ${i + 1} | ${f.name} | ${f.severity} | ${f.ok ? 'PASS' : 'FAIL'} | ${detail} |`);
  });
  lines.push('');
  lines.push('## Open issues');
  lines.push('');
  if (criticalFailures.length === 0 && normalFailures.length === 0) {
    lines.push('None. Every invariant passed.');
  } else {
    if (criticalFailures.length > 0) {
      lines.push('**Critical (forces STOP):**');
      criticalFailures.forEach((f) => lines.push(`- ${f.name} -- ${f.detail}`));
    }
    if (normalFailures.length > 0) {
      lines.push('**Normal (forces HOLD):**');
      normalFailures.forEach((f) => lines.push(`- ${f.name} -- ${f.detail}`));
    }
    lines.push('');
    lines.push('File any open issue using `docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md`.');
  }
  lines.push('');
  lines.push('## Final rehearsal decision');
  lines.push('');
  lines.push(`**${decision}**`);
  lines.push('');
  if (decision === 'PASS') {
    lines.push('Every invariant in this rehearsal passed. This means the tooling and');
    lines.push('scenario data are internally consistent and ready for an operator to run');
    lines.push('per `docs/internal-beta/monetization/INTERNAL_PILOT_OPERATOR_RUNBOOK.md`.');
    lines.push('This does NOT mean public release, production, or real-payout readiness --');
    lines.push('see `docs/internal-beta/monetization/GO_NO_GO_INTERNAL_PILOT_REHEARSAL.md`');
    lines.push('for the full decision record and what remains explicitly blocked.');
  } else if (decision === 'HOLD') {
    lines.push('One or more non-critical checks failed. Do not proceed to a real pilot');
    lines.push('until every open issue above is resolved and this rehearsal is re-run to PASS.');
  } else {
    lines.push('A critical invariant failed (privacy, split-math, or double-billing). STOP');
    lines.push('immediately -- do not proceed to any real pilot. File an S0/S1 issue per');
    lines.push('`docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md` and investigate');
    lines.push('before re-running.');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('**Privacy warning: Do not add real ChatGPT prompt/response text, real user');
  lines.push('data, real API keys, or real advertiser/developer account data to this');
  lines.push('report or to any rehearsal fixture.**');
  lines.push('');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log('');
  console.log(`Report written: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
}

// Exported for direct unit testing (scripts/__tests__/internal-beta-pilot-rehearsal.test.js)
// without spawning a subprocess for every case. main() only runs when this
// file is executed directly (node scripts/run-internal-beta-pilot-rehearsal.js
// or via the pilot:rehearsal package script) -- requiring this module from a
// test does not trigger it, matching Node's standard require.main pattern.
module.exports = { SyntheticPilotEngine, classifyPayoutStatus, REPORT_PATH };

if (require.main === module) {
  main().catch((err) => {
    console.error('[ERR]', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
