'use strict';
/**
 * Check production/staging billing reconciliation readiness.
 *
 * Does NOT connect to production systems.
 * Does NOT require production secrets.
 * Checks whether local smoke evidence and staging prerequisites are documented.
 *
 * Usage:
 *   node scripts/check-billing-reconciliation-readiness.js
 *   node scripts/check-billing-reconciliation-readiness.js --mode internal-beta
 *   node scripts/check-billing-reconciliation-readiness.js --mode public-release
 *   pnpm -w run check:billing:reconciliation
 *
 * Modes:
 *   internal-beta - passes only if: local deterministic billing smoke
 *                   (ledger confidence report) passes, a billing
 *                   reconciliation report exists, a synthetic payout
 *                   simulation report exists, and no unresolved S0/S1
 *                   billing issue is recorded in the monetization risk
 *                   register. Docker-based local smoke and staging/
 *                   production evidence remain WARN-only (not required)
 *                   in this mode.
 *   public-release - all of the above, PLUS staging/production
 *                    reconciliation evidence is required (hard FAIL until
 *                    a real staging run is recorded).
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT       = path.resolve(__dirname, '..');
const TEST_RESULTS    = path.join(REPO_ROOT, 'apps', 'browser-extension', 'test-results', 'local-billing');
const RECON_PLAN      = path.join(REPO_ROOT, 'docs', 'PRODUCTION_BILLING_RECONCILIATION_PLAN.md');
const MATRIX_DOC       = path.join(REPO_ROOT, 'docs', 'PUBLIC_RELEASE_READINESS_MATRIX.md');
const MONETIZATION_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'monetization');
const LEDGER_CONFIDENCE_REPORT = path.join(MONETIZATION_DIR, 'LEDGER_CONFIDENCE_REPORT.md');
const PAYOUT_SIMULATION_REPORT = path.join(MONETIZATION_DIR, 'PAYOUT_SIMULATION_REPORT.md');
const BILLING_RECONCILIATION_REPORT = path.join(MONETIZATION_DIR, 'BILLING_RECONCILIATION_REPORT.md');
const RISK_REGISTER    = path.join(MONETIZATION_DIR, 'MONETIZATION_RISK_REGISTER.md');

const modeIdx = process.argv.indexOf('--mode');
const mode    = modeIdx !== -1 ? process.argv[modeIdx + 1] : 'internal-beta';
if (mode !== 'internal-beta' && mode !== 'public-release') {
  process.stderr.write('[XX] Unknown --mode: ' + mode + '. Use internal-beta or public-release.\n');
  process.exit(2);
}
const isPublicRelease = mode === 'public-release';

let exitCode = 0;

function pass(msg)  { process.stdout.write('[PASS] ' + msg + '\n'); }
function fail(msg)  { process.stderr.write('[FAIL] ' + msg + '\n'); exitCode = 1; }
function warn(msg)  { process.stdout.write('[WARN] ' + msg + '\n'); }
function info(msg)  { process.stdout.write('[--]   ' + msg + '\n'); }
function section(t) { process.stdout.write('\n== ' + t + ' ==\n'); }

function modeGatedFail(msg) {
  if (isPublicRelease) { fail(msg); } else { warn(msg + ' [OK for internal-beta; BLOCKED for production]'); }
}

process.stdout.write('\n');
process.stdout.write('[>>] Billing Reconciliation Readiness Check (' + mode + ')\n');
process.stdout.write('-'.repeat(60) + '\n');

// ---------------------------------------------------------------------------
// Check 1: Local smoke evidence
// ---------------------------------------------------------------------------

section('1. Local Smoke Evidence');

if (!fs.existsSync(TEST_RESULTS)) {
  warn('No local-billing test results directory found at test-results/local-billing/');
  info('  Run pnpm smoke:billing:local to generate impression billing evidence.');
  info('  Run pnpm smoke:billing:click:local to generate click billing evidence.');
} else {
  const files  = fs.readdirSync(TEST_RESULTS).filter(f => f.endsWith('.md'));
  const billingReports = files.filter(f => f.startsWith('billing-ledger-smoke-'));
  const clickReports   = files.filter(f => f.startsWith('click-billing-smoke-'));

  if (billingReports.length > 0) {
    // Read the most recent report and check for PASS
    const latest = path.join(TEST_RESULTS, billingReports.sort().reverse()[0]);
    const content = fs.readFileSync(latest, 'utf8');
    const passed  = content.includes('## Result') && content.includes('\nPASS');
    if (passed) {
      pass('Impression billing smoke: PASS (latest: ' + billingReports[0] + ')');
      // Verify invariant
      if (/Invariant.*PASS/i.test(content) || /developer_credit.*platform_fee.*advertiser_charge/i.test(content)) {
        pass('Billing invariant (developer_credit + platform_fee == advertiser_charge): present in report');
      } else {
        warn('Billing invariant verification not found in latest report');
      }
    } else {
      warn('Impression billing smoke: most recent report is not PASS. Re-run smoke:billing:local.');
    }
  } else {
    warn('No impression billing smoke reports found.');
    info('  Run: pnpm smoke:billing:local');
  }

  if (clickReports.length > 0) {
    const latest  = path.join(TEST_RESULTS, clickReports.sort().reverse()[0]);
    const content = fs.readFileSync(latest, 'utf8');
    const passed  = content.includes('## Result') && content.includes('\nPASS');
    if (passed) {
      pass('Click billing smoke: PASS (latest: ' + clickReports[0] + ')');
    } else {
      warn('Click billing smoke: most recent report is not PASS. Re-run smoke:billing:click:local.');
    }
  } else {
    warn('No click billing smoke reports found.');
    info('  Run: pnpm smoke:billing:click:local');
  }
}

// ---------------------------------------------------------------------------
// Check 1b: Local deterministic billing smoke (ledger confidence report)
// ---------------------------------------------------------------------------

section('1b. Local Deterministic Billing Smoke (Ledger Confidence)');

if (!fs.existsSync(LEDGER_CONFIDENCE_REPORT)) {
  fail('docs/internal-beta/monetization/LEDGER_CONFIDENCE_REPORT.md not found');
  info('  Run: pnpm -w run check:ledger:confidence');
} else {
  const content = fs.readFileSync(LEDGER_CONFIDENCE_REPORT, 'utf8');
  if (/\*\*Result:\*\*\s*PASS/.test(content)) {
    pass('Ledger confidence report exists and reports PASS (deterministic, no Docker required)');
  } else {
    fail('Ledger confidence report exists but does not report PASS -- re-run pnpm -w run check:ledger:confidence');
  }
}

// ---------------------------------------------------------------------------
// Check 1c: Synthetic payout simulation
// ---------------------------------------------------------------------------

section('1c. Synthetic Payout Simulation');

if (!fs.existsSync(PAYOUT_SIMULATION_REPORT)) {
  fail('docs/internal-beta/monetization/PAYOUT_SIMULATION_REPORT.md not found');
  info('  Run: pnpm -w run simulate:payouts');
} else {
  const content = fs.readFileSync(PAYOUT_SIMULATION_REPORT, 'utf8');
  if (/\*\*Invariant.*:\*\*\s*PASS/.test(content)) {
    pass('Payout simulation report exists and reports invariant PASS');
  } else {
    fail('Payout simulation report exists but does not report invariant PASS -- re-run pnpm -w run simulate:payouts');
  }
}

// ---------------------------------------------------------------------------
// Check 1d: Billing reconciliation report + documented limitations
// ---------------------------------------------------------------------------

section('1d. Billing Reconciliation Report');

if (!fs.existsSync(BILLING_RECONCILIATION_REPORT)) {
  fail('docs/internal-beta/monetization/BILLING_RECONCILIATION_REPORT.md not found');
} else {
  pass('docs/internal-beta/monetization/BILLING_RECONCILIATION_REPORT.md exists');
  const content = fs.readFileSync(BILLING_RECONCILIATION_REPORT, 'utf8');
  if (/known limitations/i.test(content)) {
    pass('Billing reconciliation report documents known limitations');
  } else {
    fail('Billing reconciliation report does not contain a "Known limitations" section');
  }
}

// ---------------------------------------------------------------------------
// Check 1e: No unresolved S0/S1 billing issues
// ---------------------------------------------------------------------------

section('1e. Unresolved S0/S1 Billing Issues');

if (!fs.existsSync(RISK_REGISTER)) {
  warn('docs/internal-beta/monetization/MONETIZATION_RISK_REGISTER.md not found yet');
  info('  This check becomes a hard requirement once the risk register exists.');
} else {
  const content = fs.readFileSync(RISK_REGISTER, 'utf8');
  // Look for table rows containing S0/S1 with a status column showing an
  // open/unresolved state. Rows are pipe-delimited markdown table rows.
  const rows = content.split('\n').filter((l) => l.trim().startsWith('|'));
  const openS0S1 = rows.filter((row) => {
    const isS0S1 = /\bS0\b|\bS1\b/.test(row);
    const isOpenStatus = /\b(open|unresolved)\b/i.test(row) && !/\bmitigated\b|\bresolved\b|\bclosed\b/i.test(row);
    return isS0S1 && isOpenStatus;
  });
  if (openS0S1.length === 0) {
    pass('No unresolved S0/S1 billing issue found in the monetization risk register');
  } else {
    fail('Unresolved S0/S1 billing issue(s) found in the monetization risk register: ' + openS0S1.length + ' row(s)');
    openS0S1.forEach((row) => info('  ' + row.trim()));
  }
}

// ---------------------------------------------------------------------------
// Check 2: Staging/production reconciliation plan
// ---------------------------------------------------------------------------

section('2. Staging/Production Reconciliation Plan');

if (!fs.existsSync(RECON_PLAN)) {
  modeGatedFail('PRODUCTION_BILLING_RECONCILIATION_PLAN.md not found');
  info('  Create docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md documenting the staging test plan.');
} else {
  pass('docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md exists');
  const planText = fs.readFileSync(RECON_PLAN, 'utf8');

  const requiredSections = [
    'staging',
    'invariant',
    'fraud',
    'click',
    'viewability',
    'rollback',
    'reconciliation',
  ];
  const missingSections = requiredSections.filter(s => !planText.toLowerCase().includes(s));
  if (missingSections.length === 0) {
    pass('Plan covers all required topics: staging, invariant, fraud, click, viewability, rollback, reconciliation');
  } else {
    warn('Plan may be missing sections: ' + missingSections.join(', '));
  }
}

// ---------------------------------------------------------------------------
// Check 3: Staging evidence
// ---------------------------------------------------------------------------

section('3. Staging/Production Evidence');

// This check can never auto-pass without actual staging evidence.
// It intentionally always gates based on mode.
modeGatedFail('Staging/production billing reconciliation has NOT been run');
info('  This requires a staging or production environment with a billing reconciler.');
info('  Local Docker smoke is verified. Staging smoke is a separate requirement.');
info('  See docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md for the staging checklist.');
info('  This gate will remain FAIL in public-release mode until staging is verified.');

// ---------------------------------------------------------------------------
// Check 4: Readiness matrix document
// ---------------------------------------------------------------------------

section('4. Public Release Readiness Matrix');

if (!fs.existsSync(MATRIX_DOC)) {
  warn('docs/PUBLIC_RELEASE_READINESS_MATRIX.md not found. Create it for a full release status overview.');
} else {
  pass('docs/PUBLIC_RELEASE_READINESS_MATRIX.md exists');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('='.repeat(60) + '\n');
process.stdout.write('Mode: ' + mode + '\n');
if (exitCode === 0) {
  process.stdout.write('[PASS] Billing reconciliation readiness check passed.\n');
  if (!isPublicRelease) {
    process.stdout.write('[WARN] Staging/production reconciliation not yet verified.\n');
    process.stdout.write('       This is acceptable for internal-beta. Required before production.\n');
    process.stdout.write('       See docs/PRODUCTION_BILLING_RECONCILIATION_PLAN.md.\n');
  }
} else {
  process.stderr.write('[FAIL] Billing reconciliation readiness check failed.\n');
  process.stderr.write('       Resolve FAIL items before production billing is claimed verified.\n');
}
process.stdout.write('='.repeat(60) + '\n');

process.exit(exitCode);
