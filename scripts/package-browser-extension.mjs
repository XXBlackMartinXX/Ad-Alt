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

import { spawnSync } from 'child_process';
import { existsSync, readdirSync, statSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'fs';
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
const FAILURE_LOG_DIR = join(REPO_ROOT, '.tmp');

// ---------------------------------------------------------------------------
// Captured command execution -- NEVER rely on stdio:'inherit' alone for a
// command whose failure output must be diagnosable. On Windows, pnpm's own
// terminal rendering can truncate/collapse inherited child output on
// failure, leaving only a terse tail (e.g. a bare "Node.js vX.Y.Z" crash
// report line) visible to the user. Capturing stdout/stderr ourselves and
// re-printing them in full, plus writing them to a durable log file, means
// the real root cause is never lost to an upstream renderer.
// ---------------------------------------------------------------------------
function runCaptured(command, args, opts = {}) {
  const res = spawnSync(command, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    // shell:true is required on Windows to resolve .cmd/.ps1 shims (e.g. a
    // bare "node" or "powershell.exe" invocation); spawnSync still keeps
    // stdout/stderr fully separate and capturable, unlike execSync's
    // stdio:'inherit' mode.
    shell: true,
  });
  return {
    status: res.status,
    // spawnSync returns null status (with res.error set) if the command
    // itself could not be spawned at all (e.g. not found on PATH) --
    // treat that as a failure too, not a silent pass.
    ok: res.status === 0 && !res.error,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error ?? null,
    command: [command, ...args].join(' '),
  };
}

/**
 * Prints the full command, exit code, stdout, and stderr for a failed
 * captured command, and writes the same to a durable log file under .tmp/
 * (gitignored). This is what Phase 1 requires: never reduce a packaging
 * failure to a single truncated line.
 */
function reportCommandFailure(label, result) {
  err(`${label} FAILED`);
  err('  Command:   ' + result.command);
  err('  Exit code: ' + (result.status === null ? '(process could not start)' : result.status));
  if (result.error) {
    err('  Spawn error: ' + (result.error.message ?? String(result.error)));
  }
  err('  --- stdout ---');
  for (const line of (result.stdout || '(empty)').split('\n')) err('  ' + line);
  err('  --- stderr ---');
  for (const line of (result.stderr || '(empty)').split('\n')) err('  ' + line);

  try {
    mkdirSync(FAILURE_LOG_DIR, { recursive: true });
    const logPath = join(FAILURE_LOG_DIR, 'package-browser-beta-failure.txt');
    const logContent =
      `Command: ${result.command}\n` +
      `Exit code: ${result.status === null ? '(process could not start)' : result.status}\n` +
      (result.error ? `Spawn error: ${result.error.message ?? String(result.error)}\n` : '') +
      `\n--- stdout ---\n${result.stdout || '(empty)'}\n` +
      `\n--- stderr ---\n${result.stderr || '(empty)'}\n`;
    writeFileSync(logPath, logContent, 'utf8');
    err('  Full output also written to: ' + relative(REPO_ROOT, logPath));
  } catch {
    // Best-effort only -- do not let log-writing itself hide the real error.
  }
}

/**
 * Wraps a filesystem operation that can transiently fail on Windows because
 * another process (antivirus real-time scan, Explorer preview pane, a
 * still-open ZIP viewer, a Chrome instance still holding an old extracted
 * copy open) has a momentary lock on a file in the target directory.
 * Retries a few times with a short delay before giving up with a clear,
 * actionable message instead of an opaque EBUSY/EPERM stack trace.
 */
function withRetry(label, fn, attempts = 5, delayMs = 200) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      fn();
      return;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        const until = Date.now() + delayMs;
        while (Date.now() < until) { /* brief synchronous backoff */ }
      }
    }
  }
  err(`${label} failed after ${attempts} attempts: ${lastErr?.message ?? String(lastErr)}`);
  err('  On Windows this is usually a file lock: close any program that has');
  err('  files under dist-package/ open (Explorer preview pane, an unzip tool,');
  err('  antivirus real-time scan, or a Chrome window still pointed at an');
  err('  extracted copy) and retry.');
  process.exit(1);
}

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

// Diagnostic context printed unconditionally -- if something below fails,
// this is already on screen (and in the failure log) rather than lost.
log('Node: ' + process.version + '  Platform: ' + process.platform + ' (' + process.arch + ')');

// ---------------------------------------------------------------------------
// Rebuild with the correct build mode before packaging
// ---------------------------------------------------------------------------
// This ensures the bundled JS has the right PROMPTPROFIT_BUILD_MODE constant
// baked in (demo mode for internal-beta; dead-code-eliminated for production).
//
// Uses runCaptured() (spawnSync with piped stdio), NOT execSync with
// stdio:'inherit' -- inherited stdio depends on the OUTER runner (pnpm's
// Windows terminal rendering) to faithfully relay every line, which is
// exactly what did not happen when this previously surfaced only a bare
// "Node.js vX.Y.Z" tail with no actual error text. Capturing here guarantees
// the full stdout/stderr is printed and logged regardless of what pnpm does.
const bundleScript = join(EXT_DIR, 'scripts', 'bundle.mjs');
const buildModeArg = isPublicRelease ? 'production' : 'internal-beta';
log('Rebuilding extension with --build-mode ' + buildModeArg + ' ...');
const rebuildResult = runCaptured('node', [bundleScript, '--build-mode', buildModeArg], { cwd: EXT_DIR });
if (!rebuildResult.ok) {
  reportCommandFailure('Rebuild (bundle.mjs --build-mode ' + buildModeArg + ')', rebuildResult);
  err('');
  err('Common causes: esbuild\'s platform-specific native binary (e.g.');
  err('@esbuild/win32-x64) failed to install or was blocked/quarantined by');
  err('antivirus; a stale/partial node_modules from an interrupted install;');
  err('or a genuine TypeScript/bundling error in the source (see stdout above).');
  err('Try: pnpm install --frozen-lockfile, then retry. If the native esbuild');
  err('binary is suspected, try: pnpm --filter @ad-alt/browser-extension exec');
  err('node -e "require(\'esbuild\')" to isolate the failure from packaging.');
  process.exit(1);
}
// Echo the captured output so a successful rebuild still shows normal esbuild
// progress (file sizes etc.), matching the previous stdio:'inherit' behavior.
if (rebuildResult.stdout) process.stdout.write(rebuildResult.stdout);
if (rebuildResult.stderr) process.stderr.write(rebuildResult.stderr);
ok('Extension rebuilt with build mode: ' + buildModeArg);

process.stdout.write('\n');

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
// Wrapped in withRetry(): on Windows, a momentary file lock (antivirus,
// Explorer preview pane, a leftover extracted copy, a prior ZIP still open
// in a viewer) can make rm/mkdir fail transiently. Retrying a few times with
// a clear message beats a raw EBUSY/EPERM crash with no guidance.

withRetry('Removing old dist-package/', () => {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
});
withRetry('Creating dist-package/', () => mkdirSync(OUT_DIR, { recursive: true }));

// Stage files into a temporary subdirectory preserving relative paths.
// Both `zip` and Compress-Archive will zip from this staging dir so the
// layout inside the ZIP matches dist/ exactly regardless of platform.
const stageDir = join(OUT_DIR, 'stage');
withRetry('Creating staging directory', () => mkdirSync(stageDir, { recursive: true }));

for (const f of packageFiles) {
  const rel  = relative(EXT_DIR, f);
  const dest = join(stageDir, rel);
  withRetry('Staging ' + rel, () => {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(f, dest);
  });
}

// ---------------------------------------------------------------------------
// Build-info marker (Phase 3): a small, extension-owned, non-secret JSON
// file at the package root proving which commit/build-mode produced this
// exact artifact. This is what lets downstream tooling (dryrun-001-prepare.js,
// dryrun-001-launch-chrome.js, check-browser-extension-load-folder.js) refuse
// a stale package instead of silently reusing an old ZIP.
// ---------------------------------------------------------------------------
function gitInfo() {
  const commitRes = runCaptured('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT });
  const branchRes = runCaptured('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO_ROOT });
  return {
    commit: commitRes.ok ? commitRes.stdout.trim() : null,
    branch: branchRes.ok ? branchRes.stdout.trim() : null,
  };
}

const { commit: gitCommit, branch: gitBranch } = gitInfo();
const buildInfo = {
  gitCommit: gitCommit,
  buildMode: buildModeArg, // "internal-beta" | "production" -- what esbuild actually baked in
  packageKind: mode,       // "internal-beta" | "public-release" -- CWS-readiness packaging mode
  builtAt: new Date().toISOString(),
  sourceBranch: gitBranch,
  dryRunDemoFallbackExpected: buildModeArg === 'internal-beta',
  generatedBy: 'package-browser-extension.mjs',
};
const buildInfoPath = join(stageDir, 'promptprofit-build-info.json');
withRetry('Writing promptprofit-build-info.json', () => {
  writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n', 'utf8');
});
ok('Build info: commit=' + (gitCommit ? gitCommit.slice(0, 7) : 'unknown') +
   ' buildMode=' + buildInfo.buildMode + ' dryRunDemoFallbackExpected=' + buildInfo.dryRunDemoFallbackExpected);

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
  const psArgs = [
    '-NoProfile', '-NonInteractive', '-Command',
    `Compress-Archive -Path '${stageGlob}' -DestinationPath '${outPath}' -Force`,
  ];
  const psResult = runCaptured('powershell.exe', psArgs);
  if (psResult.ok) {
    if (psResult.stdout) process.stdout.write(psResult.stdout);
    zipSuccess = true;
  } else {
    reportCommandFailure('Compress-Archive', psResult);
    err('If PowerShell execution policy is blocking this, an administrator may');
    err('need to allow script execution, or install `zip` via a package manager');
    err('(e.g. `winget install GnuWin32.Zip`) as a fallback.');
  }
} else {
  // Use `zip` command on Linux/macOS
  const whichResult = runCaptured('which', ['zip']);
  if (!whichResult.ok) {
    err('`zip` command not found. Install zip (e.g. apt install zip) and retry.');
    withRetry('Cleaning up staging directory', () => rmSync(stageDir, { recursive: true, force: true }));
    process.exit(1);
  }
  log('Creating ZIP with: zip command');
  const zipResult = runCaptured('zip', ['-r', zipPath, '.'], { cwd: stageDir });
  if (zipResult.ok) {
    if (zipResult.stdout) process.stdout.write(zipResult.stdout);
    zipSuccess = true;
  } else {
    reportCommandFailure('zip -r', zipResult);
  }
}

// Always clean up staging dir regardless of ZIP success
withRetry('Cleaning up staging directory', () => rmSync(stageDir, { recursive: true, force: true }));

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
