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

if (!blocked) {
  console.log('');
  console.log('-- Launching Chrome --');

  const chromePath = findChromeExecutable();
  if (!chromePath) {
    block('Could not locate a Chrome/Chromium executable on this machine.\n' +
          '  Load the extension manually instead:\n' +
          '  1. Open Chrome -> chrome://extensions -> enable Developer Mode\n' +
          '  2. Click "Load unpacked" and select:\n' +
          '     ' + extractDir);
  } else {
    const profileDir = path.join(os.tmpdir(), 'promptprofit-dryrun-chrome-profile-' + Date.now());
    const args = [
      '--user-data-dir=' + profileDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions-except=' + extractDir,
      '--load-extension=' + extractDir,
      '--new-window',
      'https://chatgpt.com',
    ];

    try {
      const child = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
      child.unref();

      console.log('PASS  Chrome launched.');
      console.log('');
      console.log('='.repeat(60));
      console.log('  LAUNCH SUMMARY');
      console.log('='.repeat(60));
      console.log('  Extracted extension root: ' + extractDir);
      console.log('  Chrome profile (fresh):   ' + profileDir);
      console.log('  Commit verified:          ' + (buildInfo ? buildInfo.gitCommit : '(unknown)'));
      console.log('');
      console.log('  EXPECTED RESULT:');
      console.log('  - A new Chrome window opens to https://chatgpt.com');
      console.log('  - The PromptProfit demo banner should appear in the bottom-right');
      console.log('    corner within ~5-10 seconds, with no login or prompt required.');
      console.log('');
      console.log('  Open chrome://extensions in this same window and confirm');
      console.log('  PromptProfit appears in the list with no error badge.');
      console.log('');
      console.log('  This script did not log in, did not enter a prompt, and did not');
      console.log('  read any page content. It only opened the browser window.');
      console.log('='.repeat(60));
      console.log('');
    } catch (e) {
      block('Failed to launch Chrome: ' + e.message);
    }
  }
}

if (blocked) {
  process.exit(1);
}
process.exit(0);
