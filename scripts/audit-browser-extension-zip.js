'use strict';
/**
 * Audit the actual generated browser extension ZIP artifact.
 *
 * Unlike audit-browser-extension-package.js (which inspects dist/), this
 * script reads the ZIP Central Directory directly and checks filenames and
 * sizes. No external extraction tool required — reads ZIP binary format.
 *
 * Usage:
 *   node scripts/audit-browser-extension-zip.js
 *   node scripts/audit-browser-extension-zip.js --zip path/to/file.zip
 *   node scripts/audit-browser-extension-zip.js --mode public-release
 *   pnpm -w run package:browser:zip:audit
 *   pnpm -w run package:browser:zip:audit -- --mode public-release
 *
 * Modes:
 *   internal-beta  (default) - maps/LICENSE/icons are WARN
 *   public-release           - maps/LICENSE/icons are FAIL
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXT_DIR   = path.join(REPO_ROOT, 'apps', 'browser-extension');
const PKG_DIR   = path.join(EXT_DIR, 'dist-package');

// Parse flags
const modeIdx = process.argv.indexOf('--mode');
const mode    = modeIdx !== -1 ? process.argv[modeIdx + 1] : 'internal-beta';
if (mode !== 'internal-beta' && mode !== 'public-release') {
  process.stderr.write('[XX] Unknown --mode: ' + mode + '. Use internal-beta or public-release.\n');
  process.exit(2);
}
const isPublicRelease = mode === 'public-release';

const zipFlagIdx = process.argv.indexOf('--zip');
let zipPath = zipFlagIdx !== -1 ? path.resolve(process.argv[zipFlagIdx + 1]) : null;

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
// ZIP Central Directory reader (pure Node.js, no external library)
// ---------------------------------------------------------------------------

function readZipEntries(buf) {
  // Scan backwards for EOCD signature: PK\x05\x06
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf[i] === 0x50 && buf[i+1] === 0x4B && buf[i+2] === 0x05 && buf[i+3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Invalid ZIP: End of Central Directory not found');

  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdOffset     = buf.readUInt32LE(eocd + 16);

  const entries = [];
  let pos = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > buf.length) break;
    const sig = buf.readUInt32LE(pos);
    if (sig !== 0x02014B50) break; // Central directory header signature

    const compMethod       = buf.readUInt16LE(pos + 10);
    const compressedSize   = buf.readUInt32LE(pos + 20);
    const uncompSize       = buf.readUInt32LE(pos + 24);
    const fnLen            = buf.readUInt16LE(pos + 28);
    const extraLen         = buf.readUInt16LE(pos + 30);
    const commentLen       = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);

    const name = buf.subarray(pos + 46, pos + 46 + fnLen).toString('utf8');
    entries.push({ name, compressedSize, uncompSize, compMethod, localHeaderOffset });

    pos += 46 + fnLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Decompresses a single ZIP entry's file content, given the whole-ZIP buffer
 * and the entry descriptor returned by readZipEntries(). Supports method 0
 * (stored) and method 8 (deflate) -- the only methods the packaging scripts
 * ever produce. Returns a Buffer of the uncompressed content.
 */
function readZipEntryContent(buf, entry) {
  const local = entry.localHeaderOffset;
  if (buf.readUInt32LE(local) !== 0x04034B50) {
    throw new Error('Invalid local file header for ' + entry.name);
  }
  const fnLen    = buf.readUInt16LE(local + 26);
  const extraLen = buf.readUInt16LE(local + 28);
  const dataStart = local + 30 + fnLen + extraLen;
  const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compMethod === 0) return compressed;
  if (entry.compMethod === 8) return zlib.inflateRawSync(compressed);
  throw new Error('Unsupported compression method ' + entry.compMethod + ' for ' + entry.name);
}

// ---------------------------------------------------------------------------
// Locate ZIP
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('[>>] Browser Extension ZIP Artifact Audit (' + mode + ')\n');
process.stdout.write('-'.repeat(60) + '\n');

section('1. Locate ZIP');

if (!zipPath) {
  // Auto-locate: find latest ZIP in dist-package/
  if (!fs.existsSync(PKG_DIR)) {
    fail('dist-package/ directory not found. Run: pnpm package:browser:beta first.');
    process.exit(1);
  }

  const zips = fs.readdirSync(PKG_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(PKG_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (zips.length === 0) {
    fail('No .zip files in dist-package/. Run: pnpm package:browser:beta first.');
    process.exit(1);
  }

  zipPath = path.join(PKG_DIR, zips[0].name);
  pass('Auto-located latest ZIP: ' + zips[0].name);
} else {
  if (!fs.existsSync(zipPath)) {
    fail('Specified ZIP not found: ' + zipPath);
    process.exit(1);
  }
  pass('Using specified ZIP: ' + path.basename(zipPath));
}

const zipStat = fs.statSync(zipPath);
if (zipStat.size === 0) {
  fail('ZIP file is empty (0 bytes)');
  process.exit(1);
}
pass('ZIP size: ' + zipStat.size + ' bytes');

// ---------------------------------------------------------------------------
// Read ZIP entries
// ---------------------------------------------------------------------------

section('2. ZIP Contents');

let entries;
let zipBuf;
try {
  zipBuf = fs.readFileSync(zipPath);
  entries = readZipEntries(zipBuf);
} catch (e) {
  fail('Failed to read ZIP: ' + e.message);
  process.exit(1);
}

pass('ZIP entries: ' + entries.length);
info('Files in ZIP:');
for (const e of entries) {
  // Normalise separators for display
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
  pass('No source maps (.js.map) in ZIP');
} else {
  modeGatedFail(mapFiles.length + ' source map(s) found in ZIP:');
  for (const m of mapFiles) info('  ' + m);
}

// TypeScript source
const tsFiles = names.filter(n => n.endsWith('.ts') && !n.endsWith('.d.ts'));
if (tsFiles.length === 0) {
  pass('No TypeScript source (.ts) in ZIP');
} else {
  fail(tsFiles.length + ' TypeScript source file(s) in ZIP (should not be distributed):');
  for (const t of tsFiles) info('  ' + t);
}

// .env files
const envFiles = names.filter(n => /(?:^|\/|\\)\.env/.test(n));
if (envFiles.length === 0) {
  pass('No .env files in ZIP');
} else {
  fail('.env file(s) found in ZIP: ' + envFiles.join(', '));
}

// Test artifacts
const testArtifacts = names.filter(n =>
  /dist-test/.test(n) || /test-results/.test(n) || /playwright-report/.test(n) ||
  /\/__tests__\//.test(n) || /screenshots/.test(n) || /videos/.test(n) || /traces/.test(n)
);
if (testArtifacts.length === 0) {
  pass('No test artifacts in ZIP');
} else {
  fail(testArtifacts.length + ' test artifact(s) in ZIP:');
  for (const t of testArtifacts) info('  ' + t);
}

// node_modules
const nmFiles = names.filter(n => /node_modules/.test(n));
if (nmFiles.length === 0) {
  pass('No node_modules in ZIP');
} else {
  fail('node_modules entries in ZIP: ' + nmFiles.length);
}

// Local-only scripts (PowerShell scripts should never be in extension ZIP)
const psFiles = names.filter(n => n.endsWith('.ps1') || n.endsWith('.psm1'));
if (psFiles.length === 0) {
  pass('No PowerShell scripts in ZIP');
} else {
  fail('PowerShell script(s) in ZIP: ' + psFiles.join(', '));
}

// Local report files
const reportFiles = names.filter(n => /test-results|local-billing|local-api/.test(n));
if (reportFiles.length === 0) {
  pass('No local report files in ZIP');
} else {
  fail('Local report file(s) in ZIP: ' + reportFiles.join(', '));
}

// ---------------------------------------------------------------------------
// Check 3b: Internal-beta-only source text must not ship in public-release
// ---------------------------------------------------------------------------
// dryRunDemoMode / dry-run diagnostics only exist so an internal-beta tester
// can see the sponsored banner and a live diagnostics panel without any API
// configuration. That source text (and the "internal-beta" build-mode string
// itself) must never reach a public-release artifact -- CANARY 10 requires
// the diagnostics panel be "impossible" in production, not merely inert.
// This is checked by decompressing the actual shipped JS and scanning for
// the literal strings, not just trusting that the build-mode branch is
// unreachable at runtime.

section('3b. Internal-Beta-Only Source Text (public-release gate)');

const FORBIDDEN_INTERNAL_BETA_STRINGS = [
  'internal-beta',
  'dryRunDemoMode',
  'dryRunDiagnosticsEnabled',
  'DEMO_AD_DECISION',
  'promptprofit-dryrun-diagnostics',
  'DryRunDiagnostics',
  'demo_fallback_active',
  'demo_fallback_rendered',
  'FORCED_DEMO_MOMENT',
  'demo-forced-',
  'ensureDryRunDefaults',
];

const jsEntries = entries.filter(e => e.name.replace(/\\/g, '/').endsWith('.js'));
const foundInternalBetaText = [];

for (const entry of jsEntries) {
  let content;
  try {
    content = readZipEntryContent(zipBuf, entry).toString('utf8');
  } catch (e) {
    warn('Could not decompress ' + entry.name + ' for content scan: ' + e.message);
    continue;
  }
  for (const needle of FORBIDDEN_INTERNAL_BETA_STRINGS) {
    if (content.includes(needle)) {
      foundInternalBetaText.push({ file: entry.name.replace(/\\/g, '/'), needle });
    }
  }
}

if (foundInternalBetaText.length === 0) {
  pass('No internal-beta-only source text (demo mode, diagnostics) found in shipped JS');
} else {
  for (const hit of foundInternalBetaText) {
    modeGatedFail('Internal-beta-only string "' + hit.needle + '" found in ' + hit.file);
  }
  if (isPublicRelease) {
    info('  Fix: rebuild with the production build mode before packaging');
    info('  (pnpm -w run package:browser:public rebuilds with --build-mode production');
    info('  and minifies, which strips this source text).');
  }
}

// ---------------------------------------------------------------------------
// Check 4: Required files
// ---------------------------------------------------------------------------

section('4. Required Files');

const manifestPresent = names.some(n => n === 'manifest.json' || n.endsWith('/manifest.json'));
if (manifestPresent) {
  pass('manifest.json present in ZIP');
} else {
  fail('manifest.json NOT found in ZIP');
}

const swPresent = names.some(n => /background\/service-worker\.js$/.test(n));
if (swPresent) {
  pass('background/service-worker.js present in ZIP');
} else {
  fail('background/service-worker.js NOT found in ZIP');
}

const chatgptPresent = names.some(n => /content\/chatgpt\.js$/.test(n));
if (chatgptPresent) {
  pass('content/chatgpt.js present in ZIP');
} else {
  fail('content/chatgpt.js NOT found in ZIP');
}

// ---------------------------------------------------------------------------
// Check 5: Icons
// ---------------------------------------------------------------------------

section('5. Icons');

const iconSizes = [16, 48, 128];
for (const sz of iconSizes) {
  const iconPresent = names.some(n => n.includes('icon' + sz + '.png'));
  if (iconPresent) {
    pass('icons/icon' + sz + '.png present in ZIP');
  } else {
    modeGatedFail('icons/icon' + sz + '.png NOT found in ZIP (required for CWS)');
  }
}

// Check if icons are placeholder (very small file = likely placeholder)
const iconEntries = entries.filter(e => /icon\d+\.png/.test(e.name));
if (iconEntries.length > 0) {
  const largest = Math.max(...iconEntries.map(e => e.uncompSize));
  if (largest < 500) {
    modeGatedFail('Icons appear to be placeholder (largest: ' + largest + ' bytes). Final brand icons required before CWS submission.');
    info('  Run: pnpm icons:create for placeholder, or replace with final brand assets.');
    info('  See docs/PUBLIC_RELEASE_READINESS_MATRIX.md for brand asset requirements.');
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('='.repeat(60) + '\n');
process.stdout.write('Mode:   ' + mode + '\n');
process.stdout.write('ZIP:    ' + path.basename(zipPath) + '\n');
process.stdout.write('Entries: ' + entries.length + '\n');
if (exitCode === 0) {
  process.stdout.write('[PASS] ZIP artifact audit passed.\n');
  if (isPublicRelease) {
    process.stdout.write('       ZIP meets public-release content requirements.\n');
  } else {
    process.stdout.write('       ZIP is suitable for internal beta distribution.\n');
    process.stdout.write('       Re-run with --mode public-release before CWS submission.\n');
  }
} else {
  process.stderr.write('[FAIL] ZIP artifact audit found issues.\n');
  process.stderr.write('       Resolve FAIL items before ' + (isPublicRelease ? 'CWS submission' : 'public release') + '.\n');
}
process.stdout.write('='.repeat(60) + '\n');

process.exit(exitCode);
