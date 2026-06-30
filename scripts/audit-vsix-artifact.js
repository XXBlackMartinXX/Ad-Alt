'use strict';
/**
 * Audit the actual generated VSIX artifact.
 *
 * VSIX files are ZIP archives. This script reads the VSIX Central Directory
 * to list all contained files and checks for forbidden patterns.
 * No external extraction tool required — reads ZIP binary format.
 *
 * Usage:
 *   node scripts/audit-vsix-artifact.js
 *   node scripts/audit-vsix-artifact.js --vsix path/to/file.vsix
 *   node scripts/audit-vsix-artifact.js --mode public-release
 *   pnpm -w run package:vscode:vsix:audit
 *   pnpm -w run package:vscode:vsix:audit -- --mode public-release
 *
 * Modes:
 *   internal-beta  (default) - maps/LICENSE are WARN
 *   public-release           - maps/LICENSE are FAIL
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXT_DIR   = path.join(REPO_ROOT, 'apps', 'extension');

// Parse flags
const modeIdx = process.argv.indexOf('--mode');
const mode    = modeIdx !== -1 ? process.argv[modeIdx + 1] : 'internal-beta';
if (mode !== 'internal-beta' && mode !== 'public-release') {
  process.stderr.write('[XX] Unknown --mode: ' + mode + '. Use internal-beta or public-release.\n');
  process.exit(2);
}
const isPublicRelease = mode === 'public-release';

const vsixFlagIdx = process.argv.indexOf('--vsix');
let vsixPath = vsixFlagIdx !== -1 ? path.resolve(process.argv[vsixFlagIdx + 1]) : null;

let exitCode = 0;

function pass(msg)  { process.stdout.write('[PASS] ' + msg + '\n'); }
function fail(msg)  { process.stderr.write('[FAIL] ' + msg + '\n'); exitCode = 1; }
function warn(msg)  { process.stdout.write('[WARN] ' + msg + '\n'); }
function info(msg)  { process.stdout.write('[--]   ' + msg + '\n'); }
function section(t) { process.stdout.write('\n== ' + t + ' ==\n'); }

function modeGatedFail(msg) {
  if (isPublicRelease) { fail(msg); } else { warn(msg + ' [OK for internal-beta]'); }
}

// ---------------------------------------------------------------------------
// ZIP Central Directory reader (shared with audit-browser-extension-zip.js)
// ---------------------------------------------------------------------------

function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf[i] === 0x50 && buf[i+1] === 0x4B && buf[i+2] === 0x05 && buf[i+3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Invalid ZIP/VSIX: End of Central Directory not found');

  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdOffset     = buf.readUInt32LE(eocd + 16);

  const entries = [];
  let pos = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > buf.length) break;
    if (buf.readUInt32LE(pos) !== 0x02014B50) break;

    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompSize     = buf.readUInt32LE(pos + 24);
    const fnLen          = buf.readUInt16LE(pos + 28);
    const extraLen       = buf.readUInt16LE(pos + 30);
    const commentLen     = buf.readUInt16LE(pos + 32);

    const name = buf.subarray(pos + 46, pos + 46 + fnLen).toString('utf8');
    entries.push({ name, compressedSize, uncompSize });

    pos += 46 + fnLen + extraLen + commentLen;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Locate VSIX
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('[>>] VSIX Artifact Audit (' + mode + ')\n');
process.stdout.write('-'.repeat(60) + '\n');

section('1. Locate VSIX');

if (!vsixPath) {
  // Search EXT_DIR and REPO_ROOT for .vsix files
  const searchDirs = [EXT_DIR, REPO_ROOT];
  const found = [];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.vsix')) {
          found.push({ filePath: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs });
        }
      }
    } catch { /* ignore */ }
  }

  if (found.length === 0) {
    fail('No .vsix files found in apps/extension/ or repo root.');
    info('  Run: cd apps/extension && vsce package (or pnpm -w run extension:package)');
    process.exit(1);
  }

  found.sort((a, b) => b.mtime - a.mtime);
  vsixPath = found[0].filePath;
  pass('Auto-located latest VSIX: ' + path.basename(vsixPath));
} else {
  if (!fs.existsSync(vsixPath)) {
    fail('Specified VSIX not found: ' + vsixPath);
    process.exit(1);
  }
  pass('Using specified VSIX: ' + path.basename(vsixPath));
}

const vsixStat = fs.statSync(vsixPath);
if (vsixStat.size === 0) {
  fail('VSIX file is empty (0 bytes)');
  process.exit(1);
}
pass('VSIX size: ' + vsixStat.size + ' bytes');

// ---------------------------------------------------------------------------
// Read VSIX entries
// ---------------------------------------------------------------------------

section('2. VSIX Contents');

let entries;
try {
  const buf = fs.readFileSync(vsixPath);
  entries = readZipEntries(buf);
} catch (e) {
  fail('Failed to read VSIX: ' + e.message);
  process.exit(1);
}

pass('VSIX entries: ' + entries.length);
info('Files in VSIX:');
for (const e of entries) {
  const displayName = e.name.replace(/\\/g, '/');
  info('  ' + displayName + ' (' + e.uncompSize + ' bytes)');
}

// ---------------------------------------------------------------------------
// Check 3: Forbidden content
// ---------------------------------------------------------------------------

section('3. Forbidden Content Checks');

const names = entries.map(e => e.name.replace(/\\/g, '/'));

// Source maps
const mapFiles = names.filter(n => n.endsWith('.js.map') || n.endsWith('.ts.map'));
if (mapFiles.length === 0) {
  pass('No source maps in VSIX');
} else {
  modeGatedFail(mapFiles.length + ' source map(s) found in VSIX - exclude before Marketplace:');
  for (const m of mapFiles) info('  ' + m);
  info('  Fix: add "dist/*.map" to apps/extension/.vscodeignore');
}

// TypeScript source files (not .d.ts — those may be intentional)
const rawTsFiles = names.filter(n => /extension\/src\//.test(n) && n.endsWith('.ts') && !n.endsWith('.d.ts'));
if (rawTsFiles.length === 0) {
  pass('No raw TypeScript source (src/) in VSIX');
} else {
  fail(rawTsFiles.length + ' TypeScript source file(s) from src/ in VSIX:');
  for (const t of rawTsFiles) info('  ' + t);
  info('  Fix: ensure "src/**" is in .vscodeignore');
}

// .env files
const envFiles = names.filter(n => /(?:^|[/\\])\.env($|[/\\])/.test(n));
if (envFiles.length === 0) {
  pass('No .env files in VSIX');
} else {
  fail('.env file(s) in VSIX: ' + envFiles.join(', '));
}

// node_modules (vsce normally excludes, but verify)
const nmFiles = names.filter(n => /node_modules/.test(n));
if (nmFiles.length === 0) {
  pass('No node_modules in VSIX');
} else {
  fail('node_modules entries in VSIX: ' + nmFiles.length + ' (should be 0)');
}

// test artifacts
const testArtifacts = names.filter(n =>
  /test-results/.test(n) || /playwright-report/.test(n) || /screenshots/.test(n) ||
  /\/__tests__\//.test(n) || /dist-test/.test(n)
);
if (testArtifacts.length === 0) {
  pass('No test artifacts in VSIX');
} else {
  fail(testArtifacts.length + ' test artifact(s) in VSIX:');
  for (const t of testArtifacts) info('  ' + t);
}

// Turbo cache (should be excluded by .vscodeignore)
const turboFiles = names.filter(n => /\.turbo/.test(n));
if (turboFiles.length === 0) {
  pass('No .turbo/ cache in VSIX');
} else {
  fail('.turbo/ entries in VSIX: ' + turboFiles.length + '. Add ".turbo/**" to .vscodeignore');
}

// Potential secrets
const secretPatterns = names.filter(n =>
  /\.env\b/.test(n) || /credentials/.test(n) ||
  /secret/.test(n.toLowerCase().split('/').pop())
);
if (secretPatterns.length === 0) {
  pass('No potential secret files in VSIX');
} else {
  for (const s of secretPatterns) {
    if (!names.includes(s + '.ts') && !names.includes(s + '.js')) {
      warn('Possible sensitive file in VSIX: ' + s);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: Required files
// ---------------------------------------------------------------------------

section('4. Required Files');

// package.json (VSIX always needs it)
const pkgPresent = names.some(n => /extension\/package\.json$/.test(n) || n === 'extension/package.json');
if (pkgPresent) {
  pass('extension/package.json present in VSIX');
} else {
  // VSIX wraps in 'extension/' by convention
  const altPkgPresent = names.some(n => n.endsWith('package.json'));
  if (altPkgPresent) {
    pass('package.json present in VSIX');
  } else {
    fail('package.json NOT found in VSIX');
  }
}

// dist/extension.js
const mainJsPresent = names.some(n => /dist\/extension\.js$/.test(n));
if (mainJsPresent) {
  pass('dist/extension.js present in VSIX');
} else {
  warn('dist/extension.js not found in VSIX. Run: pnpm --filter promptprofit build first.');
}

// ---------------------------------------------------------------------------
// Check 5: License
// ---------------------------------------------------------------------------

section('5. License');

const rootLicense = path.join(REPO_ROOT, 'LICENSE');
if (fs.existsSync(rootLicense)) {
  pass('LICENSE file present at repo root');
  // Check if it made it into the VSIX (vsce includes LICENSE by default)
  const licenseInVsix = names.some(n => /LICENSE$/.test(n) || /LICENSE\.txt$/.test(n));
  if (licenseInVsix) {
    pass('LICENSE present inside VSIX');
  } else {
    warn('LICENSE file not found inside VSIX (vsce may not have included it)');
  }
} else {
  modeGatedFail('No LICENSE file at repo root - required for VS Code Marketplace');
  info('  See docs/LICENSE_DECISION_REQUIRED.md');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('='.repeat(60) + '\n');
process.stdout.write('Mode:    ' + mode + '\n');
process.stdout.write('VSIX:    ' + path.basename(vsixPath) + '\n');
process.stdout.write('Entries: ' + entries.length + '\n');
if (exitCode === 0) {
  process.stdout.write('[PASS] VSIX artifact audit passed.\n');
  if (isPublicRelease) {
    process.stdout.write('       VSIX meets public-release content requirements.\n');
  } else {
    process.stdout.write('       VSIX is suitable for internal beta distribution.\n');
    process.stdout.write('       Re-run with --mode public-release before Marketplace submission.\n');
  }
} else {
  process.stderr.write('[FAIL] VSIX artifact audit found issues.\n');
  process.stderr.write('       Resolve FAIL items before ' + (isPublicRelease ? 'Marketplace submission' : 'public release') + '.\n');
}
process.stdout.write('='.repeat(60) + '\n');

process.exit(exitCode);
