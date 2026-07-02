'use strict';
/**
 * Tests for the Internal Beta Pilot Rehearsal: the synthetic fixture
 * module (scripts/fixtures/internal-beta-pilot-fixtures.js) and the
 * rehearsal script (scripts/run-internal-beta-pilot-rehearsal.js).
 *
 * Uses the REAL, built @ad-alt/ledger and @ad-alt/fraud packages via the
 * Windows-safe importFile() helper, same as check-ledger-confidence.js and
 * the rehearsal script itself -- not a reimplementation of money math or
 * fraud scoring.
 *
 * Run: node --test scripts/__tests__/*.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { importFile } = require('../lib/import-file.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_PATH = path.join(REPO_ROOT, 'scripts', 'fixtures', 'internal-beta-pilot-fixtures.js');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'run-internal-beta-pilot-rehearsal.js');
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'internal-beta', 'monetization', 'PILOT_REHEARSAL_REPORT.md');

function loadFixtures() {
  // Clear require cache so tests that mutate the fixture file on disk (test
  // 10 below) always see the current content, not a stale cached module.
  delete require.cache[require.resolve(FIXTURES_PATH)];
  return require(FIXTURES_PATH);
}

async function loadRealPackages() {
  const ledgerMod = await importFile(path.join(REPO_ROOT, 'packages/ledger/dist/index.js'));
  const fraudMod = await importFile(path.join(REPO_ROOT, 'packages/fraud/dist/index.js'));
  const platformCoreMod = await importFile(path.join(REPO_ROOT, 'packages/platform-core/dist/index.js'));
  return {
    calculator: new ledgerMod.LedgerCalculator(),
    fraudScorer: new fraudMod.FraudScorer(),
    findForbiddenFields: platformCoreMod.findForbiddenFields,
  };
}

// ---------------------------------------------------------------------------
// 1. Fixture determinism
// ---------------------------------------------------------------------------

test('fixture determinism: loading the fixture module twice produces identical scenario data', () => {
  const a = loadFixtures();
  const b = loadFixtures();
  assert.equal(a.syntheticAdvertiser.id, b.syntheticAdvertiser.id);
  assert.equal(a.expectedBillingTotals.totalAdvertiserCharge, b.expectedBillingTotals.totalAdvertiserCharge);
  assert.equal(
    JSON.stringify(a.expectedReconciliationOutcome, (k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    JSON.stringify(b.expectedReconciliationOutcome, (k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
  // No Date.now()/Math.random() anywhere in the fixture's own data values.
  const src = fs.readFileSync(FIXTURES_PATH, 'utf8');
  assert.ok(!/Math\.random\(\)/.test(src), 'fixture must not use Math.random()');
  assert.ok(!/Date\.now\(\)/.test(src), 'fixture must not use Date.now() for scenario data');
});

test('fixture determinism: all synthetic emails use the reserved example.test domain', () => {
  const f = loadFixtures();
  assert.match(f.syntheticAdvertiser.email, /@example\.test$/);
  assert.match(f.syntheticDeveloper.payoutEmail, /@example\.test$/);
  assert.match(f.payoutDeveloperBelowThreshold.payoutEmail, /@example\.test$/);
  assert.match(f.payoutDeveloperPayable.payoutEmail, /@example\.test$/);
  assert.equal(f.payoutDeveloperHeld.payoutEmail, null); // deliberately absent, not a real email
});

// ---------------------------------------------------------------------------
// 2 & 3. Valid impression / click create expected billing rows
// ---------------------------------------------------------------------------

test('valid impression creates expected billing rows (real LedgerCalculator + FraudScorer)', async () => {
  const f = loadFixtures();
  const { calculator, fraudScorer } = await loadRealPackages();
  const { SyntheticPilotEngine } = require('../run-internal-beta-pilot-rehearsal.js');
  const engine = new SyntheticPilotEngine(calculator, fraudScorer);

  const result = engine.recordImpression(f.syntheticImpressionEvents[0]);
  assert.equal(result.billed, true);
  const expected = f.expectedLedgerEntries.validImpression.entries;
  assert.equal(result.result.advertiserCharge.amountMicrocents, expected[0].amountMicrocents);
  assert.equal(result.result.developerCredit.amountMicrocents, expected[1].amountMicrocents);
  assert.equal(result.result.platformFee.amountMicrocents, expected[2].amountMicrocents);
  assert.equal(engine.ledgerEntries.length, 3);
});

test('valid click after a billable impression creates expected billing rows', async () => {
  const f = loadFixtures();
  const { calculator, fraudScorer } = await loadRealPackages();
  const { SyntheticPilotEngine } = require('../run-internal-beta-pilot-rehearsal.js');
  const engine = new SyntheticPilotEngine(calculator, fraudScorer);

  engine.recordImpression(f.syntheticImpressionEvents[0]);
  const result = engine.recordClick(f.syntheticClickEvents[0]);
  assert.equal(result.billed, true);
  const expected = f.expectedLedgerEntries.validClick.entries;
  assert.equal(result.result.advertiserCharge.amountMicrocents, expected[0].amountMicrocents);
  assert.equal(result.result.developerCredit.amountMicrocents, expected[1].amountMicrocents);
  assert.equal(result.result.platformFee.amountMicrocents, expected[2].amountMicrocents);
  assert.equal(engine.ledgerEntries.length, 6); // 3 from impression + 3 from click
});

// ---------------------------------------------------------------------------
// 4. Duplicate impression is rejected
// ---------------------------------------------------------------------------

test('duplicate impression (same eventId) is rejected, no new ledger entries', async () => {
  const f = loadFixtures();
  const { calculator, fraudScorer } = await loadRealPackages();
  const { SyntheticPilotEngine } = require('../run-internal-beta-pilot-rehearsal.js');
  const engine = new SyntheticPilotEngine(calculator, fraudScorer);

  engine.recordImpression(f.syntheticImpressionEvents[0]);
  const before = engine.ledgerEntries.length;
  const dup = engine.recordImpression(f.duplicateReplayEvents.duplicateImpression);
  assert.equal(dup.billed, false);
  assert.equal(dup.reason, 'duplicate_event_id');
  assert.equal(engine.ledgerEntries.length, before);
});

// ---------------------------------------------------------------------------
// 5. Replay does not double bill
// ---------------------------------------------------------------------------

test('delayed replay of the same eventId does not double bill', async () => {
  const f = loadFixtures();
  const { calculator, fraudScorer } = await loadRealPackages();
  const { SyntheticPilotEngine } = require('../run-internal-beta-pilot-rehearsal.js');
  const engine = new SyntheticPilotEngine(calculator, fraudScorer);

  engine.recordImpression(f.syntheticImpressionEvents[0]);
  const balanceAfterFirst = engine.balances.get(f.syntheticDeveloper.id);
  const entriesAfterFirst = engine.ledgerEntries.length;

  await new Promise((resolve) => setTimeout(resolve, 5));
  const replay = engine.recordImpression(f.duplicateReplayEvents.replayedImpression);

  assert.equal(replay.billed, false);
  assert.equal(engine.balances.get(f.syntheticDeveloper.id), balanceAfterFirst);
  assert.equal(engine.ledgerEntries.length, entriesAfterFirst);
});

// ---------------------------------------------------------------------------
// 6. Click without prior impression is rejected
// ---------------------------------------------------------------------------

test('click without a prior billable impression is fraud-blocked, not billed', async () => {
  const f = loadFixtures();
  const { calculator, fraudScorer } = await loadRealPackages();
  const { SyntheticPilotEngine } = require('../run-internal-beta-pilot-rehearsal.js');
  const engine = new SyntheticPilotEngine(calculator, fraudScorer);

  const result = engine.recordClick(f.fraudReviewEvents.clickWithoutImpression);
  assert.equal(result.billed, false);
  assert.equal(result.reason, 'fraud_block');
  assert.equal(engine.ledgerEntries.length, 0);
});

// ---------------------------------------------------------------------------
// 7. Split invariant is exact
// ---------------------------------------------------------------------------

test('split invariant is exact across every fixture CPM sample used by payout scenarios', async () => {
  const f = loadFixtures();
  const { calculator } = await loadRealPackages();

  const samples = [
    f.syntheticCampaign.cpmBidMicrocents,
    f.payoutDeveloperBelowThreshold.cpmBidMicrocents,
    f.payoutDeveloperPayable.cpmBidMicrocents,
    f.payoutDeveloperHeld.cpmBidMicrocents,
    f.payoutDeveloperManualReview.cpmBidMicrocents,
  ];
  for (const cpm of samples) {
    const imp = calculator.calculateImpressionEntries({
      impressionId: 'split-check', advertiserId: 'a', developerId: 'd', cpmBidMicrocents: cpm,
    });
    assert.equal(
      imp.advertiserCharge.amountMicrocents,
      imp.developerCredit.amountMicrocents + imp.platformFee.amountMicrocents,
    );
    const click = calculator.calculateClickEntries({
      clickId: 'split-check', advertiserId: 'a', developerId: 'd', cpmBidMicrocents: cpm,
    });
    assert.equal(
      click.advertiserCharge.amountMicrocents,
      click.developerCredit.amountMicrocents + click.platformFee.amountMicrocents,
    );
  }
});

// ---------------------------------------------------------------------------
// 8. Payout status calculation is correct
// ---------------------------------------------------------------------------

test('payout status calculation matches expected status for all 4 fixture scenarios', () => {
  const f = loadFixtures();
  const { classifyPayoutStatus } = require('../run-internal-beta-pilot-rehearsal.js');
  const policy = {
    minPayoutThresholdMicrocents: f.expectedPayoutSimulation.minPayoutThresholdMicrocents,
    largePayoutReviewThresholdMicrocents: f.expectedPayoutSimulation.largePayoutReviewThresholdMicrocents,
    fraudBlockRatioReviewThreshold: f.expectedPayoutSimulation.fraudBlockRatioReviewThreshold,
  };

  for (const expected of f.expectedPayoutSimulation.developers) {
    const status = classifyPayoutStatus(
      {
        payoutEmail: expected.developerId === f.payoutDeveloperHeld.developerId ? null : 'x@example.test',
        earnedMicrocents: expected.expectedEarnedMicrocents,
        fraudBlockedCount: expected.developerId === f.payoutDeveloperManualReview.developerId
          ? f.fraudReviewEvents.fraudRatioDeveloper.fraudBlockedImpressionCount
          : 0,
        billedCount: expected.developerId === f.payoutDeveloperManualReview.developerId
          ? f.fraudReviewEvents.fraudRatioDeveloper.billedImpressionCount
          : 1,
      },
      policy,
    );
    assert.equal(status, expected.expectedStatus, `developer ${expected.developerId}`);
  }

  // Explicit boundary checks, independent of the fixture's specific numbers.
  assert.equal(
    classifyPayoutStatus({ payoutEmail: null, earnedMicrocents: 999_999_999n, fraudBlockedCount: 0, billedCount: 1 }, policy),
    'held',
    'missing payoutEmail always forces held, regardless of amount',
  );
  assert.equal(
    classifyPayoutStatus({ payoutEmail: 'x@example.test', earnedMicrocents: 1n, fraudBlockedCount: 0, billedCount: 1 }, policy),
    'pending',
  );
});

// ---------------------------------------------------------------------------
// 9. Privacy forbidden fields are absent
// ---------------------------------------------------------------------------

test('privacy: no forbidden field present in a generated ledger entry object', async () => {
  const f = loadFixtures();
  const { calculator, fraudScorer, findForbiddenFields } = await loadRealPackages();
  const { SyntheticPilotEngine } = require('../run-internal-beta-pilot-rehearsal.js');
  const engine = new SyntheticPilotEngine(calculator, fraudScorer);

  engine.recordImpression(f.syntheticImpressionEvents[0]);
  engine.recordClick(f.syntheticClickEvents[0]);

  for (const entry of engine.ledgerEntries) {
    const found = findForbiddenFields(entry);
    assert.deepEqual(found, []);
  }
});

// ---------------------------------------------------------------------------
// 10. Rehearsal script exits non-zero if an invariant is intentionally broken
// ---------------------------------------------------------------------------

test('rehearsal script exits non-zero when a fixture invariant is intentionally broken', { timeout: 30000 }, () => {
  const originalContent = fs.readFileSync(FIXTURES_PATH, 'utf8');
  try {
    // Break the same invariant manually verified during development: force
    // a mismatch between the fixture's declared total and what the real
    // LedgerCalculator will actually compute.
    const broken = originalContent.replace(
      'totalAdvertiserCharge: impressionSplit001.total + clickSplit001.total,',
      'totalAdvertiserCharge: impressionSplit001.total + clickSplit001.total + 1n,',
    );
    assert.notEqual(broken, originalContent, 'sanity: the replacement must actually change the file');
    fs.writeFileSync(FIXTURES_PATH, broken, 'utf8');

    const result = spawnSync(process.execPath, [SCRIPT_PATH], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'script must exit non-zero when an invariant is broken');
    assert.match(result.stdout, /Result: STOP/);
  } finally {
    fs.writeFileSync(FIXTURES_PATH, originalContent, 'utf8');
  }

  // Restore-then-verify: confirm the fixture file is back to a working
  // state (protects against a corrupted restore silently leaving the repo
  // broken for every subsequent test/run).
  const verifyResult = spawnSync(process.execPath, [SCRIPT_PATH], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(verifyResult.status, 0, 'fixture restore must leave the rehearsal passing again');
});

// ---------------------------------------------------------------------------
// 11 & 12. Report includes required sections / excludes forbidden fields
// ---------------------------------------------------------------------------

test('report includes all required sections and does not include forbidden private fields', { timeout: 30000 }, async () => {
  // Run once more (clean fixture, restored by the previous test) to get a
  // fresh, known-good report on disk.
  const result = spawnSync(process.execPath, [SCRIPT_PATH], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0);

  const report = fs.readFileSync(REPORT_PATH, 'utf8');

  const requiredSections = [
    '**Generated:**', '**Commit:**', '**Branch:**', '**Decision:**',
    '## Synthetic scenario summary', '## Event counts',
    '## Expected vs actual ledger entries', '## Payout simulation result',
    '## Reconciliation result', '## Privacy result', '## Open issues',
    '## Final rehearsal decision',
  ];
  for (const section of requiredSections) {
    assert.ok(report.includes(section), `report missing required section: ${section}`);
  }

  // Scan the report text for forbidden field names used as a key (same
  // pattern as check-monetization-privacy.js) and for a leaked API key.
  const platformCoreMod = await importFile(path.join(REPO_ROOT, 'packages/platform-core/dist/index.js'));
  const fieldKeyRe = new RegExp(`["']?(${platformCoreMod.TELEMETRY_FORBIDDEN_FIELDS.join('|')})["']?\\s*:`, 'g');
  assert.deepEqual([...report.matchAll(fieldKeyRe)], []);
  assert.doesNotMatch(report, /ppft_[0-9a-f]{48,}/i);
});
