'use strict';
/**
 * Check license decision status for the PromptProfit monorepo.
 *
 * Does NOT make a license choice. Enforces that a decision has been made
 * and documented before public release.
 *
 * Behavior:
 *   --mode internal-beta  (default): WARN if no LICENSE; exit 0 (documented blocker)
 *   --mode public-release           : FAIL if no LICENSE; exit 1
 *
 * If a LICENSE file IS present, verifies:
 *   - package.json "license" fields match the LICENSE content type
 *   - docs/LICENSE_DECISION_REQUIRED.md references the decision
 *   - no contradictory license text in workspace package.json files
 *
 * Usage:
 *   node scripts/check-license-decision.js
 *   node scripts/check-license-decision.js --mode internal-beta
 *   node scripts/check-license-decision.js --mode public-release
 *   pnpm -w run check:license
 *   pnpm -w run check:license -- --mode public-release
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT    = path.resolve(__dirname, '..');
const LICENSE_FILE = path.join(REPO_ROOT, 'LICENSE');
const ROOT_PKG     = path.join(REPO_ROOT, 'package.json');
const DECISION_DOC = path.join(REPO_ROOT, 'docs', 'LICENSE_DECISION_REQUIRED.md');

// Workspace packages that need consistent license field
const WORKSPACE_PACKAGES = [
  path.join(REPO_ROOT, 'package.json'),
  path.join(REPO_ROOT, 'apps', 'browser-extension', 'package.json'),
  path.join(REPO_ROOT, 'apps', 'extension', 'package.json'),
  path.join(REPO_ROOT, 'apps', 'api', 'package.json'),
  path.join(REPO_ROOT, 'apps', 'web', 'package.json'),
];

// Parse --mode flag
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
  if (isPublicRelease) { fail(msg); } else { warn(msg + ' [OK for internal-beta; BLOCKED for public release]'); }
}

process.stdout.write('\n');
process.stdout.write('[>>] License Decision Check (' + mode + ')\n');
process.stdout.write('-'.repeat(60) + '\n');

// ---------------------------------------------------------------------------
// Check 1: LICENSE file presence
// ---------------------------------------------------------------------------

section('1. LICENSE File');

const licenseExists = fs.existsSync(LICENSE_FILE);

if (!licenseExists) {
  modeGatedFail('No LICENSE file at repository root');
  info('  The Chrome Web Store and VS Code Marketplace require a license declaration.');
  info('  See docs/LICENSE_DECISION_REQUIRED.md for the decision matrix and options.');
  info('  Do NOT create a LICENSE file without an explicit stakeholder decision.');
  info('  Options: Proprietary, MIT, Apache-2.0, AGPL-3.0, or Delayed (blocks stores).');

  if (isPublicRelease) {
    process.stdout.write('\n');
    process.stdout.write('='.repeat(60) + '\n');
    process.stdout.write('Mode: ' + mode + '\n');
    process.stderr.write('[FAIL] License check failed: no LICENSE file.\n');
    process.stderr.write('       This blocks Chrome Web Store and VS Code Marketplace submission.\n');
    process.stdout.write('='.repeat(60) + '\n');
    process.exit(1);
  }
} else {
  pass('LICENSE file found at repository root');

  // ---------------------------------------------------------------------------
  // Check 2: LICENSE type detection
  // ---------------------------------------------------------------------------

  section('2. LICENSE Type');

  const licenseText = fs.readFileSync(LICENSE_FILE, 'utf8');
  let detectedType = null;

  if (/MIT License/i.test(licenseText))           detectedType = 'MIT';
  else if (/Apache License.*Version 2/i.test(licenseText)) detectedType = 'Apache-2.0';
  else if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(licenseText)) detectedType = 'AGPL-3.0';
  else if (/GNU GENERAL PUBLIC LICENSE.*Version 2/i.test(licenseText)) detectedType = 'GPL-2.0';
  else if (/GNU GENERAL PUBLIC LICENSE.*Version 3/i.test(licenseText)) detectedType = 'GPL-3.0';
  else if (/All Rights Reserved/i.test(licenseText)) detectedType = 'UNLICENSED';
  else detectedType = 'UNKNOWN';

  if (detectedType === 'UNKNOWN') {
    warn('LICENSE file detected but type is unrecognized. Verify SPDX identifier matches content.');
  } else {
    pass('LICENSE type detected: ' + detectedType);
  }

  // ---------------------------------------------------------------------------
  // Check 3: package.json consistency
  // ---------------------------------------------------------------------------

  section('3. package.json License Consistency');

  const seen = new Set();
  for (const pkgPath of WORKSPACE_PACKAGES) {
    if (!fs.existsSync(pkgPath)) {
      info('  Not found (optional): ' + path.relative(REPO_ROOT, pkgPath));
      continue;
    }

    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      fail('Invalid JSON in ' + path.relative(REPO_ROOT, pkgPath));
      continue;
    }

    const licField = pkg.license || '(not set)';
    seen.add(licField);

    if (!pkg.license) {
      warn(path.relative(REPO_ROOT, pkgPath) + ': license field missing');
    } else if (detectedType && pkg.license !== detectedType && pkg.license !== 'UNLICENSED') {
      fail(path.relative(REPO_ROOT, pkgPath) + ': license "' + pkg.license + '" does not match detected LICENSE type "' + detectedType + '"');
    } else {
      pass(path.relative(REPO_ROOT, pkgPath) + ': license = "' + pkg.license + '"');
    }
  }

  // Check for contradictory values
  const licValues = [...seen].filter(v => v !== '(not set)');
  if (licValues.length > 1) {
    fail('Inconsistent license values across workspace packages: ' + licValues.join(', '));
    info('  All workspace packages should declare the same license identifier.');
  } else if (licValues.length === 1) {
    pass('License field consistent across workspace: ' + licValues[0]);
  }

  // ---------------------------------------------------------------------------
  // Check 4: Decision doc reference
  // ---------------------------------------------------------------------------

  section('4. Decision Documentation');

  if (!fs.existsSync(DECISION_DOC)) {
    warn('docs/LICENSE_DECISION_REQUIRED.md not found. Create it to document the decision.');
  } else {
    const docText = fs.readFileSync(DECISION_DOC, 'utf8');
    // A resolved decision doc should reference the chosen license
    if (detectedType && detectedType !== 'UNKNOWN' && !docText.includes(detectedType)) {
      warn('docs/LICENSE_DECISION_REQUIRED.md does not mention the detected license type "' + detectedType + '"');
    } else {
      pass('docs/LICENSE_DECISION_REQUIRED.md references the license decision');
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('='.repeat(60) + '\n');
process.stdout.write('Mode: ' + mode + '\n');

if (!licenseExists) {
  if (!isPublicRelease) {
    process.stdout.write('[WARN] License decision is BLOCKED-DOCUMENTED for internal-beta.\n');
    process.stdout.write('       Public release requires a LICENSE file and matching package.json fields.\n');
    process.stdout.write('       See docs/LICENSE_DECISION_REQUIRED.md.\n');
  }
} else if (exitCode === 0) {
  process.stdout.write('[PASS] License check passed.\n');
} else {
  process.stderr.write('[FAIL] License check found consistency issues. Resolve before ' +
    (isPublicRelease ? 'public release' : 'store submission') + '.\n');
}
process.stdout.write('='.repeat(60) + '\n');

process.exit(licenseExists ? exitCode : 0);
