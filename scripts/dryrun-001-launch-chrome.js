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
// Extension load is proven through FOUR independent layers rather than a
// single CDP service-worker check (an MV3 service worker can legitimately go
// idle and disappear from the CDP target list within seconds, which is not
// proof the extension failed to load):
//   Layer 1 - a CDP target (any type) at chrome-extension://<predicted-id>/...
//             (the ID is precomputed via Chromium's own unpacked-extension-ID
//             algorithm, so this never has to guess which of several targets
//             is ours).
//   Layer 2 - an extensions.settings[<predicted-id>] entry in the profile's
//             own Preferences file, which persists on disk independent of
//             whether any CDP target is currently alive.
//   Layer 3 - a probe navigation to chrome-extension://<id>/manifest.json
//             whose content parses as JSON with name "PromptProfit" (extra
//             confirmation once Layers 1/2 already established registration).
//   Layer 4 - reading extension-owned DOM (#promptprofit-sponsored-banner,
//             #promptprofit-dryrun-diagnostics and their data-* attributes
//             only) on the actual chatgpt.com tab via CDP Runtime.evaluate.
// If automatic --load-extension (mode A, then mode B) doesn't satisfy
// Layers 1/2, an assisted manual-load mode opens chrome://extensions and a
// file browser at the exact extracted folder, copies that path to the
// clipboard, and polls for the same evidence for up to two minutes -- the
// human never has to identify a ZIP or folder themselves.
//
// PRIVACY: This script does not automate ChatGPT login or prompt entry, does
// not read cookies/tokens/localStorage/sessionStorage/clipboard-other-than-
// writing-our-own-path, does not read ChatGPT page content/title/URL, and
// only ever reads the extensions.settings subtree of Preferences (never
// history/cookies/saved-password files, which live elsewhere and are never
// opened).
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
  summarizeCdpTargetsForLog,
  shouldUseNoSandbox,
  shouldUseHeadlessFallback,
  buildChromeLaunchArgs,
  computeUnpackedExtensionId,
  parseExtensionTargetsById,
  findPageTargetExcludingExtensions,
  extractPromptProfitPreferencesEntry,
  evaluatePreferencesEvidence,
  parseManifestProbeResult,
  parseRuntimeDomProbeResult,
  buildRuntimeDomProbeExpression,
  classifyLaunchOutcome,
  waitForCondition,
  parseWindowsRegQueryValue,
  evaluatePolicyBlockLikelihood,
} = require('./lib/chrome-launch-utils.js');
const { evaluateInTarget } = require('./lib/cdp-ws-client.js');

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
function realSleep(ms) {
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

/** PUTs to a local CDP HTTP endpoint (used for /json/new and /json/close -- Chrome requires PUT, not GET, for these). */
function httpPut(port, pathName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathName, method: 'PUT', timeout: timeoutMs, agent: false }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null); // /json/close returns plain text "Target is closing", not JSON -- fine to ignore
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('PUT ' + pathName + ' timed out')));
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// 7b. Windows Chrome/Chromium policy detection (Phase 1) -- best-effort,
//     Windows-only, no-op everywhere else. Only reads the handful of
//     registry value names that can block unpacked/developer-mode extension
//     loading; never touches any other policy or browsing data.
// ---------------------------------------------------------------------------
function checkWindowsExtensionPolicy() {
  if (process.platform !== 'win32') {
    return { checked: false, likely: false, reasons: [] };
  }
  const hives = [
    'HKLM\\Software\\Policies\\Google\\Chrome',
    'HKCU\\Software\\Policies\\Google\\Chrome',
    'HKLM\\Software\\Policies\\Chromium',
    'HKCU\\Software\\Policies\\Chromium',
  ];
  const policyValues = {};
  for (const hive of hives) {
    const res = runCaptured('reg', ['query', hive], {});
    if (!res.ok) continue; // key doesn't exist on this machine -- not an error
    const dev = parseWindowsRegQueryValue(res.stdout, 'DeveloperToolsAvailability');
    if (dev.found) policyValues.developerToolsAvailability = dev.value.replace(/^0x/, '').replace(/^0*/, '') || '0';
    const devMode = parseWindowsRegQueryValue(res.stdout, 'ExtensionDeveloperModeSettings');
    if (devMode.found) policyValues.extensionDeveloperModeSettings = devMode.value.replace(/^0x/, '').replace(/^0*/, '') || '0';
    const blockExt = parseWindowsRegQueryValue(res.stdout, 'BlockExternalExtensions');
    if (blockExt.found) policyValues.blockExternalExtensions = blockExt.value.replace(/^0x/, '').replace(/^0*/, '') || '0';
  }
  const evaluation = evaluatePolicyBlockLikelihood(policyValues);
  return { checked: true, likely: evaluation.likely, reasons: evaluation.reasons, policyValues };
}

// ---------------------------------------------------------------------------
// 7c. Multi-layer extension registration check (Phase 2).
//
// Layer 1 (CDP by predicted ID): looks for ANY chrome-extension://<id>/...
// target, any type -- not just a live service_worker, which can legitimately
// be absent if the MV3 worker has gone idle since it registered.
//
// Layer 2 (profile Preferences): reads ONLY extensions.settings[<id>] out of
// <profile>/Default/Preferences -- never history/cookies/sessions/tokens,
// which live in entirely separate files this script never opens. Persists
// on disk independent of whether any CDP target is currently alive, so it
// catches the exact case Layer 1 alone can miss.
//
// registered = Layer 1 OR Layer 2 evidence (either alone is sufficient;
// together they're deliberately redundant so a transient gap in one doesn't
// produce a false BLOCKED).
// ---------------------------------------------------------------------------
async function checkExtensionRegistered({ port, profileDir, predictedExtensionId, extractDirAbs }) {
  let cdpTargets = [];
  let cdpMatches = [];
  try {
    cdpTargets = await httpGetJson(port, '/json/list', 1500);
    cdpMatches = parseExtensionTargetsById(cdpTargets, predictedExtensionId);
  } catch {
    // CDP not reachable this instant -- Layer 2 doesn't depend on it.
  }

  let prefsEvidence = { ok: false, reasons: ['Preferences file not found yet'], nameMatches: false, pathMatches: false };
  try {
    const prefsPath = path.join(profileDir, 'Default', 'Preferences');
    if (fs.existsSync(prefsPath)) {
      const prefsJson = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      const entry = extractPromptProfitPreferencesEntry(prefsJson, predictedExtensionId);
      prefsEvidence = evaluatePreferencesEvidence(entry, { expectedName: 'PromptProfit', expectedPathAbs: extractDirAbs });
    }
  } catch (e) {
    prefsEvidence = { ok: false, reasons: ['Could not read/parse Preferences: ' + e.message], nameMatches: false, pathMatches: false };
  }

  return {
    registered: cdpMatches.length > 0 || prefsEvidence.ok,
    cdpMatches,
    cdpTargetsSummary: summarizeCdpTargetsForLog(cdpTargets),
    prefsEvidence,
  };
}

/**
 * Layer 3: once registration evidence exists, opens a throwaway tab at
 * chrome-extension://<id>/manifest.json and confirms its content parses as
 * JSON with name === "PromptProfit" -- a resource an unregistered/invalid ID
 * cannot serve (Chrome substitutes an error page whose body is not valid
 * JSON). Purely additional confirmation; never gates registered=true/false
 * on its own, since Layers 1/2 already provide sufficient evidence and a
 * probe tab is one more moving part that can itself fail transiently.
 */
async function probeExtensionManifestResource(port, extensionId) {
  let created;
  try {
    created = await httpPut(port, '/json/new?chrome-extension://' + extensionId + '/manifest.json', 3000);
  } catch (e) {
    return { ok: false, error: 'could not open probe tab: ' + e.message };
  }
  if (!created || !created.id || !created.webSocketDebuggerUrl) {
    return { ok: false, error: 'probe tab creation did not return a usable target' };
  }
  try {
    const expr = "(() => { try { const j = JSON.parse(document.body.innerText || document.body.textContent || ''); return JSON.stringify({ok:true, name: j.name}); } catch (e) { return JSON.stringify({ok:false, error: String(e)}); } })()";
    const raw = await evaluateInTarget(created.webSocketDebuggerUrl, expr, 3000);
    return parseManifestProbeResult(raw, 'PromptProfit');
  } catch (e) {
    return { ok: false, error: 'probe evaluation failed: ' + e.message };
  } finally {
    try { await httpPut(port, '/json/close/' + created.id, 2000); } catch { /* best-effort cleanup */ }
  }
}

// ---------------------------------------------------------------------------
// 7d. Layer 4: runtime verification on chatgpt.com via extension-owned DOM
//     only (Phase 4). Never reads the page target's own url/title (see
//     findPageTargetExcludingExtensions), and the evaluated expression
//     (buildRuntimeDomProbeExpression) touches only the two fixed-id
//     PromptProfit elements and their own data-* attributes.
// ---------------------------------------------------------------------------
async function verifyRuntimeOnChatGpt(port) {
  const probe = await waitForCondition(
    async () => {
      let targets;
      try {
        targets = await httpGetJson(port, '/json/list', 1500);
      } catch {
        return null;
      }
      const pageTarget = findPageTargetExcludingExtensions(targets);
      if (!pageTarget) return null;
      try {
        const raw = await evaluateInTarget(pageTarget.webSocketDebuggerUrl, buildRuntimeDomProbeExpression(), 3000);
        const parsed = parseRuntimeDomProbeResult(raw);
        return parsed.ok ? parsed : (parsed.diagnosticsPresent !== undefined ? { __pending: parsed } : null);
      } catch {
        return null;
      }
    },
    { timeoutMs: 20000, intervalMs: 1000, sleepFn: realSleep },
  );
  if (probe && !probe.__pending) return probe;
  // Timed out without bannerVisible/diagnosticsPresent ever becoming true --
  // return the LAST observed diagnostic snapshot if we have one, so a real
  // failure reason (e.g. kill-switch active) can still be reported instead
  // of a bare "nothing appeared."
  if (probe && probe.__pending) return probe.__pending;
  return { ok: false, bannerVisible: false, diagnosticsPresent: false, statusLabel: null, lastErrorCode: null, error: 'neither banner nor diagnostics panel appeared within 20s' };
}

// ---------------------------------------------------------------------------
// 7e. Launch Chrome in one mode (A or B), returning the process handle plus
//     everything checkExtensionRegistered/verifyRuntimeOnChatGpt need. Does
//     NOT itself decide pass/fail -- that's layered on top in main().
// ---------------------------------------------------------------------------
async function launchChrome(mode, { chromePath, extractDir }) {
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
    return { launchFailed: true, reason: 'spawn-failed', detail: e.message, mode, port, profileDir, args, chromePath, child: null, stderr: '' };
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

  const cdpUp = await waitForCondition(
    async () => {
      if (exited) return { exited: true };
      try {
        return await httpGetJson(port, '/json/version', 1500);
      } catch {
        return null;
      }
    },
    { timeoutMs: 15000, intervalMs: 400, sleepFn: realSleep },
  );

  if (!cdpUp || cdpUp.exited) {
    return {
      launchFailed: true,
      reason: exited ? 'chrome-exited-before-cdp-ready' : 'cdp-endpoint-unreachable',
      detail: exited
        ? `Chrome process exited before its DevTools port became reachable (code=${exitInfo && exitInfo.code} signal=${exitInfo && exitInfo.signal}).`
        : 'Chrome did not open its remote-debugging port within 15s.',
      mode, port, profileDir, args, chromePath, child,
      get stderr() { return stderrTail; },
    };
  }

  return { launchFailed: false, mode, port, profileDir, args, chromePath, child, get stderr() { return stderrTail; } };
}

// The piped stderr stream holds its own open handle independent of the
// child process handle -- child.unref() alone does NOT release it, which
// would otherwise keep this script's own Node process running forever even
// after a real Chrome window is successfully verified and detached for the
// human tester (or after a losing mode-A attempt is discarded). Call this
// once nothing will read launch.stderr again -- either because the process
// is about to be killed, or because we've reached this run's final PASS/
// BLOCKED disposition and are only unref()ing to leave Chrome open.
function releaseChildStdio(launch) {
  if (launch && launch.child && launch.child.stderr) {
    try { launch.child.stderr.destroy(); } catch { /* already gone */ }
  }
}

function killChrome(launch) {
  if (launch && launch.child && !launch.child.killed) {
    try { launch.child.kill(); } catch { /* already gone */ }
  }
  releaseChildStdio(launch);
}

// ---------------------------------------------------------------------------
// 7f. Assisted manual-load mode (Phase 3). Only entered when BOTH automatic
// modes fail to verify registration. Keeps the SAME Chrome instance (mode
// B's) open, opens chrome://extensions in it, opens a file explorer at the
// extracted extension root, copies that exact path to the clipboard (all
// best-effort/non-fatal), then polls the same Layer 1+2 registration check
// every 2s for up to 2 minutes. The user never has to identify a ZIP or
// folder themselves -- the script already extracted it and hands over the
// exact path.
// ---------------------------------------------------------------------------
function openFileExplorer(targetPath) {
  try {
    if (process.platform === 'win32') {
      spawnSync('explorer.exe', [targetPath], { timeout: 3000 });
    } else if (process.platform === 'darwin') {
      spawnSync('open', [targetPath], { timeout: 3000 });
    } else {
      spawnSync('xdg-open', [targetPath], { timeout: 3000 });
    }
    return true;
  } catch {
    return false;
  }
}

function copyPathToClipboard(targetPath) {
  try {
    if (process.platform === 'win32') {
      const res = spawnSync('clip', { input: targetPath, timeout: 3000 });
      return res.status === 0;
    } else if (process.platform === 'darwin') {
      const res = spawnSync('pbcopy', { input: targetPath, timeout: 3000 });
      return res.status === 0;
    } else {
      // Best-effort only -- most headless Linux dev/CI containers have
      // neither xclip nor xsel installed, which is fine; this never blocks.
      const xclip = spawnSync('xclip', ['-selection', 'clipboard'], { input: targetPath, timeout: 2000 });
      if (xclip.status === 0) return true;
      const xsel = spawnSync('xsel', ['--clipboard', '--input'], { input: targetPath, timeout: 2000 });
      return xsel.status === 0;
    }
  } catch {
    return false;
  }
}

async function assistedManualLoadMode({ launch, predictedExtensionId, extractDirAbs }) {
  console.log('');
  console.log('='.repeat(60));
  console.log('  ASSISTED MANUAL-LOAD MODE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Automatic --load-extension did not verify through either mode on this');
  console.log('machine. Chrome is already open with the correct fresh profile -- you do');
  console.log('NOT need to find or unzip anything; the exact folder is opened below.');
  console.log('');

  try {
    await httpPut(launch.port, '/json/new?chrome://extensions/', 3000);
    console.log('Opened chrome://extensions in the same Chrome window.');
  } catch (e) {
    console.log('Could not auto-open chrome://extensions (' + e.message + ') -- open it manually.');
  }

  const explorerOpened = openFileExplorer(extractDirAbs);
  console.log(explorerOpened ? 'Opened a file browser at the extracted extension folder.' : 'Could not auto-open a file browser -- use the path below.');

  const clipboardCopied = copyPathToClipboard(extractDirAbs);
  console.log(clipboardCopied ? 'Copied the extracted extension folder path to the clipboard.' : 'Could not copy to clipboard -- copy the path below manually.');

  console.log('');
  console.log('  1. In chrome://extensions, toggle "Developer mode" ON (top right).');
  console.log('  2. Click "Load unpacked".');
  console.log('  3. Paste/select this EXACT folder:');
  console.log('       ' + extractDirAbs);
  console.log('  4. Confirm "PromptProfit" appears in the list with no error badge.');
  console.log('');
  // Overridable only for this repo's own integration tests, which need to
  // exercise the assisted-mode timeout path without a real 2-minute wait --
  // never set in real dry-run usage, where the human needs the full window.
  const timeoutMs = Number(process.env.PROMPTPROFIT_ASSISTED_POLL_TIMEOUT_MS) || 120000;
  const intervalMs = Number(process.env.PROMPTPROFIT_ASSISTED_POLL_INTERVAL_MS) || 2000;
  console.log(`Polling for up to ${Math.round(timeoutMs / 1000)}s -- this script will detect the load itself`);
  console.log('and continue automatically. You do not need to tell it when you are done.');
  console.log('');

  const result = await waitForCondition(
    async () => {
      const r = await checkExtensionRegistered({
        port: launch.port,
        profileDir: launch.profileDir,
        predictedExtensionId,
        extractDirAbs,
      });
      return r.registered ? r : null;
    },
    { timeoutMs, intervalMs, sleepFn: realSleep, onAttempt: () => process.stdout.write('.') },
  );
  console.log('');

  if (result) {
    console.log('PASS: PromptProfit manually loaded and verified.');
    return result;
  }
  return { registered: false, cdpMatches: [], cdpTargetsSummary: null, prefsEvidence: { ok: false, reasons: [`assisted manual-load mode timed out after ${Math.round(timeoutMs / 1000)}s`] } };
}

// ---------------------------------------------------------------------------
// 7g. Final summary printing (Phase 5 explicit output states)
// ---------------------------------------------------------------------------
function printFinalSummary({ finalState, launch, extractDirAbs, buildInfo, predictedExtensionId, regResult, runtimeResult, manifestProbe, policyCheck, assistedUsed }) {
  console.log('');
  console.log('='.repeat(60));
  console.log('  LAUNCH SUMMARY -- ' + finalState);
  console.log('='.repeat(60));
  console.log('  Chrome executable:        ' + launch.chromePath);
  console.log('  Chrome PID:                ' + (launch.child ? launch.child.pid : '(not started)'));
  console.log('  Remote debugging port:    ' + launch.port);
  console.log('  Chrome profile (fresh):   ' + launch.profileDir);
  console.log('  Extracted extension root: ' + extractDirAbs);
  console.log('  Launch mode used:         ' + launch.mode + (assistedUsed ? ' + assisted manual-load' : ''));
  console.log('  Commit verified:          ' + (buildInfo ? buildInfo.gitCommit : '(unknown)'));
  console.log('  Predicted extension ID:   ' + predictedExtensionId);
  console.log('');
  console.log('  -- Layer 1 (CDP targets by predicted ID) --');
  console.log('  Targets found for this ID: ' + regResult.cdpMatches.length + (regResult.cdpMatches.length ? ' (' + regResult.cdpMatches.map((m) => m.type).join(', ') + ')' : ''));
  if (regResult.cdpTargetsSummary) {
    console.log('  All CDP target counts (by type, no page content read): ' + JSON.stringify(regResult.cdpTargetsSummary.targetCountsByType));
  }
  console.log('');
  console.log('  -- Layer 2 (profile Preferences) --');
  console.log('  Registered in Preferences: ' + (regResult.prefsEvidence.ok ? 'YES' : 'NO'));
  if (!regResult.prefsEvidence.ok && regResult.prefsEvidence.reasons) {
    regResult.prefsEvidence.reasons.forEach((r) => console.log('    - ' + r));
  }
  if (manifestProbe) {
    console.log('');
    console.log('  -- Layer 3 (manifest.json resource probe) --');
    console.log('  Probe result: ' + (manifestProbe.ok ? 'CONFIRMED (name=' + manifestProbe.name + ')' : 'not confirmed (' + (manifestProbe.error || 'unknown') + ')'));
  }
  console.log('');
  console.log('  Extension registered (Layer 1 OR 2): ' + (regResult.registered ? 'YES' : 'NO'));
  console.log('');
  console.log('  -- Layer 4 (runtime DOM on chatgpt.com, extension-owned selectors only) --');
  if (regResult.registered) {
    console.log('  Banner visible:            ' + (runtimeResult.bannerVisible ? 'YES' : 'NO'));
    console.log('  Diagnostics panel present: ' + (runtimeResult.diagnosticsPresent ? 'YES' : 'NO'));
    if (runtimeResult.statusLabel) console.log('  Diagnostics status label:  ' + runtimeResult.statusLabel);
    if (runtimeResult.lastErrorCode) console.log('  Diagnostics last error:    ' + runtimeResult.lastErrorCode);
    if (runtimeResult.error) console.log('  Note:                      ' + runtimeResult.error);
  } else {
    console.log('  Skipped (extension not registered).');
  }
  if (policyCheck.checked) {
    console.log('');
    console.log('  -- Windows policy check --');
    console.log('  Policy block likely: ' + (policyCheck.likely ? 'YES' : 'NO'));
    policyCheck.reasons.forEach((r) => console.log('    - ' + r));
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
      if (blocked) process.exitCode = 1;
      return;
    }

    const extractDirAbs = path.resolve(extractDir);
    const predictedExtensionId = computeUnpackedExtensionId(extractDirAbs);
    console.log('');
    console.log('Predicted extension ID (Chromium unpacked-ID algorithm): ' + predictedExtensionId);

    const policyCheck = checkWindowsExtensionPolicy();

    // Mode A, then B if A doesn't verify registration.
    let launch = await launchChrome('A', { chromePath, extractDir: extractDirAbs });
    let regResult = launch.launchFailed
      ? { registered: false, cdpMatches: [], cdpTargetsSummary: null, prefsEvidence: { ok: false, reasons: [launch.reason + ': ' + launch.detail] } }
      : await checkExtensionRegistered({ port: launch.port, profileDir: launch.profileDir, predictedExtensionId, extractDirAbs });

    // Give mode A a real registration-polling window (not just one snapshot)
    // before declaring it failed -- Preferences can take a moment to flush.
    if (!launch.launchFailed && !regResult.registered) {
      const polled = await waitForCondition(
        async () => {
          const r = await checkExtensionRegistered({ port: launch.port, profileDir: launch.profileDir, predictedExtensionId, extractDirAbs });
          return r.registered ? r : null;
        },
        { timeoutMs: 10000, intervalMs: 1000, sleepFn: realSleep },
      );
      if (polled) regResult = polled;
    }

    if (!regResult.registered) {
      console.log('');
      console.log('WARN  Mode A did not verify registration. Retrying with mode B (--load-extension only)...');
      killChrome(launch);
      const launchB = await launchChrome('B', { chromePath, extractDir: extractDirAbs });
      launch = launchB;
      regResult = launchB.launchFailed
        ? { registered: false, cdpMatches: [], cdpTargetsSummary: null, prefsEvidence: { ok: false, reasons: [launchB.reason + ': ' + launchB.detail] } }
        : await checkExtensionRegistered({ port: launchB.port, profileDir: launchB.profileDir, predictedExtensionId, extractDirAbs });
      if (!launchB.launchFailed && !regResult.registered) {
        const polled = await waitForCondition(
          async () => {
            const r = await checkExtensionRegistered({ port: launchB.port, profileDir: launchB.profileDir, predictedExtensionId, extractDirAbs });
            return r.registered ? r : null;
          },
          { timeoutMs: 10000, intervalMs: 1000, sleepFn: realSleep },
        );
        if (polled) regResult = polled;
      }
    }

    let assistedUsed = false;
    if (!regResult.registered && !launch.launchFailed) {
      assistedUsed = true;
      regResult = await assistedManualLoadMode({ launch, predictedExtensionId, extractDirAbs });
    }

    let manifestProbe = null;
    if (regResult.registered && !launch.launchFailed) {
      manifestProbe = await probeExtensionManifestResource(launch.port, predictedExtensionId);
    }

    let runtimeResult = { ok: false, bannerVisible: false, diagnosticsPresent: false, statusLabel: null, lastErrorCode: null, error: 'skipped -- extension not registered' };
    if (regResult.registered && !launch.launchFailed) {
      runtimeResult = await verifyRuntimeOnChatGpt(launch.port);
    }

    const finalState = classifyLaunchOutcome({
      registered: regResult.registered,
      runtimeVerified: runtimeResult.ok,
      policyBlockLikely: policyCheck.likely,
    });

    printFinalSummary({ finalState, launch, extractDirAbs, buildInfo, predictedExtensionId, regResult, runtimeResult, manifestProbe, policyCheck, assistedUsed });

    if (finalState === 'PASS') {
      releaseChildStdio(launch);
      if (launch.child) launch.child.unref();
      console.log('PASS: PromptProfit extension loaded and runtime verified on chatgpt.com.');
      console.log('');
      console.log('Continue to chatgpt.com in the opened window; the demo banner and');
      console.log('diagnostics panel are already confirmed present.');
      console.log('');
      console.log('This script did not log in, did not enter a prompt, and did not read');
      console.log('any ChatGPT page content. It only read extension-owned DOM attributes,');
      console.log('CDP target metadata, and the extensions.settings entry in Preferences.');
    } else if (finalState === 'BLOCKED_POLICY') {
      if (launch.child && !launch.child.killed) { releaseChildStdio(launch); try { launch.child.unref(); } catch { /* already gone */ } }
      block(
        'BLOCKED_POLICY: a Chrome/Chromium policy on this machine likely blocks\n' +
        'unpacked or developer-mode extension loading.\n' +
        '\n' +
        '  Detected policy signal(s):\n' +
        policyCheck.reasons.map((r) => '    - ' + r).join('\n') + '\n' +
        '\n' +
        '  Remediation:\n' +
        '  1. Ask your IT/security team to allow Developer Mode / unpacked extensions,\n' +
        '     or run this dry-run from a machine without that management policy.\n' +
        '  2. Re-run: pnpm -w run dryrun:001:launch-chrome after the policy is relaxed.'
      );
    } else if (finalState === 'BLOCKED_EXTENSION_LOAD') {
      if (launch.child && !launch.child.killed) { releaseChildStdio(launch); try { launch.child.unref(); } catch { /* already gone */ } }
      block(
        'BLOCKED_EXTENSION_LOAD: Chrome launched (fresh package, fresh profile) but\n' +
        'PromptProfit was never registered -- neither a CDP target nor a Preferences\n' +
        'entry for it ever appeared, including after assisted manual-load polling.\n' +
        '\n' +
        '  Remediation:\n' +
        '  1. Close ALL Chrome windows (including background/hidden instances).\n' +
        '  2. Rerun: pnpm -w run dryrun:001:launch-chrome\n' +
        '  3. If it still fails, load the extension manually:\n' +
        '     - Open chrome://extensions\n' +
        '     - Enable Developer Mode (toggle, top right)\n' +
        '     - Click "Load unpacked"\n' +
        '     - Select EXACTLY this folder: ' + extractDirAbs + '\n' +
        '     - Confirm "PromptProfit" appears in the list with no error badge\n' +
        '  4. If Chrome shows a policy warning or an extension error badge, report its\n' +
        '     exact text -- see BLOCKED_POLICY above if a policy signal was detected.\n' +
        '\n' +
        '  Do NOT proceed to chatgpt.com to look for the banner: without a verified\n' +
        '  extension load, a missing banner tells you nothing.'
      );
    } else {
      // BLOCKED_RUNTIME
      if (launch.child && !launch.child.killed) { releaseChildStdio(launch); try { launch.child.unref(); } catch { /* already gone */ } }
      block(
        'BLOCKED_RUNTIME: PromptProfit IS registered and loaded in Chrome, but its\n' +
        'content script/runtime did not render on chatgpt.com within 20 seconds.\n' +
        '\n' +
        '  Extension-owned diagnostic state observed:\n' +
        '    Banner visible:            ' + (runtimeResult.bannerVisible ? 'YES' : 'NO') + '\n' +
        '    Diagnostics panel present: ' + (runtimeResult.diagnosticsPresent ? 'YES' : 'NO') + '\n' +
        (runtimeResult.statusLabel ? '    Status label:              ' + runtimeResult.statusLabel + '\n' : '') +
        (runtimeResult.lastErrorCode ? '    Last error code:           ' + runtimeResult.lastErrorCode + '\n' : '') +
        '\n' +
        '  This is an extension-load SUCCESS with a runtime-rendering failure -- do not\n' +
        '  re-debug package/load steps. Record the diagnostic state above verbatim in\n' +
        '  TROUBLESHOOTING_BANNER_NOT_OBSERVED.md and continue triage from there.'
      );
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
