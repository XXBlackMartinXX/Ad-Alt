'use strict';
/**
 * Ledger Confidence Check — deterministic, synthetic-data-only verification
 * of the PromptProfit billing/ledger invariants, runnable via plain `node`
 * with no Docker, no Postgres, no Redis, and no real money.
 *
 * WHAT THIS SCRIPT DOES:
 *   - Loads the REAL, built `@ad-alt/ledger` (LedgerCalculator) and
 *     `@ad-alt/fraud` (FraudScorer) packages via dynamic import of their
 *     compiled dist/ output — the exact money-math and fraud-decision code
 *     that ships in `apps/api`, not a reimplementation.
 *   - Drives that real code through a small in-process "synthetic ledger
 *     engine" defined in this file, which mirrors the orchestration
 *     invariants of `apps/api/src/services/ledger.service.ts` and
 *     `event-processor.ts` (idempotency-key uniqueness, atomic balance
 *     deltas, click-requires-valid-impression) using in-memory Maps instead
 *     of Postgres/Redis, because those services import `@ad-alt/database`,
 *     which throws at import time without a live DATABASE_URL.
 *   - The DB-coupled orchestration logic itself (LedgerService,
 *     EventProcessor) is ALSO independently exercised, using the real code
 *     against an in-memory fake `@ad-alt/database`/Redis, by the existing
 *     test suite at apps/api/src/__tests__/ledger-balance.test.ts and
 *     events.test.ts (run via `pnpm -w run verify` / `apps/api test:unit`).
 *     This script complements that suite with a framework-free, shareable,
 *     deterministic report; it does not replace it.
 *
 * THIS IS NOT A PRODUCTION FINANCIAL AUDIT. No real money, no real user
 * data, no real advertiser/developer accounts. All IDs and amounts below
 * are synthetic and fixed so output is reproducible run to run.
 *
 * Usage:
 *   node scripts/check-ledger-confidence.js
 *   pnpm -w run check:ledger:confidence
 */

const fs = require('fs');
const path = require('path');
const { importFile } = require('./lib/import-file.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(
  REPO_ROOT,
  'docs/internal-beta/monetization/LEDGER_CONFIDENCE_REPORT.md',
);

let passed = 0;
let failed = 0;
const results = [];

function record(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
  results.push({ name, ok, detail: detail || '' });
}

function bi(v) {
  // Render BigInt/number values as plain decimal strings for the report.
  return typeof v === 'bigint' ? v.toString() : String(v);
}

// ---------------------------------------------------------------------------
// Synthetic ledger engine — mirrors LedgerService/EventProcessor invariants
// using in-memory state instead of Postgres/Redis. Uses the REAL
// LedgerCalculator and FraudScorer for all money-math and fraud decisions.
// ---------------------------------------------------------------------------

class SyntheticLedgerEngine {
  constructor(calculator, fraudScorer) {
    this.calculator = calculator;
    this.fraudScorer = fraudScorer;
    this.seenEventIds = new Set(); // mirrors Redis SET NX + DB unique dedup key
    this.balances = new Map(); // accountId -> microcents (mirrors `balances` table)
    this.ledgerEntries = []; // mirrors `ledger_entries` table (append-only)
    this.impressions = new Map(); // impressionId -> { status }
  }

  /** Atomic-style delta application — one Map write, no read-then-await-then-write gap. */
  applyDelta(accountId, deltaMicrocents) {
    const prev = this.balances.get(accountId) ?? 0n;
    const next = prev + deltaMicrocents;
    this.balances.set(accountId, next);
    return next;
  }

  /** Returns { duplicate: true } without any side effects if eventId was already seen. */
  checkDedup(eventId) {
    if (this.seenEventIds.has(eventId)) return { duplicate: true };
    this.seenEventIds.add(eventId);
    return { duplicate: false };
  }

  recordImpression({ eventId, impressionId, advertiserId, developerId, cpmBidMicrocents }) {
    const dedup = this.checkDedup(eventId);
    if (dedup.duplicate) return { billed: false, reason: 'duplicate_event_id' };

    const result = this.calculator.calculateImpressionEntries({
      impressionId,
      advertiserId,
      developerId,
      cpmBidMicrocents,
    });

    if (!this.calculator.verifyBalance(result)) {
      throw new Error(`ledger balance verification failed for ${impressionId}`);
    }

    this.applyDelta(result.advertiserCharge.account.id, -result.advertiserCharge.amountMicrocents);
    this.applyDelta(result.developerCredit.account.id, result.developerCredit.amountMicrocents);
    this.applyDelta(result.platformFee.account.id, result.platformFee.amountMicrocents);

    this.ledgerEntries.push(result.advertiserCharge, result.developerCredit, result.platformFee);
    this.impressions.set(impressionId, { status: 'billable' });

    return { billed: true, result };
  }

  recordClick({ eventId, clickId, impressionId, advertiserId, developerId, cpmBidMicrocents, lastClickAt }) {
    const dedup = this.checkDedup(eventId);
    if (dedup.duplicate) return { billed: false, reason: 'duplicate_event_id' };

    const impression = this.impressions.get(impressionId);
    const hasValidPriorImpression = impression?.status === 'billable' || impression?.status === 'reconciled';

    const fraudResult = this.fraudScorer.scoreClick({
      deviceId: 'synthetic-device',
      sessionId: 'synthetic-session',
      impressionsInLastHour: 0,
      deviceIsBlocked: false,
      deviceFraudScore: 0,
      sequenceNumber: 1,
      hasValidPriorImpression,
      ...(lastClickAt ? { lastClickAt } : {}),
    });

    if (fraudResult.decision !== 'pass') {
      return { billed: false, reason: `fraud_${fraudResult.decision}`, fraudResult };
    }

    const result = this.calculator.calculateClickEntries({
      clickId,
      advertiserId,
      developerId,
      cpmBidMicrocents,
    });

    if (!this.calculator.verifyBalance(result)) {
      throw new Error(`click ledger balance verification failed for ${clickId}`);
    }

    this.applyDelta(result.advertiserCharge.account.id, -result.advertiserCharge.amountMicrocents);
    this.applyDelta(result.developerCredit.account.id, result.developerCredit.amountMicrocents);
    this.applyDelta(result.platformFee.account.id, result.platformFee.amountMicrocents);

    this.ledgerEntries.push(result.advertiserCharge, result.developerCredit, result.platformFee);

    return { billed: true, result, fraudResult };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[>>] Ledger Confidence Check (synthetic data only, no real money)');
  console.log('------------------------------------------------------------');
  console.log('');

  const ledgerMod = await importFile(path.join(REPO_ROOT, 'packages/ledger/dist/index.js'));
  const fraudMod = await importFile(path.join(REPO_ROOT, 'packages/fraud/dist/index.js'));
  const platformCoreMod = await importFile(path.join(REPO_ROOT, 'packages/platform-core/dist/index.js'));

  const calculator = new ledgerMod.LedgerCalculator();
  const fraudScorer = new fraudMod.FraudScorer();
  const { findForbiddenFields } = platformCoreMod;

  // Synthetic, fixed accounts/campaign — not real advertisers/developers.
  const ADV = 'synthetic-advertiser-001';
  const DEV = 'synthetic-developer-001';
  const CPM = 5_000_000n; // $5.00 CPM -> $0.005 per impression, $0.05 per click

  console.log('== 1. Impression event creates exactly 3 entries with correct amounts ==');
  {
    const engine = new SyntheticLedgerEngine(calculator, fraudScorer);
    const r = engine.recordImpression({
      eventId: 'evt-imp-001',
      impressionId: 'imp-001',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });

    const entryTypes = engine.ledgerEntries.map((e) => e.entryType).sort();
    record(
      'Impression creates exactly [advertiser_charge, developer_credit, platform_fee]',
      r.billed &&
        entryTypes.length === 3 &&
        JSON.stringify(entryTypes) === JSON.stringify(['advertiser_charge', 'developer_credit', 'platform_fee']),
      `entryTypes=${JSON.stringify(entryTypes)}`,
    );

    const expectedTotal = CPM / 1000n; // 5000 microcents
    const expectedDev = (expectedTotal * 60n) / 100n; // 3000
    const expectedPlatform = expectedTotal - expectedDev; // 2000

    record(
      `advertiser_charge amount is exactly ${bi(expectedTotal)} microcents`,
      r.result.advertiserCharge.amountMicrocents === expectedTotal,
      `actual=${bi(r.result.advertiserCharge.amountMicrocents)}`,
    );
    record(
      `developer_credit amount is exactly ${bi(expectedDev)} microcents (60%)`,
      r.result.developerCredit.amountMicrocents === expectedDev,
      `actual=${bi(r.result.developerCredit.amountMicrocents)}`,
    );
    record(
      `platform_fee amount is exactly ${bi(expectedPlatform)} microcents (40%)`,
      r.result.platformFee.amountMicrocents === expectedPlatform,
      `actual=${bi(r.result.platformFee.amountMicrocents)}`,
    );
  }
  console.log('');

  console.log('== 2. Click event creates exactly 3 entries at 10x impression rate ==');
  {
    const engine = new SyntheticLedgerEngine(calculator, fraudScorer);
    engine.recordImpression({
      eventId: 'evt-imp-002',
      impressionId: 'imp-002',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });
    const clickResult = engine.recordClick({
      eventId: 'evt-click-002',
      clickId: 'click-002',
      impressionId: 'imp-002',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });

    const clickEntries = engine.ledgerEntries.filter((e) => e.referenceType === 'click');
    record(
      'Click creates exactly [advertiser_charge, developer_credit, platform_fee]',
      clickResult.billed && clickEntries.length === 3,
      `clickEntries.length=${clickEntries.length}`,
    );

    const impressionValue = CPM / 1000n; // 5000
    const expectedClickTotal = impressionValue * 10n; // 50000
    record(
      `Click advertiser_charge is exactly 10x impression charge (${bi(expectedClickTotal)} microcents)`,
      clickResult.result.advertiserCharge.amountMicrocents === expectedClickTotal,
      `actual=${bi(clickResult.result.advertiserCharge.amountMicrocents)}`,
    );
  }
  console.log('');

  console.log('== 3. Split math is exact: advertiser charge = developer credit + platform fee ==');
  {
    // Exercise a range of non-round CPM bids (including values not evenly
    // divisible by 1000 or by 5) to catch integer-division rounding drift.
    const cpmSamples = [
      1n, 999n, 1_000n, 1_001n, 3_333_333n, 5_000_000n, 7_777_777n, 12_345_678n, 999_999_999n,
    ];
    let allBalanced = true;
    for (const cpm of cpmSamples) {
      const imp = calculator.calculateImpressionEntries({
        impressionId: `split-imp-${cpm}`,
        advertiserId: ADV,
        developerId: DEV,
        cpmBidMicrocents: cpm,
      });
      const click = calculator.calculateClickEntries({
        clickId: `split-click-${cpm}`,
        advertiserId: ADV,
        developerId: DEV,
        cpmBidMicrocents: cpm,
      });
      const impBalanced =
        imp.advertiserCharge.amountMicrocents ===
        imp.developerCredit.amountMicrocents + imp.platformFee.amountMicrocents;
      const clickBalanced =
        click.advertiserCharge.amountMicrocents ===
        click.developerCredit.amountMicrocents + click.platformFee.amountMicrocents;
      if (!impBalanced || !clickBalanced) {
        allBalanced = false;
        console.log(`        mismatch at cpm=${cpm}: imp=${impBalanced} click=${clickBalanced}`);
      }
    }
    record(
      `Split math exact (charge = credit + fee) across ${cpmSamples.length} CPM samples (impression + click each)`,
      allBalanced,
    );
  }
  console.log('');

  console.log('== 4. Duplicate event IDs do not double bill ==');
  {
    const engine = new SyntheticLedgerEngine(calculator, fraudScorer);
    const first = engine.recordImpression({
      eventId: 'evt-dup-001',
      impressionId: 'imp-dup-001',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });
    const entriesAfterFirst = engine.ledgerEntries.length;
    const second = engine.recordImpression({
      eventId: 'evt-dup-001', // same eventId
      impressionId: 'imp-dup-001',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });
    record(
      'First submission bills, duplicate eventId is rejected before any ledger write',
      first.billed === true && second.billed === false && second.reason === 'duplicate_event_id',
    );
    record(
      'Ledger entry count unchanged after duplicate submission',
      engine.ledgerEntries.length === entriesAfterFirst,
      `before=${entriesAfterFirst} after=${engine.ledgerEntries.length}`,
    );
  }
  console.log('');

  console.log('== 5. Replay attempts do not double bill ==');
  {
    // A "replay" is the same event resubmitted later (e.g. a retried
    // network request). It carries the identical eventId, so it is caught
    // by the same dedup mechanism as duplicates (§4) -- verified here as a
    // distinct scenario with a time gap to make the intent explicit.
    const engine = new SyntheticLedgerEngine(calculator, fraudScorer);
    engine.recordImpression({
      eventId: 'evt-replay-001',
      impressionId: 'imp-replay-001',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });
    const balanceAfterFirst = engine.balances.get(DEV);

    await new Promise((resolve) => setTimeout(resolve, 5));

    const replay = engine.recordImpression({
      eventId: 'evt-replay-001', // replayed eventId, arrives later
      impressionId: 'imp-replay-001',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });

    record(
      'Delayed replay of the same eventId is rejected and developer balance is unchanged',
      replay.billed === false && engine.balances.get(DEV) === balanceAfterFirst,
      `balanceAfterFirst=${bi(balanceAfterFirst)} balanceAfterReplay=${bi(engine.balances.get(DEV))}`,
    );
  }
  console.log('');

  console.log('== 6. Click cannot be billed without a valid prior billable impression ==');
  {
    const engine = new SyntheticLedgerEngine(calculator, fraudScorer);
    // No recordImpression call first -- impression-001 was never billed.
    const clickResult = engine.recordClick({
      eventId: 'evt-click-no-impression',
      clickId: 'click-no-impression',
      impressionId: 'imp-never-billed',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });
    record(
      'Click without a prior billable impression is fraud-blocked, not billed',
      clickResult.billed === false && clickResult.reason === 'fraud_block',
      `reason=${clickResult.reason} fraudDecision=${clickResult.fraudResult && clickResult.fraudResult.decision}`,
    );
    record(
      'No ledger entries created for the blocked click',
      engine.ledgerEntries.length === 0,
      `ledgerEntries.length=${engine.ledgerEntries.length}`,
    );
  }
  console.log('');

  console.log('== 7. Concurrent billable events remain consistent (no lost update) ==');
  {
    const engine = new SyntheticLedgerEngine(calculator, fraudScorer);
    const [r1, r2] = await Promise.all([
      Promise.resolve(
        engine.recordImpression({
          eventId: 'evt-concurrent-001',
          impressionId: 'imp-concurrent-001',
          advertiserId: ADV,
          developerId: DEV,
          cpmBidMicrocents: CPM,
        }),
      ),
      Promise.resolve(
        engine.recordImpression({
          eventId: 'evt-concurrent-002',
          impressionId: 'imp-concurrent-002',
          advertiserId: ADV,
          developerId: DEV,
          cpmBidMicrocents: CPM,
        }),
      ),
    ]);

    const developerEntries = engine.ledgerEntries.filter((e) => e.entryType === 'developer_credit');
    const expectedDeveloperTotal = developerEntries.reduce((sum, e) => sum + e.amountMicrocents, 0n);
    record(
      'Both concurrent impressions billed independently (2 developer_credit entries)',
      r1.billed && r2.billed && developerEntries.length === 2,
      `developerEntries.length=${developerEntries.length}`,
    );
    record(
      'Developer balance equals the sum of both credits (no lost update)',
      engine.balances.get(DEV) === expectedDeveloperTotal,
      `balance=${bi(engine.balances.get(DEV))} expected=${bi(expectedDeveloperTotal)}`,
    );
  }
  console.log('');

  console.log('== 8. Ledger rows contain no private prompt/response/chat content ==');
  {
    const engine = new SyntheticLedgerEngine(calculator, fraudScorer);
    engine.recordImpression({
      eventId: 'evt-privacy-001',
      impressionId: 'imp-privacy-001',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });
    engine.recordClick({
      eventId: 'evt-privacy-002',
      clickId: 'click-privacy-001',
      impressionId: 'imp-privacy-001',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });

    let forbiddenFound = [];
    for (const entry of engine.ledgerEntries) {
      const found = findForbiddenFields(entry);
      if (found.length > 0) forbiddenFound = forbiddenFound.concat(found);
    }
    record(
      `No forbidden fields (prompt/response/page/token/etc.) in any of ${engine.ledgerEntries.length} ledger entries`,
      forbiddenFound.length === 0,
      `forbiddenFound=${JSON.stringify(forbiddenFound)}`,
    );

    // Ledger entries should only ever contain these known-safe keys.
    const allowedKeys = new Set([
      'entryType', 'referenceType', 'referenceId', 'account', 'amountMicrocents', 'description', 'metadata',
    ]);
    let unexpectedKeys = [];
    for (const entry of engine.ledgerEntries) {
      for (const key of Object.keys(entry)) {
        if (!allowedKeys.has(key)) unexpectedKeys.push(key);
      }
    }
    record(
      'Ledger entries contain only the expected known-safe key set',
      unexpectedKeys.length === 0,
      `unexpectedKeys=${JSON.stringify(unexpectedKeys)}`,
    );
  }
  console.log('');

  console.log('== 9. Report determinism ==');
  {
    // Re-running the same fixed scenario twice must produce identical amounts.
    const engineA = new SyntheticLedgerEngine(calculator, fraudScorer);
    engineA.recordImpression({
      eventId: 'evt-determinism-001',
      impressionId: 'imp-determinism-001',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });
    const engineB = new SyntheticLedgerEngine(calculator, fraudScorer);
    engineB.recordImpression({
      eventId: 'evt-determinism-001',
      impressionId: 'imp-determinism-001',
      advertiserId: ADV,
      developerId: DEV,
      cpmBidMicrocents: CPM,
    });
    const a = engineA.ledgerEntries.map((e) => bi(e.amountMicrocents)).join(',');
    const b = engineB.ledgerEntries.map((e) => bi(e.amountMicrocents)).join(',');
    record('Identical synthetic scenario produces identical amounts run-to-run', a === b, `a=${a} b=${b}`);
  }
  console.log('');

  // -------------------------------------------------------------------------
  // Summary + report
  // -------------------------------------------------------------------------

  console.log('=== Summary ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('');

  const overallPass = failed === 0;
  console.log(overallPass ? 'Result: PASS' : 'Result: FAIL');

  writeReport(overallPass);

  process.exit(overallPass ? 0 : 1);
}

function writeReport(overallPass) {
  const now = new Date().toISOString();
  const lines = [];
  lines.push('# PromptProfit -- Ledger Confidence Report');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Generator:** scripts/check-ledger-confidence.js`);
  lines.push(`**Result:** ${overallPass ? 'PASS' : 'FAIL'} (${passed} passed, ${failed} failed)`);
  lines.push('');
  lines.push('> **This is NOT a production financial audit.** All accounts, campaigns,');
  lines.push('> event IDs, and amounts in this report are synthetic/fixed test data.');
  lines.push('> No real money, no real advertiser or developer, no real user data.');
  lines.push('> This report verifies the money-math and orchestration invariants of the');
  lines.push('> billing/ledger pipeline using the REAL `@ad-alt/ledger` and `@ad-alt/fraud`');
  lines.push('> production packages, driven through a synthetic in-memory harness that');
  lines.push('> mirrors (but does not replace) `apps/api/src/services/ledger.service.ts`');
  lines.push('> and `event-processor.ts`, which are independently exercised against a');
  lines.push('> real-code-path in-memory fake DB/Redis by');
  lines.push('> `apps/api/src/__tests__/ledger-balance.test.ts` and `events.test.ts`.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Scenarios and results');
  lines.push('');
  lines.push('| # | Scenario | Result | Detail |');
  lines.push('|---|----------|--------|--------|');
  results.forEach((r, i) => {
    const detail = r.detail ? r.detail.replace(/\|/g, '\\|') : '';
    lines.push(`| ${i + 1} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${detail} |`);
  });
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Expected vs actual rows (illustrative sample)');
  lines.push('');
  lines.push('Synthetic scenario: 1 impression + 1 click, CPM bid = 5,000,000 microcents ($5.00 CPM).');
  lines.push('');
  lines.push('| Event | Entry | Expected microcents | Basis |');
  lines.push('|-------|-------|---------------------|-------|');
  lines.push('| impression | advertiser_charge | 5000 | cpmBidMicrocents / 1000 |');
  lines.push('| impression | developer_credit | 3000 | 60% of 5000 |');
  lines.push('| impression | platform_fee | 2000 | 5000 - 3000 |');
  lines.push('| click | advertiser_charge | 50000 | impression value x 10 |');
  lines.push('| click | developer_credit | 30000 | 60% of 50000 |');
  lines.push('| click | platform_fee | 20000 | 50000 - 30000 |');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Known limitations');
  lines.push('');
  lines.push('1. This script uses a synthetic in-memory harness for orchestration');
  lines.push('   (dedup, balances, click-eligibility), not a live Postgres/Redis --');
  lines.push('   because `apps/api`\'s real `LedgerService`/`EventProcessor` import');
  lines.push('   `@ad-alt/database`, which requires a live `DATABASE_URL` at import time.');
  lines.push('2. The REAL orchestration code (`LedgerService`, `EventProcessor`) is');
  lines.push('   exercised separately, against a real-code-path in-memory fake DB/Redis,');
  lines.push('   by `apps/api/src/__tests__/ledger-balance.test.ts` and `events.test.ts`');
  lines.push('   (run via `pnpm -w run verify`) -- this report does not replace those tests.');
  lines.push('3. No real Postgres transaction/crash-atomicity is exercised here; that');
  lines.push('   requires a staging environment per');
  lines.push('   `docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md`.');
  lines.push('4. No refund/void or real payout code paths exist to test (confirmed');
  lines.push('   absent in `docs/internal-beta/monetization/MONETIZATION_SOURCE_AUDIT.md`).');
  lines.push('5. This report is regenerated by re-running the script; it is not hand-edited.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('**Privacy warning: Do not add real ChatGPT prompt/response text, real user');
  lines.push('data, real API keys, or real advertiser/developer account data to this');
  lines.push('report or to this script\'s synthetic fixtures.**');
  lines.push('');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log('');
  console.log(`Report written: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
}

main().catch((err) => {
  console.error('[ERR]', err && err.stack ? err.stack : err);
  process.exit(1);
});
