#!/usr/bin/env node
// Repo-side diagnostic for DRYRUN-001 setup issues.
// Checks branch, commit, ZIP artifact, dist/ folder, and expected files.
// Prints the exact Chrome load path and re-extract commands.
// Does NOT connect to the internet, ChatGPT, or any external service.
// Usage: node scripts/dryrun-001-diagnose.js
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BROWSER_EXT_DIR = path.join(ROOT, 'apps', 'browser-extension');
const DIST_DIR = path.join(BROWSER_EXT_DIR, 'dist');
const DIST_PACKAGE_DIR = path.join(BROWSER_EXT_DIR, 'dist-package');
const EXPECTED_BRANCH = 'claude/ecstatic-maxwell-h0d8d8';

let passed = 0;
let warned = 0;
let failed = 0;

function pass(msg) { console.log(`  PASS  ${msg}`); passed++; }
function warn(msg) { console.log(`  WARN  ${msg}`); warned++; }
function fail(msg) { console.log(`  FAIL  ${msg}`); failed++; }

function runCmd(cmd) {
  return spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8' });
}

console.log('');
console.log('=== dryrun-001-diagnose ===');
console.log('Repo-side only. Does NOT connect to ChatGPT or any external service.');
console.log('');

// -----------------------------------------------------------------------
// Section 1: Branch and commit
// -----------------------------------------------------------------------
console.log('-- Section 1: Branch and commit --');

const branchRes = runCmd('git branch --show-current');
const branch = (branchRes.stdout || '').trim();
if (branch === EXPECTED_BRANCH) {
  pass(`Branch: ${branch}`);
} else if (branch) {
  fail(`Branch mismatch. Expected: ${EXPECTED_BRANCH}  Got: ${branch}`);
} else {
  warn('Could not detect branch (detached HEAD?)');
}

const commitRes = runCmd('git rev-parse --short HEAD');
const commit = (commitRes.stdout || '').trim();
if (commit) {
  pass(`HEAD commit: ${commit}`);
} else {
  warn('Could not read HEAD commit');
}

const statusRes = runCmd('git status --short');
const dirty = (statusRes.stdout || '').trim();
if (!dirty) {
  pass('Working tree: clean');
} else {
  warn('Working tree has uncommitted changes (this is OK for diagnosis)');
}

console.log('');

// -----------------------------------------------------------------------
// Section 2: Extension source files
// -----------------------------------------------------------------------
console.log('-- Section 2: Extension source files --');

// manifest.json and icons live in the browser-extension root (not dist/)
// Compiled JS files go to dist/background/ and dist/content/
const manifestPath = path.join(BROWSER_EXT_DIR, 'manifest.json');
const swPath = path.join(DIST_DIR, 'background', 'service-worker.js');
const contentPath = path.join(DIST_DIR, 'content', 'chatgpt.js');
const icon16Path = path.join(BROWSER_EXT_DIR, 'icons', 'icon16.png');
const icon48Path = path.join(BROWSER_EXT_DIR, 'icons', 'icon48.png');
const icon128Path = path.join(BROWSER_EXT_DIR, 'icons', 'icon128.png');

if (!fs.existsSync(DIST_DIR)) {
  fail('dist/ folder does NOT exist -- run: pnpm -r build');
} else {
  pass('dist/ folder exists (compiled JS files)');

  if (fs.existsSync(manifestPath)) {
    pass('manifest.json present (apps/browser-extension/manifest.json)');

    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { manifest = null; }

    if (manifest) {
      pass('manifest.json is valid JSON');

      const swEntry = manifest.background && manifest.background.service_worker;
      if (swEntry) {
        pass(`manifest.json service_worker: ${swEntry}`);
      } else {
        fail('manifest.json missing background.service_worker -- extension may not load');
      }

      const csEntries = manifest.content_scripts || [];
      const hasChatGPT = csEntries.some(cs =>
        (cs.matches || []).some(m => m.includes('chatgpt.com')) &&
        (cs.js || []).length > 0
      );
      if (hasChatGPT) {
        pass('manifest.json has content_scripts matching chatgpt.com');
      } else {
        fail('manifest.json has NO content_scripts matching chatgpt.com -- banner will never appear');
      }
    } else {
      fail('manifest.json is not valid JSON -- run: pnpm -r build');
    }
  } else {
    fail('manifest.json MISSING from apps/browser-extension/ -- this is a critical file');
  }

  if (fs.existsSync(swPath)) {
    pass('background/service-worker.js present');
  } else {
    fail('background/service-worker.js MISSING from dist/ -- run: pnpm -r build');
  }

  if (fs.existsSync(contentPath)) {
    pass('content/chatgpt.js present');
  } else {
    fail('content/chatgpt.js MISSING from dist/ -- run: pnpm -r build');
  }

  // Icon check
  const iconsMissing = [icon16Path, icon48Path, icon128Path].filter(p => !fs.existsSync(p));
  if (iconsMissing.length === 0) {
    pass('icons/ present (16, 48, 128)');
  } else {
    warn(`icons/ missing: ${iconsMissing.map(p => path.basename(p)).join(', ')} -- run: pnpm -w run icons:create`);
  }

  // Source map check: must NOT be in dist/
  const mapFiles = [];
  function scanForMaps(dir) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) scanForMaps(full);
      else if (f.endsWith('.js.map')) mapFiles.push(full.replace(ROOT + path.sep, ''));
    }
  }
  scanForMaps(DIST_DIR);
  if (mapFiles.length === 0) {
    pass('No .js.map files in dist/');
  } else {
    warn(`Source maps found in dist/ (should not be distributed): ${mapFiles.slice(0, 3).join(', ')}${mapFiles.length > 3 ? ` (+${mapFiles.length - 3} more)` : ''}`);
  }
}

console.log('');

// -----------------------------------------------------------------------
// Section 3: ZIP artifact
// -----------------------------------------------------------------------
console.log('-- Section 3: ZIP artifact (dist-package/) --');

if (!fs.existsSync(DIST_PACKAGE_DIR)) {
  warn('dist-package/ folder does not exist -- run: pnpm -w run package:browser:beta');
} else {
  const zipFiles = fs.readdirSync(DIST_PACKAGE_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const full = path.join(DIST_PACKAGE_DIR, f);
      const stat = fs.statSync(full);
      return { name: f, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (zipFiles.length === 0) {
    warn('No ZIP files in dist-package/ -- run: pnpm -w run package:browser:beta');
  } else {
    const latest = zipFiles[0];
    if (latest.size > 10000) {
      pass(`Latest ZIP: ${latest.name} (${Math.round(latest.size / 1024)} KB)`);
    } else {
      fail(`Latest ZIP is suspiciously small (${latest.size} bytes): ${latest.name} -- may be corrupt`);
    }

    if (zipFiles.length > 1) {
      warn(`${zipFiles.length} ZIP files found -- latest is ${latest.name}`);
    }

    // Re-extract command
    console.log('');
    console.log(`  Re-extract command (if tester may have loaded the wrong folder):`);
    console.log(`    mkdir -p /tmp/promptprofit-reextract`);
    console.log(`    unzip -o "apps/browser-extension/dist-package/${latest.name}" -d /tmp/promptprofit-reextract/`);
    console.log(`    Then load the "dist" subfolder from /tmp/promptprofit-reextract/ in Chrome.`);
  }
}

console.log('');

// -----------------------------------------------------------------------
// Section 4: Run check:dryrun:001 and check:secrets:local
// -----------------------------------------------------------------------
console.log('-- Section 4: Automated checks --');

const dryRunCheckRes = runCmd('pnpm -w run check:dryrun:001');
if (dryRunCheckRes.status === 0) {
  pass('check:dryrun:001: PASS');
} else {
  warn('check:dryrun:001: non-zero exit (review output above for details)');
}

const secretsRes = runCmd('pnpm -w run check:secrets:local');
if (secretsRes.status === 0) {
  pass('check:secrets:local: PASS');
} else {
  fail('check:secrets:local: FAIL -- resolve before running the dry-run');
}

console.log('');

// -----------------------------------------------------------------------
// Section 5: Chrome load path
// -----------------------------------------------------------------------
console.log('-- Section 5: What to tell the tester --');
console.log('');
console.log('  CHROME LOAD INSTRUCTIONS (owner reads these to the tester):');
console.log('');
console.log('  1. Unzip the beta ZIP to a folder on their computer.');
console.log('     The ZIP contains a "dist/" subfolder -- that is what Chrome loads.');
console.log('');
console.log('  2. In Chrome: go to chrome://extensions');
console.log('     Enable "Developer mode" (top-right toggle).');
console.log('     Click "Load unpacked".');
console.log('     Select the "dist/" folder INSIDE the unzipped directory.');
console.log('     NOT the outer ZIP folder -- the dist/ folder inside it.');
console.log('');
console.log('  3. Confirm PromptProfit appears in the extension list with no error badge.');
console.log('     The extension toggle must be ON (blue).');
console.log('');
console.log('  4. LOGGED IN REQUIREMENT:');
console.log('     The tester MUST be logged into chatgpt.com BEFORE opening a new chat.');
console.log('     If they see "Log in" or "Sign up" on chatgpt.com, the test cannot proceed.');
console.log('     Banner only appears when the tester is authenticated and ChatGPT is generating.');
console.log('');
console.log('  5. WHAT THE TESTER SHOULD SEE (banner description):');
console.log('     While ChatGPT is generating the response (generating, not after):');
console.log('       - A small rectangular banner appears in the BOTTOM-RIGHT corner.');
console.log('       - It shows placeholder text (not a real ad): headline, short body, display URL.');
console.log('       - An X (close) button is visible in the top-right corner of the banner.');
console.log('     After ChatGPT finishes: the banner may still be visible until dismissed.');
console.log('');
console.log('  See: docs/internal-beta/dry-runs/TROUBLESHOOTING_BANNER_NOT_OBSERVED.md');
console.log('');

if (fs.existsSync(manifestPath)) {
  console.log(`  Source manifest: apps/browser-extension/manifest.json`);
  console.log(`  NOTE: Testers load the EXTRACTED ZIP folder (not the repo dist/ directly).`);
  console.log(`  The ZIP packages manifest.json + dist/ JS files + icons/ into one folder.`);
  console.log('');
}

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------
console.log('=== Summary ===');
console.log(`  Passed:   ${passed}`);
console.log(`  Warnings: ${warned}`);
console.log(`  Failed:   ${failed}`);
console.log('');

if (failed > 0) {
  console.log('Result: FAIL -- fix the issues above before running the dry-run');
  console.log('');
  process.exit(1);
} else if (warned > 0) {
  console.log('Result: PASS WITH WARNINGS -- review warnings above');
  console.log('');
  process.exit(0);
} else {
  console.log('Result: PASS -- extension files look correct; confirm tester is logged in');
  console.log('');
  process.exit(0);
}
