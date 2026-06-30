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
 *   internal-beta  (default) - staging/production absence is WARN
 *   public-release           - staging/production absence is FAIL
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT    = path.resolve(__dirname, '..');
const TEST_RESULTS = path.join(REPO_ROOT, 'apps', 'browser-extension', 'test-results', 'local-billing');
const RECON_PLAN   = path.join(REPO_ROOT, 'docs', 'PRODUCTION_BILLING_RECONCILIATION_PLAN.md');
const MATRIX_DOC   = path.join(REPO_ROOT, 'docs', 'PUBLIC_RELEASE_READINESS_MATRIX.md');

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
