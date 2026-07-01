'use strict';
/**
 * Check that the internal beta release packet is complete and not overclaiming.
 *
 * Verifies:
 *   - All required docs exist under docs/internal-beta/
 *   - Docs mention current blockers
 *   - Docs do not claim production-ready, CWS-ready, or Marketplace-ready
 *   - Docs do not contain raw ppft_ API keys
 *   - Docs are ASCII-clean
 *   - INDEX.md links to each required doc
 *
 * Usage:
 *   node scripts/check-internal-beta-packet.js
 *   pnpm -w run check:internal-beta-packet
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT   = path.resolve(__dirname, '..');
const BETA_DIR    = path.join(REPO_ROOT, 'docs', 'internal-beta');

let exitCode = 0;

function pass(msg)  { process.stdout.write('[PASS] ' + msg + '\n'); }
function fail(msg)  { process.stderr.write('[FAIL] ' + msg + '\n'); exitCode = 1; }
function warn(msg)  { process.stdout.write('[WARN] ' + msg + '\n'); }
function info(msg)  { process.stdout.write('[--]   ' + msg + '\n'); }
function section(t) { process.stdout.write('\n== ' + t + ' ==\n'); }

process.stdout.write('\n');
process.stdout.write('[>>] Internal Beta Packet Completeness Check\n');
process.stdout.write('-'.repeat(60) + '\n');

// ---------------------------------------------------------------------------
// 1. Required docs
// ---------------------------------------------------------------------------

section('1. Required Documents');

const REQUIRED_DOCS = [
  'README.md',
  'BETA_TESTER_INSTALLATION_GUIDE.md',
  'BETA_TEST_PLAN.md',
  'RISK_REGISTER.md',
  'STAKEHOLDER_DECISION_CHECKLIST.md',
  'PRIVACY_SECURITY_ONE_PAGER.md',
  'BILLING_VERIFICATION_SUMMARY.md',
  'RELEASE_MANAGER_CHECKLIST.md',
  'PR_DESCRIPTION_TEMPLATE.md',
  'INTERNAL_BETA_RELEASE_NOTES.md',
  'INDEX.md',
];

const existingDocs = [];
for (const doc of REQUIRED_DOCS) {
  const fp = path.join(BETA_DIR, doc);
  if (fs.existsSync(fp)) {
    pass(doc + ' exists');
    existingDocs.push(fp);
  } else {
    fail(doc + ' MISSING from docs/internal-beta/');
  }
}

// ---------------------------------------------------------------------------
// 2. Overclaiming check
// ---------------------------------------------------------------------------

section('2. Overclaiming Detection');

const FORBIDDEN_CLAIMS = [
  { pattern: /production.?ready/i,          label: 'production-ready claim' },
  { pattern: /chrome web store ready/i,     label: 'CWS-ready claim' },
  { pattern: /marketplace ready/i,          label: 'Marketplace-ready claim' },
  { pattern: /verified in production/i,     label: 'production-verified claim' },
  { pattern: /staging.*reconciliation.*pass/i, label: 'staging-reconciliation-pass claim (unverified)' },
];

let overclaimed = false;
for (const fp of existingDocs) {
  const text = fs.readFileSync(fp, 'utf8');
  for (const { pattern, label } of FORBIDDEN_CLAIMS) {
    if (pattern.test(text)) {
      fail(path.basename(fp) + ': contains forbidden claim: ' + label);
      overclaimed = true;
    }
  }
}
if (!overclaimed) {
  pass('No overclaiming detected in any beta packet doc');
}

// ---------------------------------------------------------------------------
// 3. Blocker visibility check
// ---------------------------------------------------------------------------

section('3. Public-Release Blocker Visibility');

const REQUIRED_BLOCKERS = [
  { term: 'LICENSE', label: 'LICENSE blocker' },
  { term: 'icon',    label: 'icons blocker' },
  { term: 'staging', label: 'staging blocker' },
];

// Check README specifically
const readmePath = path.join(BETA_DIR, 'README.md');
if (fs.existsSync(readmePath)) {
  const readmeText = fs.readFileSync(readmePath, 'utf8').toLowerCase();
  for (const { term, label } of REQUIRED_BLOCKERS) {
    if (readmeText.includes(term.toLowerCase())) {
      pass('README.md mentions ' + label);
    } else {
      fail('README.md does not mention ' + label);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Secret scan
// ---------------------------------------------------------------------------

section('4. API Key Scan');

const API_KEY_PATTERN = /ppft_[0-9a-fA-F]{8,}/;
let secretFound = false;
for (const fp of existingDocs) {
  const text = fs.readFileSync(fp, 'utf8');
  if (API_KEY_PATTERN.test(text)) {
    fail(path.basename(fp) + ': contains raw ppft_ API key pattern');
    secretFound = true;
  }
}
if (!secretFound) {
  pass('No raw ppft_ API keys found in beta packet docs');
}

// ---------------------------------------------------------------------------
// 5. ASCII check
// ---------------------------------------------------------------------------

section('5. ASCII Compliance');

let nonAsciiFound = false;
for (const fp of existingDocs) {
  const text = fs.readFileSync(fp, 'utf8');
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) {
      warn(path.basename(fp) + ': contains non-ASCII character at position ' + i + ' (char: ' + text[i] + ')');
      nonAsciiFound = true;
      break;
    }
  }
}
if (!nonAsciiFound) {
  pass('All beta packet docs are ASCII-clean');
}

// ---------------------------------------------------------------------------
// 6. INDEX links
// ---------------------------------------------------------------------------

section('6. INDEX Links');

const indexPath = path.join(BETA_DIR, 'INDEX.md');
if (fs.existsSync(indexPath)) {
  const indexText = fs.readFileSync(indexPath, 'utf8');
  for (const doc of REQUIRED_DOCS.filter(d => d !== 'INDEX.md')) {
    if (indexText.includes(doc)) {
      pass('INDEX.md links to ' + doc);
    } else {
      warn('INDEX.md may be missing link to ' + doc);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('='.repeat(60) + '\n');
if (exitCode === 0) {
  process.stdout.write('[PASS] Internal beta packet is complete and not overclaiming.\n');
  process.stdout.write('       Distribute to internal testers only.\n');
  process.stdout.write('       Public release requires resolving documented blockers.\n');
} else {
  process.stderr.write('[FAIL] Internal beta packet has issues. Resolve FAIL items.\n');
}
process.stdout.write('='.repeat(60) + '\n');

process.exit(exitCode);
