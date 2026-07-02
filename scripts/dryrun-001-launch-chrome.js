#!/usr/bin/env node
// DRYRUN-001 Verified Chrome Launcher
//
// Builds a FRESH internal-beta package from the current commit, extracts it
// into a brand-new folder, verifies the extraction is genuinely fresh and
// carries the forced-fallback markers, then launches Chrome with a clean
// profile pointed at that extracted extension and https://chatgpt.com.
//
// This exists specifically so a stale package can never be loaded silently:
// every step that could produce a stale artifact is verified before Chrome
// is ever launched. If any verification fails, Chrome is NOT launched.
//
// PRIVACY: This script does not automate ChatGPT login or prompt entry, does
// not read cookies/tokens/localStorage/sessionStorage, does not read page
// content, and does not inspect browser data. It only opens a browser window
// to a public URL for a human to then manually operate.
//
// Usage: node scripts/dryrun-001-launch-chrome.js
//        pnpm -w run dryrun:001:launch-chrome
'use strict';

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const net = require('net');
const http = require('http');
const {
  parseExtensionServiceWorkerTargets,
  extractExtensionIdFromUrl,
  summarizeCdpTargetsForLog,
  shouldUseNoSandbox,
  shouldUseHeadlessFallback,
  buildChromeLaunchArgs,
} = require('./lib/chrome-launch-utils.js');

const ROOT = path.resolve(__dirname, '..');
const DIST_PACKAGE_DIR = path.join(ROOT, 'apps', 'browser-extension', 'dist-package');
// Session branches are generated fresh per Claude Code session (the name
// changes every time), so this can't be a hardcoded literal -- that would
// make the check fail permanently the moment a new session picks up the
// work. Instead we block only on protected branches, where launching a
// verified Chrome session by accident would be a real mistake.
const PROTECTED_BRANCHES = new Set(['main', 'master']);

let blocked = false;
function block(msg) {
  console.log('');
  console.log('='.repeat(60));
  console.log('BLOCKED -- Chrome will NOT be launched');
  console.log('='.repeat(60));
  console.log('');
  console.log(msg);
  console.log('');
  blocked = true;
}

function runCaptured(command, args, opts = {}) {
  const res = spawnSync(command, args, { cwd: opts.cwd ?? ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: true });
  return { ok: res.status === 0 && !res.error, status: res.status, stdout: res.stdout || '', stderr: res.stderr || '', error: res.error || null };
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader + extractor (no external deps)
// ---------------------------------------------------------------------------
function readZipEntries(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const len = buf.length;
  let eocdOffset = -1;
  for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('EOCD not found -- not a valid ZIP');
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let pos = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (pos < cdEnd) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const compMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const fileNameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.slice(pos + 46, pos + 46 + fileNameLen).toString('utf8');
    entries.push({ name, compMethod, compressedSize, localHeaderOffset });
    pos += 46 + fileNameLen + extraLen + commentLen;
  }
  return { entries, buf };
}

function readZipEntryContent(buf, entry) {
  const local = entry.localHeaderOffset;
  if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid local file header for ' + entry.name);
  const fnLen = buf.readUInt16LE(local + 26);
  const extraLen = buf.readUInt16LE(local + 28);
  const dataStart = local + 30 + fnLen + extraLen;
  const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compMethod === 0) return compressed;
  if (entry.compMethod === 8) return zlib.inflateRawSync(compressed);
  throw new Error('Unsupported compression method ' + entry.compMethod + ' for ' + entry.name);
}

/** Extracts every entry in a ZIP to destDir, recreating directory structure. */
function extractZip(zipPath, destDir) {
  const { entries, buf } = readZipEntries(zipPath);
  for (const entry of entries) {
    const relName = entry.name.replace(/\\/g, '/');
    if (relName.endsWith('/')) continue; // directory entry, nothing to write
    const destPath = path.join(destDir, relName);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const content = readZipEntryContent(buf, entry);
    fs.writeFileSync(destPath, content);
  }
  return entries.length;
}

// ---------------------------------------------------------------------------
console.log('');
console.log('='.repeat(60));
console.log('  DRYRUN-001 VERIFIED CHROME LAUNCHER');
console.log('='.repeat(60));
console.log('');

// ---------------------------------------------------------------------------
// 1. Branch check
// ---------------------------------------------------------------------------
const branchRes = runCaptured('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const branch = branchRes.stdout.trim();
if (!branch || PROTECTED_BRANCHES.has(branch)) {
  block(`Current branch is "${branch || '(detached HEAD)'}", which is a protected branch.\nSwitch to a feature/session branch before launching.`);
}

// ---------------------------------------------------------------------------
// 2. Working tree check -- warn only for docs, otherwise still warn (not block)
// ---------------------------------------------------------------------------
if (!blocked) {
  const statusRes = runCaptured('git', ['status', '--porcelain']);
  const dirtyFiles = statusRes.stdout.trim().split('\n').filter(Boolean).map((l) => l.slice(3).trim());
  if (dirtyFiles.length > 0) {
    const nonDocFiles = dirtyFiles.filter((f) => !f.startsWith('docs/'));
    if (nonDocFiles.length === 0) {
      console.log('WARN  Working tree has uncommitted doc changes only -- continuing.');
      dirtyFiles.forEach((f) => console.log('      ' + f));
    } else {
      console.log('WARN  Working tree has uncommitted NON-DOC changes:');
      nonDocFiles.forEach((f) => console.log('      ' + f));
      console.log('      The package below reflects these uncommitted changes, but');
      console.log('      promptprofit-build-info.json only records the last COMMIT.');
      console.log('      Commit your changes first if you need commit-level traceability.');
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// 3. Build a fresh package (equivalent to package:browser:beta, run directly
//    so this script owns its own freshness window rather than depending on
//    the heavier dryrun-001-prepare.js check chain).
// ---------------------------------------------------------------------------
let zipAbsPath = null;
let buildInfo = null;

if (!blocked) {
  const launchStartTime = Date.now();
  console.log('-- Building fresh internal-beta package --');
  const packageResult = runCaptured('pnpm', ['-w', 'run', 'package:browser:beta']);
  if (packageResult.stdout) process.stdout.write(packageResult.stdout);
  if (packageResult.stderr) process.stderr.write(packageResult.stderr);

  if (!packageResult.ok) {
    block('package:browser:beta FAILED (see output above). No fresh package was produced.');
  } else if (!fs.existsSync(DIST_PACKAGE_DIR)) {
    block('dist-package/ does not exist despite package:browser:beta reporting success.');
  } else {
    const zips = fs.readdirSync(DIST_PACKAGE_DIR)
      .filter((f) => f.endsWith('.zip'))
      .map((f) => {
        const full = path.join(DIST_PACKAGE_DIR, f);
        return { name: f, full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (zips.length === 0) {
      block('No ZIP file found in dist-package/ after packaging.');
    } else if (zips[0].mtime < launchStartTime) {
      block('The newest ZIP is OLDER than this launch run -- packaging did not produce a new file.\n' +
            `  ZIP mtime: ${new Date(zips[0].mtime).toISOString()}\n` +
            `  Launch started: ${new Date(launchStartTime).toISOString()}`);
    } else {
      zipAbsPath = zips[0].full;
      console.log('PASS  Fresh ZIP: ' + zips[0].name);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Verify build-info inside the ZIP before ever extracting/launching
// ---------------------------------------------------------------------------
if (!blocked && zipAbsPath) {
  console.log('');
  console.log('-- Verifying package build-info --');
  try {
    const { entries, buf } = readZipEntries(zipAbsPath);
    const biEntry = entries.find((e) => e.name.replace(/\\/g, '/') === 'promptprofit-build-info.json');
    if (!biEntry) {
      block('promptprofit-build-info.json missing from the fresh ZIP -- cannot verify.');
    } else {
      buildInfo = JSON.parse(readZipEntryContent(buf, biEntry).toString('utf8'));
      const headRes = runCaptured('git', ['rev-parse', 'HEAD']);
      const head = headRes.stdout.trim();
      if (buildInfo.gitCommit !== head) {
        block(`Build-info commit mismatch: package=${buildInfo.gitCommit} HEAD=${head}`);
      } else if (buildInfo.buildMode !== 'internal-beta') {
        block(`Build-info buildMode is "${buildInfo.buildMode}", expected "internal-beta".`);
      } else if (buildInfo.dryRunDemoFallbackExpected !== true) {
        block('Build-info dryRunDemoFallbackExpected is not true.');
      } else {
        console.log('PASS  Build-info verified: commit=' + head.slice(0, 7) + ' buildMode=internal-beta dryRunDemoFallbackExpected=true');
      }
    }
  } catch (e) {
    block('Could not read/verify ZIP build-info: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// 5. Extract to a brand-new unique folder (OS temp dir -- never inside the repo)
// ---------------------------------------------------------------------------
let extractDir = null;
if (!blocked) {
  console.log('');
  console.log('-- Extracting to a fresh folder --');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  extractDir = path.join(os.tmpdir(), 'promptprofit-dryrun-extract-' + stamp + '-' + process.pid);
  try {
    fs.mkdirSync(extractDir, { recursive: true });
    const count = extractZip(zipAbsPath, extractDir);
    console.log(`PASS  Extracted ${count} entries to: ${extractDir}`);
  } catch (e) {
    block('Extraction failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// 6. Verify the extracted folder itself
// ---------------------------------------------------------------------------
// Hoisted so step 7 can build the expected chrome-extension://<id>/<path>
// service worker URL suffix for CDP verification without re-reading/
// re-parsing manifest.json.
let manifestServiceWorkerRelPath = null;

if (!blocked) {
  console.log('');
  console.log('-- Verifying extracted extension --');

  const manifestPath = path.join(extractDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    block('manifest.json NOT found at the extracted root: ' + manifestPath);
  } else {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      block('manifest.json could not be parsed: ' + e.message);
    }

    if (manifest) {
      if (manifest.name === 'PromptProfit') {
        console.log('PASS  manifest.json name is "PromptProfit"');
      } else {
        block(`manifest.json name is "${manifest.name}", expected "PromptProfit".`);
      }

      if (!blocked) {
        const chatgptMatch = (manifest.content_scripts || []).some((cs) =>
          (cs.matches || []).some((m) => m.includes('chatgpt.com')));
        if (chatgptMatch) {
          console.log('PASS  A content script matches chatgpt.com');
        } else {
          block('No content script in manifest.json matches chatgpt.com.');
        }
      }

      if (!blocked) {
        const swRelPath = manifest.background && manifest.background.service_worker;
        manifestServiceWorkerRelPath = swRelPath || null;
        const csRelPaths = (manifest.content_scripts || []).flatMap((cs) => cs.js || []);
        const filesToScan = [swRelPath, ...csRelPaths].filter(Boolean);
        const FALLBACK_MARKERS = ['demo_fallback_active', 'demo_fallback_rendered', 'FORCED_DEMO_MOMENT', 'demo-forced-'];
        let markerFound = false;
        for (const rel of filesToScan) {
          const abs = path.join(extractDir, rel);
          if (!fs.existsSync(abs)) continue;
          const content = fs.readFileSync(abs, 'utf8');
          if (FALLBACK_MARKERS.some((m) => content.includes(m))) {
            markerFound = true;
            break;
          }
        }
        if (markerFound) {
          console.log('PASS  Forced-fallback internal-beta marker found in the bundled JS');
        } else {
          block('No forced-fallback marker found in the bundled service worker/content scripts.\n' +
                '  This package would NOT show the deterministic demo banner. Do not use it.');
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Launch Chrome
// ---------------------------------------------------------------------------
function findChromeExecutable() {
  // Explicit override (also used by e2e/helpers/extension-context.ts for the
  // same reason) -- lets a dev/CI container without a desktop Chrome install
  // point at a bundled Chromium for testing this launcher itself, without
  // affecting real Windows/macOS/Linux desktop behavior below.
  if (process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] && fs.existsSync(process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'])) {
    return process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];
  }
  const candidates = [];
  if (process.platform === 'win32') {
    const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || '';
    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      localAppData ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    );
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else {
    candidates.push('google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium');
    // Fallback used by this repo's own Playwright-based dev/CI containers
    // (see e2e/helpers/extension-context.ts) -- harmless on a real desktop,
    // since this path simply will not exist there.
    candidates.push('/opt/pw-browsers/chromium');
  }
  for (const c of candidates.filter(Boolean)) {
    if (c.includes(path.sep) || c.includes('/') || c.includes('\\')) {
      if (fs.existsSync(c)) return c;
    } else {
      const which = runCaptured(process.platform === 'win32' ? 'where' : 'which', [c]);
      if (which.ok && which.stdout.trim()) return which.stdout.trim().split('\n')[0];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 7a. Small async primitives for CDP polling (no external deps)
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Finds a free local TCP port by letting the OS assign one, then releasing it. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * GETs a JSON endpoint off the local CDP HTTP server. Rejects on any
 * error/timeout. Uses agent:false so the socket is never pooled for
 * keep-alive -- Chrome's DevTools HTTP server keeps connections alive by
 * default, and a pooled socket holds an open handle that would otherwise
 * keep this script's process running indefinitely after Chrome itself is
 * detached and left open for the human tester.
 */
function httpGetJson(port, pathName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathName, timeout: timeoutMs, agent: false }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Could not parse JSON from ' + pathName + ': ' + e.message));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Request to ' + pathName + ' timed out')));
    req.on('error', reject);
  });
}

/** Repeatedly calls fn() until it returns a truthy value or timeoutMs elapses. */
async function waitFor(fn, timeoutMs, intervalMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 7b. Launch Chrome in one mode and verify via CDP that the extension's
//     service worker actually registered. Never inspects "page" targets
//     (see summarizeCdpTargetsForLog) -- only chrome-extension:// service
//     worker targets, which cannot contain ChatGPT content.
// ---------------------------------------------------------------------------
async function launchAndVerify(mode, { chromePath, extractDir, swSuffix }) {
  const port = await getFreePort();
  const profileDir = path.join(os.tmpdir(), 'promptprofit-dryrun-chrome-profile-' + Date.now() + '-' + mode);
  const noSandbox = shouldUseNoSandbox(process.platform, typeof process.getuid === 'function' ? process.getuid() : undefined);
  const headless = shouldUseHeadlessFallback(process.platform, process.env);
  const args = buildChromeLaunchArgs({ profileDir, extractDir, port, mode, noSandbox, headless });

  console.log('');
  console.log(`-- Launching Chrome (mode ${mode}: ${mode === 'A' ? '--disable-extensions-except + --load-extension' : '--load-extension only'}) --`);
  if (noSandbox) console.log('  Note: running as root -- adding --no-sandbox (required for Chromium to start; never added on Windows).');
  if (headless) console.log('  Note: no display detected -- adding --headless=new so Chrome can start at all.');
  console.log('  Executable:            ' + chromePath);
  console.log('  Remote debugging port: ' + port);
  console.log('  Profile (fresh):       ' + profileDir);
  console.log('  Args: ' + args.join(' '));

  let stderrTail = '';
  let exited = false;
  let exitInfo = null;
  let child;
  try {
    child = spawn(chromePath, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    return { ok: false, mode, reason: 'spawn-failed', detail: e.message, port, profileDir, args, chromePath, child: null };
  }
  child.stderr.on('data', (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-8000);
  });
  child.on('exit', (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
  });
  child.on('error', (e) => {
    exited = true;
    exitInfo = { code: null, signal: null, error: e.message };
  });

  // The piped stderr stream holds its own open handle independent of the
  // child process handle -- child.unref() alone does NOT release it, which
  // would otherwise keep this script's own process running forever even
  // after Chrome is successfully detached and left open for the human
  // tester. Once we no longer need to keep reading it (every return path
  // below has already captured whatever tail it needs into stderrTail),
  // destroy it so the stream's handle stops holding the event loop open.
  function releaseStderrHandle() {
    try { child.stderr.destroy(); } catch { /* already gone */ }
  }

  // Wait for the CDP HTTP endpoint to come up -- proves Chrome itself
  // actually started (not just that spawn() didn't throw synchronously).
  let cdpUp = null;
  try {
    cdpUp = await waitFor(async () => {
      if (exited) return { exited: true };
      try {
        return await httpGetJson(port, '/json/version', 1500);
      } catch {
        return null;
      }
    }, 15000, 400);
  } catch {
    cdpUp = null;
  }

  if (!cdpUp || cdpUp.exited) {
    releaseStderrHandle();
    return {
      ok: false,
      mode,
      reason: exited ? 'chrome-exited-before-cdp-ready' : 'cdp-endpoint-unreachable',
      detail: exited
        ? `Chrome process exited before its DevTools port became reachable (code=${exitInfo && exitInfo.code} signal=${exitInfo && exitInfo.signal}).`
        : 'Chrome did not open its remote-debugging port within 15s.',
      stderr: stderrTail,
      pid: child.pid,
      port,
      profileDir,
      args,
      chromePath,
      child,
    };
  }

  // CDP is up -- now poll /json/list for the extension's own service worker
  // target. This is the actual proof the extension loaded, not just that
  // a Chrome window opened.
  let cdpTargetsSummary = null;
  let matches = [];
  const found = await waitFor(async () => {
    let list;
    try {
      list = await httpGetJson(port, '/json/list', 1500);
    } catch {
      return null;
    }
    cdpTargetsSummary = summarizeCdpTargetsForLog(list);
    const m = parseExtensionServiceWorkerTargets(list, swSuffix);
    if (m.length > 0) {
      matches = m;
      return true;
    }
    return null;
  }, 12000, 500);

  if (!found || matches.length === 0) {
    releaseStderrHandle();
    return {
      ok: false,
      mode,
      reason: 'extension-service-worker-not-found',
      detail: 'CDP is reachable but no chrome-extension:// service_worker target matching "' + swSuffix + '" appeared within 12s.',
      cdpTargetsSummary,
      pid: child.pid,
      port,
      profileDir,
      args,
      chromePath,
      child,
    };
  }

  const serviceWorkerUrl = matches[0].url;
  const extensionId = extractExtensionIdFromUrl(serviceWorkerUrl);
  releaseStderrHandle();
  return {
    ok: true,
    mode,
    serviceWorkerUrl,
    extensionId,
    pid: child.pid,
    port,
    profileDir,
    args,
    chromePath,
    child,
  };
}

function printVerificationSummary(result, { extractDir, buildInfo }) {
  console.log('');
  console.log('='.repeat(60));
  console.log('  LAUNCH SUMMARY');
  console.log('='.repeat(60));
  console.log('  Chrome executable:        ' + result.chromePath);
  console.log('  Chrome PID:                ' + (result.pid || '(not started)'));
  console.log('  Remote debugging port:    ' + result.port);
  console.log('  Chrome profile (fresh):   ' + result.profileDir);
  console.log('  Extracted extension root: ' + extractDir);
  console.log('  Launch mode used:         ' + result.mode + (result.mode === 'A' ? ' (--disable-extensions-except + --load-extension)' : ' (--load-extension only)'));
  console.log('  Commit verified:          ' + (buildInfo ? buildInfo.gitCommit : '(unknown)'));
  console.log('  Extension registration verified: ' + (result.ok ? 'YES' : 'NO'));
  console.log('  Verification method:      Chrome DevTools Protocol (GET /json/version, /json/list)');
  if (result.ok) {
    console.log('  Extension ID:             ' + (result.extensionId || '(could not parse from URL)'));
    console.log('  Service worker URL:       ' + result.serviceWorkerUrl);
  } else {
    console.log('  Blocked reason:           ' + result.reason);
    console.log('  Detail:                   ' + result.detail);
    if (result.cdpTargetsSummary) {
      console.log('  CDP targets seen (counts by type, no page content read): ' + JSON.stringify(result.cdpTargetsSummary.targetCountsByType));
    }
    if (result.stderr) {
      console.log('  Chrome stderr (tail):');
      result.stderr.trim().split('\n').slice(-15).forEach((l) => console.log('    ' + l));
    }
  }
  console.log('='.repeat(60));
  console.log('');
}

async function main() {
  if (!blocked) {
    const chromePath = findChromeExecutable();
    if (!chromePath) {
      block('Could not locate a Chrome/Chromium executable on this machine.\n' +
            '  Load the extension manually instead:\n' +
            '  1. Open Chrome -> chrome://extensions -> enable Developer Mode\n' +
            '  2. Click "Load unpacked" and select:\n' +
            '     ' + extractDir);
    } else {
      const swSuffix = '/' + String(manifestServiceWorkerRelPath || 'dist/background/service-worker.js').replace(/^\/+/, '');

      let result = await launchAndVerify('A', { chromePath, extractDir, swSuffix });
      if (!result.ok) {
        console.log('');
        console.log(`WARN  Mode A did not verify (${result.reason}). Retrying with mode B (--load-extension only)...`);
        if (result.child && !result.child.killed) {
          try { result.child.kill(); } catch { /* already gone */ }
        }
        result = await launchAndVerify('B', { chromePath, extractDir, swSuffix });
      }

      printVerificationSummary(result, { extractDir, buildInfo });

      if (result.ok) {
        // Detach so the verified, running Chrome window survives this
        // script's own process exit -- the human tester needs it open.
        result.child.unref();
        console.log('PASS: PromptProfit extension loaded in Chrome.');
        console.log('');
        console.log('Continue to chatgpt.com; banner should appear within 5-10 seconds.');
        console.log('');
        console.log('This script did not log in, did not enter a prompt, and did not');
        console.log('read any page content. It only verified the extension loaded via');
        console.log('the DevTools protocol and opened the browser window.');
      } else {
        // Leave whatever Chrome window mode B produced open (if any) so the
        // manual fallback below can be attempted in it directly.
        if (result.child && !result.child.killed) {
          try { result.child.unref(); } catch { /* already gone */ }
        }
        block(
          'Chrome launched but PromptProfit was not loaded.\n' +
          '\n' +
          '  Remediation:\n' +
          '  1. Close all Chrome windows (including background/hidden instances).\n' +
          '  2. Rerun: pnpm -w run dryrun:001:launch-chrome\n' +
          '  3. If it still fails, load the extension manually:\n' +
          '     - Open chrome://extensions\n' +
          '     - Enable Developer Mode (toggle, top right)\n' +
          '     - Click "Load unpacked"\n' +
          '     - Select EXACTLY this folder: ' + extractDir + '\n' +
          '     - Confirm "PromptProfit" appears in the list with no error badge\n' +
          '     - Then go to https://chatgpt.com\n' +
          '  4. If Chrome shows a policy warning or an extension error badge,\n' +
          '     report its exact text -- this can indicate an enterprise/organization\n' +
          '     policy blocking unpacked or developer-mode extensions on this machine.\n' +
          '\n' +
          '  Do NOT proceed to chatgpt.com to look for the banner: without a verified\n' +
          '  extension load, a missing banner tells you nothing.'
        );
      }
    }
  }

  if (blocked) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('FATAL: launcher crashed: ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
