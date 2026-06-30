'use strict';
/**
 * Audit the VS Code extension (VSIX) package for marketplace submission readiness.
 *
 * Checks:
 *   1. .vscodeignore exists and has required exclusions
 *   2. Extension dist/ exists and has compiled output
 *   3. package.json present with required VS Code fields
 *   4. Source maps in extension dist/ (should be excluded for Marketplace)
 *   5. Sensitive content - no .env, no secrets
 *   6. License status
 *   7. Report on what would be included in the VSIX
 *
 * Usage:
 *   node scripts/audit-vsix-package.js
 *   node scripts/audit-vsix-package.js --mode internal-beta
 *   node scripts/audit-vsix-package.js --mode public-release
 *   pnpm -w run package:vscode:audit
 *
 * Modes:
 *   internal-beta  (default) - LICENSE/source-maps are WARN (not blockers)
 *   public-release           - LICENSE/source-maps are FAIL (hard blockers)
 *
 * To inspect VSIX contents after packaging:
 *   vsce package  (creates .vsix)
 *   unzip -l *.vsix
 *   OR: Expand-Archive *.vsix -DestinationPath vsix-contents
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT  = path.resolve(__dirname, '..');
const EXT_DIR    = path.join(REPO_ROOT, 'apps', 'extension');
const VSIGNORE   = path.join(EXT_DIR, '.vscodeignore');
const PKG_JSON   = path.join(EXT_DIR, 'package.json');
const EXT_DIST   = path.join(EXT_DIR, 'dist');

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

// In public-release mode, treat these categories as hard FAIL; otherwise WARN.
function modeGatedFail(msg) {
  if (isPublicRelease) { fail(msg); } else { warn(msg + ' [OK for internal-beta]'); }
}

// ---------------------------------------------------------------------------
// Check 1: Extension directory exists
// ---------------------------------------------------------------------------

section('1. Extension Directory');

if (!fs.existsSync(EXT_DIR)) {
  fail('apps/extension/ directory not found at: ' + EXT_DIR);
  process.exit(1);
}
pass('apps/extension/ exists');

// ---------------------------------------------------------------------------
// Check 2: .vscodeignore
// ---------------------------------------------------------------------------

section('2. .vscodeignore');

const REQUIRED_IGNORES = ['src/**', 'scripts/**', '.turbo/**'];

if (!fs.existsSync(VSIGNORE)) {
  fail('.vscodeignore not found - risk of including source in VSIX');
} else {
  pass('.vscodeignore exists');
  const ignoreContent = fs.readFileSync(VSIGNORE, 'utf8');
  const ignoreLines   = ignoreContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  for (const req of REQUIRED_IGNORES) {
    if (ignoreLines.includes(req)) {
      pass('.vscodeignore has: ' + req);
    } else {
      fail('.vscodeignore missing: ' + req + ' (risk of including in VSIX)');
    }
  }

  info('All exclusions in .vscodeignore:');
  for (const line of ignoreLines) info('  ' + line);
}

// ---------------------------------------------------------------------------
// Check 3: package.json
// ---------------------------------------------------------------------------

section('3. Extension package.json');

if (!fs.existsSync(PKG_JSON)) {
  fail('apps/extension/package.json not found');
} else {
  pass('apps/extension/package.json exists');
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
  } catch (e) {
    fail('package.json invalid JSON: ' + e.message);
    process.exit(1);
  }

  if (pkg.engines && pkg.engines.vscode) {
    pass('engines.vscode: ' + pkg.engines.vscode);
  } else {
    fail('package.json missing engines.vscode - required for VS Code extension');
  }

  if (pkg.publisher) {
    pass('publisher: ' + pkg.publisher);
  } else {
    warn('publisher not set - required for Marketplace submission');
  }

  if (pkg.version) {
    pass('version: ' + pkg.version);
  }

  const licenseField = pkg.license || '';
  if (licenseField === 'UNLICENSED') {
    warn('license: UNLICENSED - must be set before Marketplace submission');
    info('  See docs/LICENSE_DECISION_REQUIRED.md');
  } else if (licenseField) {
    pass('license: ' + licenseField);
  } else {
    warn('license field missing from package.json');
  }

  // Check for activationEvents / contributes (basic VS Code extension fields)
  const hasContributes   = !!pkg.contributes;
  const hasActivation    = !!(pkg.activationEvents || (pkg.main || pkg.module));
  if (hasContributes || hasActivation) {
    pass('VS Code extension fields present (contributes/activationEvents/main)');
  } else {
    warn('No contributes or activationEvents/main in package.json (may be intentional)');
  }
}

// ---------------------------------------------------------------------------
// Check 4: dist/ and source maps
// ---------------------------------------------------------------------------

section('4. Extension dist/');

if (!fs.existsSync(EXT_DIST)) {
  warn('dist/ not found in apps/extension/ - run: pnpm --filter promptprofit build');
} else {
  pass('dist/ exists');
  const distFiles = fs.readdirSync(EXT_DIST);
  info('dist/ contents: ' + distFiles.join(', '));

  // Source maps
  const mapFiles = distFiles.filter(f => f.endsWith('.js.map'));
  if (mapFiles.length > 0) {
    modeGatedFail('Source map(s) in dist/: ' + mapFiles.join(', ') + ' - exclude before Marketplace');
    info('  Add to .vscodeignore: dist/*.map');
  } else {
    pass('No source maps in dist/ (or already excluded)');
  }

  // Main extension file
  const mainJs = distFiles.find(f => f === 'extension.js');
  if (mainJs) {
    const size = Math.round(fs.statSync(path.join(EXT_DIST, mainJs)).size / 1024);
    pass('dist/extension.js (' + size + ' KB)');
  } else {
    warn('dist/extension.js not found - may need to run build');
  }
}

// ---------------------------------------------------------------------------
// Check 5: Sensitive content
// ---------------------------------------------------------------------------

section('5. Sensitive Content');

const sensitivePatterns = [
  { file: '.env', label: '.env file' },
  { file: '.env.local', label: '.env.local file' },
];

for (const { file, label } of sensitivePatterns) {
  const fp = path.join(EXT_DIR, file);
  if (fs.existsSync(fp)) {
    fail(label + ' found in extension directory - must not be packaged');
  }
}

// Check for any files with "secret" or "password" in name
function walkDir(dir, cb) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fp = path.join(dir, entry);
    if (entry === 'node_modules') continue;
    const st = fs.statSync(fp);
    if (st.isDirectory()) walkDir(fp, cb);
    else cb(fp, entry);
  }
}

const secretFiles = [];
walkDir(EXT_DIR, (fp, name) => {
  if (/secret|password|\.key$/i.test(name) && !name.endsWith('.ts') && !name.endsWith('.js')) {
    secretFiles.push(path.relative(EXT_DIR, fp));
  }
});

if (secretFiles.length > 0) {
  for (const f of secretFiles) fail('Potential secret file: ' + f);
} else {
  pass('No secret files found in extension directory');
}

// ---------------------------------------------------------------------------
// Check 6: License
// ---------------------------------------------------------------------------

section('6. License');

const rootLicense = path.join(REPO_ROOT, 'LICENSE');
if (fs.existsSync(rootLicense)) {
  pass('LICENSE file present at repo root');
} else {
  modeGatedFail('No LICENSE file at repo root - required for Marketplace submission');
  info('  See docs/LICENSE_DECISION_REQUIRED.md');
}

// ---------------------------------------------------------------------------
// Check 7: VSIX file (if already packaged)
// ---------------------------------------------------------------------------

section('7. Existing VSIX Files');

const vsixFiles = [];
try {
  for (const f of fs.readdirSync(EXT_DIR)) {
    if (f.endsWith('.vsix')) vsixFiles.push(f);
  }
  // Also check repo root
  for (const f of fs.readdirSync(REPO_ROOT)) {
    if (f.endsWith('.vsix')) vsixFiles.push(f + ' (repo root)');
  }
} catch {}

if (vsixFiles.length === 0) {
  info('No .vsix files found (not yet packaged)');
  info('  To package: cd apps/extension && vsce package');
  info('  Then inspect: unzip -l *.vsix');
} else {
  info('Found VSIX file(s):');
  for (const f of vsixFiles) {
    const fp = f.endsWith('(repo root)') ? path.join(REPO_ROOT, f.split(' ')[0]) : path.join(EXT_DIR, f);
    if (fs.existsSync(fp)) {
      const size = Math.round(fs.statSync(fp).size / 1024);
      pass('  ' + f + ' (' + size + ' KB)');
    } else {
      info('  ' + f);
    }
  }
  info('  Inspect contents: unzip -l <file>.vsix');
  info('  Or on Windows: Expand-Archive <file>.vsix -DestinationPath vsix-contents');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('='.repeat(60) + '\n');
process.stdout.write('Mode: ' + mode + '\n');
if (exitCode === 0) {
  process.stdout.write('[PASS] VS Code extension audit passed.\n');
  if (isPublicRelease) {
    process.stdout.write('       Package meets public-release requirements.\n');
  } else {
    process.stdout.write('       Package is suitable for internal beta distribution.\n');
    process.stdout.write('       Re-run with --mode public-release before Marketplace submission.\n');
  }
} else {
  process.stderr.write('[FAIL] VS Code extension audit found issues.\n');
  process.stderr.write('       Resolve FAIL items before ' + (isPublicRelease ? 'Marketplace submission' : 'public release') + '.\n');
}
process.stdout.write('='.repeat(60) + '\n');

process.exit(exitCode);
