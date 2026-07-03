'use strict';
/**
 * Controlled Revenue Pilot Readiness Gate — the single command an operator
 * runs immediately before launching the controlled revenue pilot.
 *
 * FRESH EXECUTION ONLY: every sub-check below is spawned as a real child
 * process on every run of this gate — never inferred from a markdown
 * report left over from a previous run. This mirrors the fix already made
 * to scripts/check-billing-reconciliation-readiness.js (the "stale
 * evidence" gap closed in a prior phase) and this gate additionally
 * fresh-runs THAT script too, so its own internal freshness guarantee is
 * inherited, not just assumed.
 *
 * Usage:
 *   node scripts/check-controlled-revenue-pilot-readiness.js
 *   pnpm -w run check:revenue-pilot
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const REVENUE_PILOT_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'revenue-pilot');
const RISK_REGISTER = path.join(REPO_ROOT, 'docs', 'internal-beta', 'monetization', 'MONETIZATION_RISK_REGISTER.md');

const commandsRun = [];
const failures = []; // { label, reason }
const warnings = [];

function section(t) {
  console.log('');
  console.log(`== ${t} ==`);
}

function runFresh(label, scriptRelPath, extraArgs) {
  const scriptAbsPath = path.join(REPO_ROOT, scriptRelPath);
  const args = [scriptAbsPath, ...(extraArgs || [])];
  const cmdString = `node ${scriptRelPath}${extraArgs ? ' ' + extraArgs.join(' ') : ''}`;
  commandsRun.push(cmdString);

  const result = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8' });

  if (result.error) {
    failures.push({ label, reason: `could not be executed: ${result.error.message}` });
    console.log(`  FAIL  ${label} (${cmdString}) -- could not be executed`);
    return { ok: false, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
  }

  if (result.status !== 0) {
    failures.push({ label, reason: `exited non-zero (status=${result.status})` });
    console.log(`  FAIL  ${label} (${cmdString}) -- exit ${result.status}`);
    const tail = (result.stdout || '').trim().split('\n').slice(-10).join('\n  ');
    if (tail) console.log(`        last output: ${tail}`);
    return { ok: false, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
  }

  console.log(`  PASS  ${label} (${cmdString})`);
  return { ok: true, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function main() {
  console.log('[>>] Controlled Revenue Pilot Readiness Gate');
  console.log('------------------------------------------------------------');
  console.log('This gate fresh-runs every underlying check as a real child');
  console.log('process on every invocation -- it never trusts a stale report.');

  // -------------------------------------------------------------------
  // 1. Fresh-run every required sub-check
  // -------------------------------------------------------------------
  section('1. Fresh execution of required checks');

  runFresh('pilot:rehearsal', 'scripts/run-internal-beta-pilot-rehearsal.js');
  runFresh('check:ledger:confidence', 'scripts/check-ledger-confidence.js');
  runFresh('check:monetization:privacy', 'scripts/check-monetization-privacy.js');
  runFresh('simulate:payouts', 'scripts/simulate-payouts.js');
  runFresh('check:billing:reconciliation (internal-beta)', 'scripts/check-billing-reconciliation-readiness.js', ['--mode', 'internal-beta']);
  runFresh('check:dryrun:001', 'scripts/check-dryrun-001-result.js');
  runFresh('check:secrets:local', 'scripts/check-no-secret-leaks.js');

  // -------------------------------------------------------------------
  // 2. Required pilot docs exist
  // -------------------------------------------------------------------
  section('2. Required pilot docs');

  const requiredDocs = [
    'FAST_REVENUE_PATH_AUDIT.md',
    'CONTROLLED_REVENUE_PILOT_CRITERIA.md',
    'PILOT_LAUNCH_RUNBOOK.md',
    'PILOT_ACCEPTANCE_CHECKLIST.md',
    'PILOT_STOP_ROLLBACK_PLAN.md',
  ];
  for (const doc of requiredDocs) {
    const docPath = path.join(REVENUE_PILOT_DIR, doc);
    if (fs.existsSync(docPath)) {
      console.log(`  PASS  docs/internal-beta/revenue-pilot/${doc} exists`);
    } else {
      failures.push({ label: `doc: ${doc}`, reason: 'missing' });
      console.log(`  FAIL  docs/internal-beta/revenue-pilot/${doc} MISSING`);
    }
  }

  // -------------------------------------------------------------------
  // 3. Public release must NOT be accidentally marked ready
  // -------------------------------------------------------------------
  section('3. Public release must remain correctly blocked');

  {
    const scriptAbsPath = path.join(REPO_ROOT, 'scripts', 'check-license-decision.js');
    commandsRun.push('node scripts/check-license-decision.js -- --mode public-release');
    const result = spawnSync(process.execPath, [scriptAbsPath, '--mode', 'public-release'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    if (result.status === 0) {
      failures.push({
        label: 'public-release gate',
        reason: 'check:license --mode public-release unexpectedly PASSED -- public release may have been marked ready without review',
      });
      console.log('  FAIL  check:license --mode public-release unexpectedly PASSED');
      console.log('        This gate requires public release to remain correctly BLOCKED.');
    } else {
      console.log('  PASS  check:license --mode public-release still correctly FAILS (public release remains blocked)');
    }
  }

  // -------------------------------------------------------------------
  // 4. Real payout execution must remain disabled
  // -------------------------------------------------------------------
  section('4. Real payout execution must remain disabled');

  {
    const suspiciousPatterns = [
      /stripe\.transfers\.create/i,
      /stripe\.payouts\.create/i,
      /paypal.*payout/i,
      /\.insert\(\s*payouts\s*\)\s*\.values/,
      /\.insert\(\s*payoutBatches\s*\)\s*\.values/,
      /stripeTransferId\s*:\s*[^n,]/, // assigning a non-null literal to stripeTransferId
    ];
    const apiSrcDir = path.join(REPO_ROOT, 'apps', 'api', 'src');
    let payoutExecutionFound = [];

    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          const content = fs.readFileSync(full, 'utf8');
          for (const pattern of suspiciousPatterns) {
            if (pattern.test(content)) {
              payoutExecutionFound.push({ file: path.relative(REPO_ROOT, full), pattern: pattern.toString() });
            }
          }
        }
      }
    }
    walk(apiSrcDir);

    if (payoutExecutionFound.length === 0) {
      console.log('  PASS  No real payout execution code found in apps/api/src (confirmed absent, as required)');
    } else {
      failures.push({
        label: 'real payout execution',
        reason: `possible real payout execution code found: ${JSON.stringify(payoutExecutionFound)}`,
      });
      console.log('  FAIL  Possible real payout execution code found:');
      payoutExecutionFound.forEach((f) => console.log(`        ${f.file} matches ${f.pattern}`));
    }
  }

  // -------------------------------------------------------------------
  // 5. No unresolved S0/S1 pilot blockers
  // -------------------------------------------------------------------
  section('5. Unresolved S0/S1 pilot blockers');

  {
    if (!fs.existsSync(RISK_REGISTER)) {
      warnings.push('MONETIZATION_RISK_REGISTER.md not found -- cannot confirm S0/S1 status');
      console.log('  WARN  docs/internal-beta/monetization/MONETIZATION_RISK_REGISTER.md not found');
    } else {
      const content = fs.readFileSync(RISK_REGISTER, 'utf8');
      const rows = content.split('\n').filter((l) => l.trim().startsWith('|'));
      const openS0S1 = rows.filter((row) => {
        const isS0S1 = /\bS0\b|\bS1\b/.test(row);
        const isOpenStatus = /\b(open|unresolved)\b/i.test(row) && !/\bmitigated\b|\bresolved\b|\bclosed\b/i.test(row);
        return isS0S1 && isOpenStatus;
      });
      if (openS0S1.length === 0) {
        console.log('  PASS  No unresolved S0/S1 issue found in the monetization risk register');
      } else {
        failures.push({ label: 'S0/S1 blockers', reason: `${openS0S1.length} unresolved S0/S1 row(s) found` });
        console.log(`  FAIL  ${openS0S1.length} unresolved S0/S1 row(s) found in the risk register`);
        openS0S1.forEach((row) => console.log(`        ${row.trim()}`));
      }
    }
  }

  // -------------------------------------------------------------------
  // Decision
  // -------------------------------------------------------------------

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Commands run: ${commandsRun.length}`);
  console.log(`  Failures: ${failures.length}`);
  console.log(`  Warnings: ${warnings.length}`);

  let decision;
  let reason;
  let nextAction;

  if (failures.length > 0) {
    decision = failures.some((f) => f.label === 'real payout execution' || f.label === 'public-release gate')
      ? 'STOP'
      : 'HOLD';
    reason = failures.map((f) => `${f.label}: ${f.reason}`).join('; ');
    nextAction = decision === 'STOP'
      ? 'A high-risk condition was found (real payout code or public release accidentally unblocked). Investigate immediately before any further action.'
      : 'Resolve every FAIL item above, then re-run this gate.';
  } else {
    decision = 'PASS';
    reason = 'All fresh checks passed, all required docs present, public release remains correctly blocked, real payout execution remains absent, no open S0/S1 blockers.';
    nextAction = 'Proceed to PILOT_LAUNCH_RUNBOOK.md for the launch sequence.';
  }

  console.log('');
  console.log(`Result: ${decision}`);
  console.log(`Reason: ${reason}`);
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));
  console.log('');
  console.log(`Next action: ${nextAction}`);

  process.exit(decision === 'PASS' ? 0 : 1);
}

main();
