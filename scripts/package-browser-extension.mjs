/**
 * Package the browser extension for beta distribution.
 *
 * Creates a ZIP file from the production dist/ directory, excluding source
 * maps (.js.map files) and other development artifacts. Source maps are
 * excluded because they expose the TypeScript source to anyone who installs
 * the extension (reverse-engineering surface).
 *
 * Usage:
 *   node scripts/package-browser-extension.mjs
 *   pnpm -w run package:browser:beta
 *
 * What is included in the ZIP:
 *   manifest.json
 *   dist/background/service-worker.js
 *   dist/content/chatgpt.js
 *   dist/content/claude.js      (stub - not ChatGPT adapter)
 *   dist/content/gemini.js      (stub - not ChatGPT adapter)
 *   popup.html / options.html   (if present)
 *   icons/                      (if present)
 *
 * What is EXCLUDED:
 *   *.js.map                    (source maps - expose TypeScript source)
 *   *.d.ts, *.d.ts.map          (TypeScript declarations - not needed at runtime)
 *   __tests__/                  (compiled test files)
 *   adapters/browser-mock.*     (test-only mock adapter)
 *   dist-test/                  (fixture test build)
 *   src/                        (TypeScript source)
 *   node_modules/
 *   test-results/
 *   playwright-report/
 *
 * Prerequisites:
 *   - Run `pnpm build` (production build) before packaging.
 *   - Linux/macOS: `zip` command must be available (apt install zip / brew install zip).
 *   - Windows: PowerShell 5.1+ (Compress-Archive is auto-executed; no manual step).
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { join, relative, extname, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = join(__filename, '..');

const REPO_ROOT = join(__dirname, '..');
const EXT_DIR   = join(REPO_ROOT, 'apps', 'browser-extension');
const DIST_DIR  = join(EXT_DIR, 'dist');
const MANIFEST  = join(EXT_DIR, 'manifest.json');
const OUT_DIR   = join(EXT_DIR, 'dist-package');

const modeIdx     = process.argv.indexOf('--mode');
const mode        = modeIdx !== -1 ? process.argv[modeIdx + 1] : 'internal-beta';
if (mode !== 'internal-beta' && mode !== 'public-release') {
  process.stderr.write('[XX] Unknown --mode: ' + mode + '. Use internal-beta or public-release.\n');
  process.exit(2);
}
const isPublicRelease = mode === 'public-release';

/** Extensions to exclude from the ZIP. */
const EXCLUDED_EXTENSIONS = new Set(['.map', '.ts']);

/** File name patterns to exclude. */
const EXCLUDED_PATTERNS = [
  /\.d\.ts$/,
  /\.d\.ts\.map$/,
  /browser-mock\./,
];

/** Directory names to exclude entirely. */
const EXCLUDED_DIRS = new Set(['__tests__']);

let exitCode = 0;

function log(msg)  { process.stdout.write('[--] ' + msg + '\n'); }
function ok(msg)   { process.stdout.write('[OK] ' + msg + '\n'); }
function warn(msg) { process.stderr.write('[!!] ' + msg + '\n'); }
function err(msg)  { process.stderr.write('[XX] ' + msg + '\n'); }

function modeGatedFail(msg) {
  if (isPublicRelease) {
    process.stderr.write('[FAIL] ' + msg + '\n');
    exitCode = 1;
  } else {
    process.stderr.write('[!!] ' + msg + ' [OK for internal-beta; BLOCKED for public release]\n');
  }
}

function isExcluded(filePath) {
  const ext  = extname(filePath);
  const name = basename(filePath);

  if (EXCLUDED_EXTENSIONS.has(ext)) return true;
  for (const pat of EXCLUDED_PATTERNS) {
    if (pat.test(name)) return true;
  }
  return false;
}

/** Walk a directory and collect all files that should be included. */
function collectFiles(dir, baseDir) {
  const results = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);

    if (st.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) {
        log('  [EXCLUDE-DIR] ' + relative(baseDir, fullPath));
        continue;
      }
      results.push(...collectFiles(fullPath, baseDir));
    } else {
      if (isExcluded(fullPath)) {
        log('  [EXCLUDE] ' + relative(baseDir, fullPath));
      } else {
        results.push(fullPath);
        log('  [include] ' + relative(baseDir, fullPath));
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('[>>] Browser Extension Packager (' + mode + ')\n');
process.stdout.write('-'.repeat(60) + '\n');

if (!existsSync(DIST_DIR)) {
  err('dist/ directory not found at: ' + DIST_DIR);
  err('Run: pnpm --filter @ad-alt/browser-extension build');
  process.exit(2);
}

if (!existsSync(MANIFEST)) {
  err('manifest.json not found at: ' + MANIFEST);
  process.exit(2);
}

// Load manifest early so htmlRefs and reference checks can both use it
const require  = createRequire(import.meta.url);
const manifest = require(MANIFEST);

// Check for source maps in dist/ and report them
const mapFiles = [];
function findMaps(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const fp = join(dir, entry);
    if (statSync(fp).isDirectory()) findMaps(fp);
    else if (entry.endsWith('.js.map')) mapFiles.push(relative(EXT_DIR, fp));
  }
}
findMaps(DIST_DIR);

if (mapFiles.length > 0) {
  warn('Found ' + mapFiles.length + ' source map file(s) in dist/ - they will be EXCLUDED from the package:');
  for (const m of mapFiles) warn('  ' + m);
} else {
  ok('No source maps in dist/ (or sourcemap:false was set in esbuild)');
}

// ---------------------------------------------------------------------------
// Collect files
// ---------------------------------------------------------------------------

process.stdout.write('\n');
log('Collecting files from dist/ (excluding source maps and test artifacts):');
const distFiles = collectFiles(DIST_DIR, EXT_DIR);

// Include manifest.json
const packageFiles = [MANIFEST, ...distFiles];

// Include HTML pages declared in manifest (popup, options_ui) if present
const htmlRefs = [];
if (manifest.action && manifest.action.default_popup) htmlRefs.push(manifest.action.default_popup);
if (manifest.options_ui && manifest.options_ui.page)  htmlRefs.push(manifest.options_ui.page);
for (const ref of htmlRefs) {
  const fp = join(EXT_DIR, ref);
  if (existsSync(fp)) {
    packageFiles.push(fp);
    ok('Including: ' + ref);
  } else {
    warn('Missing: ' + ref + ' (declared in manifest.json but file not found)');
  }
}

// Include icons/ if present
const iconsDir = join(EXT_DIR, 'icons');
if (existsSync(iconsDir)) {
  const iconFiles = collectFiles(iconsDir, EXT_DIR);
  packageFiles.push(...iconFiles);
  ok('Including icons/ (' + iconFiles.length + ' files)');
} else {
  modeGatedFail('icons/ directory missing (icon16.png, icon48.png, icon128.png required for CWS)');
}

process.stdout.write('\n');
ok('Files to package: ' + packageFiles.length);

// ---------------------------------------------------------------------------
// Report manifest references
// ---------------------------------------------------------------------------

process.stdout.write('\n');
log('Checking manifest.json references:');

const referencedFiles = [];
if (manifest.background && manifest.background.service_worker) {
  referencedFiles.push(manifest.background.service_worker);
}
if (manifest.content_scripts) {
  for (const cs of manifest.content_scripts) {
    if (cs.js) referencedFiles.push(...cs.js);
  }
}
if (manifest.action && manifest.action.default_popup) {
  referencedFiles.push(manifest.action.default_popup);
}

for (const ref of referencedFiles) {
  const fp = join(EXT_DIR, ref);
  if (existsSync(fp)) {
    ok('  [OK]      ' + ref);
  } else {
    warn('  [MISSING] ' + ref + ' (referenced in manifest.json but not found)');
  }
}

// ---------------------------------------------------------------------------
// Create package output directory and staging directory
// ---------------------------------------------------------------------------

if (existsSync(OUT_DIR)) {
  rmSync(OUT_DIR, { recursive: true, force: true });
}
mkdirSync(OUT_DIR, { recursive: true });

// Stage files into a temporary subdirectory preserving relative paths.
// Both `zip` and Compress-Archive will zip from this staging dir so the
// layout inside the ZIP matches dist/ exactly regardless of platform.
const stageDir = join(OUT_DIR, 'stage');
mkdirSync(stageDir, { recursive: true });

for (const f of packageFiles) {
  const rel  = relative(EXT_DIR, f);
  const dest = join(stageDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(f, dest);
}

// ---------------------------------------------------------------------------
// Create ZIP
// ---------------------------------------------------------------------------

process.stdout.write('\n');

const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const zipName    = 'promptprofit-browser-beta-' + timestamp + '.zip';
const zipPath    = join(OUT_DIR, zipName);

let zipSuccess = false;

if (process.platform === 'win32') {
  // Auto-execute PowerShell Compress-Archive on Windows (no `zip` needed)
  log('Creating ZIP with PowerShell Compress-Archive (Windows)');
  const stageGlob = stageDir.replace(/'/g, "''") + '\\*';
  const outPath   = zipPath.replace(/'/g, "''");
  const psCmd     = `powershell.exe -NoProfile -NonInteractive -Command "Compress-Archive -Path '${stageGlob}' -DestinationPath '${outPath}' -Force"`;
  try {
    execSync(psCmd, { stdio: 'inherit' });
    zipSuccess = true;
  } catch (e) {
    err('Compress-Archive failed: ' + e.message);
  }
} else {
  // Use `zip` command on Linux/macOS
  try {
    execSync('which zip', { stdio: 'ignore' });
    const zipCmd = 'cd "' + stageDir + '" && zip -r "' + zipPath + '" .';
    log('Creating ZIP with: zip command');
    execSync(zipCmd, { stdio: 'inherit' });
    zipSuccess = true;
  } catch {
    err('`zip` command not found. Install zip (e.g. apt install zip) and retry.');
    rmSync(stageDir, { recursive: true, force: true });
    process.exit(1);
  }
}

// Always clean up staging dir regardless of ZIP success
rmSync(stageDir, { recursive: true, force: true });

if (!zipSuccess) {
  err('ZIP creation failed.');
  process.exit(1);
}

// Verify ZIP was actually created and is non-empty (CANARY 11)
if (!existsSync(zipPath)) {
  err('FATAL: ZIP file was not created at: ' + zipPath);
  process.exit(1);
}
const zipSize = statSync(zipPath).size;
if (zipSize === 0) {
  err('FATAL: ZIP file is empty: ' + zipPath);
  process.exit(1);
}

ok('Package created: ' + zipPath + ' (' + zipSize + ' bytes)');

// ---------------------------------------------------------------------------
// Report summary
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('='.repeat(60) + '\n');
process.stdout.write('  Package: ' + zipName + '\n');
process.stdout.write('  Files:   ' + packageFiles.length + '\n');
process.stdout.write('  Maps:    ' + mapFiles.length + ' excluded\n');
process.stdout.write('='.repeat(60) + '\n');
process.stdout.write('\n');

// Known issues summary
const knownIssues = [];
// Check for HTML pages that are declared in manifest but still missing
for (const ref of htmlRefs) {
  if (!existsSync(join(EXT_DIR, ref))) knownIssues.push(ref + ' missing (declared in manifest.json)');
}
if (!existsSync(iconsDir)) knownIssues.push('icons/ directory missing — run: pnpm icons:create');
if (!existsSync(join(REPO_ROOT, 'LICENSE'))) {
  if (isPublicRelease) {
    process.stderr.write('[FAIL] No LICENSE file at repository root (required for CWS / Marketplace)\n');
    exitCode = 1;
  } else {
    knownIssues.push('No LICENSE file (required for CWS — see docs/LICENSE_DECISION_REQUIRED.md)');
  }
}

if (knownIssues.length > 0) {
  warn('Issues to resolve before Chrome Web Store submission:');
  for (const issue of knownIssues) warn('  - ' + issue);
  process.stdout.write('\n');
}

process.stdout.write('='.repeat(60) + '\n');
process.stdout.write('Mode: ' + mode + '\n');
if (exitCode === 0) {
  ok('Package ready for ' + (isPublicRelease ? 'public release' : 'internal beta') + ' distribution (source maps excluded).');
  if (!isPublicRelease) ok('Re-run with --mode public-release before Chrome Web Store submission.');
} else {
  process.stderr.write('[FAIL] Packaging check failed. Resolve FAIL items before public release.\n');
}
process.stdout.write('='.repeat(60) + '\n');
process.exit(exitCode);
