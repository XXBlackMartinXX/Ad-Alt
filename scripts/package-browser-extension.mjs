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
 *   - `zip` command must be available (Linux/macOS) OR PowerShell 5.1+ (Windows).
 *
 * On Windows without zip:
 *   Run the printed Compress-Archive command manually in PowerShell.
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync, mkdirSync, rmSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = join(__filename, '..');

const REPO_ROOT = join(__dirname, '..');
const EXT_DIR   = join(REPO_ROOT, 'apps', 'browser-extension');
const DIST_DIR  = join(EXT_DIR, 'dist');
const MANIFEST  = join(EXT_DIR, 'manifest.json');
const OUT_DIR   = join(EXT_DIR, 'dist-package');

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

function log(msg)  { process.stdout.write('[--] ' + msg + '\n'); }
function ok(msg)   { process.stdout.write('[OK] ' + msg + '\n'); }
function warn(msg) { process.stderr.write('[!!] ' + msg + '\n'); }
function err(msg)  { process.stderr.write('[XX] ' + msg + '\n'); }

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
process.stdout.write('[>>] Browser Extension Beta Packager\n');
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

// Include popup.html / options.html if present
for (const extra of ['popup.html', 'options.html']) {
  const fp = join(EXT_DIR, extra);
  if (existsSync(fp)) {
    packageFiles.push(fp);
    ok('Including: ' + extra);
  } else {
    warn('Missing: ' + extra + ' (referenced in manifest.json - required for CWS submission)');
  }
}

// Include icons/ if present
const iconsDir = join(EXT_DIR, 'icons');
if (existsSync(iconsDir)) {
  const iconFiles = collectFiles(iconsDir, EXT_DIR);
  packageFiles.push(...iconFiles);
  ok('Including icons/ (' + iconFiles.length + ' files)');
} else {
  warn('Missing: icons/ directory (icon16.png, icon48.png, icon128.png required for CWS)');
}

process.stdout.write('\n');
ok('Files to package: ' + packageFiles.length);

// ---------------------------------------------------------------------------
// Report manifest references
// ---------------------------------------------------------------------------

process.stdout.write('\n');
log('Checking manifest.json references:');
const require = createRequire(import.meta.url);
const manifest = require(MANIFEST);

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
// Create package output directory and relative file list
// ---------------------------------------------------------------------------

if (existsSync(OUT_DIR)) {
  rmSync(OUT_DIR, { recursive: true, force: true });
}
mkdirSync(OUT_DIR, { recursive: true });

// Build a relative file list for the zip command
const relativeFiles = packageFiles.map(f => relative(EXT_DIR, f));

// ---------------------------------------------------------------------------
// Create ZIP
// ---------------------------------------------------------------------------

process.stdout.write('\n');

const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const zipName    = 'promptprofit-browser-beta-' + timestamp + '.zip';
const zipPath    = join(OUT_DIR, zipName);

// Try using the `zip` command (Linux/macOS/WSL)
let zipSuccess = false;
try {
  execSync('which zip', { stdio: 'ignore' });
  const fileArgs = relativeFiles.map(f => '"' + f + '"').join(' ');
  const zipCmd   = 'cd "' + EXT_DIR + '" && zip -r "' + zipPath + '" ' + fileArgs;
  log('Creating ZIP with: zip command');
  execSync(zipCmd, { stdio: 'inherit', cwd: EXT_DIR });
  zipSuccess = true;
} catch {
  warn('`zip` command not found. Showing manual ZIP command instead.');
}

if (zipSuccess) {
  ok('Package created: ' + zipPath);
} else {
  // Print PowerShell command for Windows users
  process.stdout.write('\n');
  warn('To create the ZIP on Windows PowerShell, run these commands:');
  process.stdout.write('\n');
  process.stdout.write('  $files = @(\n');
  for (const f of relativeFiles) {
    process.stdout.write('    "' + f + '",\n');
  }
  process.stdout.write('  )\n');
  process.stdout.write('  Compress-Archive -Path $files -DestinationPath "' + zipPath + '" -Force\n');
  process.stdout.write('\n');
  warn('ZIP was NOT created (no `zip` command). Run the PowerShell command above.');
  process.exit(1);
}

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
const issues = [];
if (!existsSync(join(EXT_DIR, 'popup.html'))) issues.push('popup.html missing');
if (!existsSync(join(EXT_DIR, 'options.html'))) issues.push('options.html missing');
if (!existsSync(iconsDir)) issues.push('icons/ directory missing');
if (!existsSync(join(REPO_ROOT, 'LICENSE'))) issues.push('No LICENSE file (required for CWS)');

if (issues.length > 0) {
  warn('Issues to resolve before Chrome Web Store submission:');
  for (const issue of issues) warn('  - ' + issue);
  process.stdout.write('\n');
}

ok('Beta package ready for internal distribution (source maps excluded).');
ok('Resolve listed issues before Chrome Web Store submission.');
