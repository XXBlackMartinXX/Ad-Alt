#!/usr/bin/env node
// Verifies the browser extension ZIP structure and prints the correct "Load unpacked" instruction.
// Fails if manifest.json is not at the ZIP root (which would make "Load unpacked" fail in Chrome).
// Usage: node scripts/check-browser-extension-load-folder.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BROWSER_EXT_DIR = path.join(ROOT, 'apps', 'browser-extension');
const DIST_PACKAGE_DIR = path.join(BROWSER_EXT_DIR, 'dist-package');

let passed = 0;
let warned = 0;
let failed = 0;

function pass(msg) { console.log(`  PASS  ${msg}`); passed++; }
function warn(msg) { console.log(`  WARN  ${msg}`); warned++; }
function fail(msg) { console.log(`  FAIL  ${msg}`); failed++; }

// ---------------------------------------------------------------------------
// Minimal ZIP central-directory reader (no external deps)
// ---------------------------------------------------------------------------
function readZipEntries(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const len = buf.length;

  // Find EOCD (End of Central Directory) signature: 0x06054b50
  let eocdOffset = -1;
  for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
    if (buf[i] === 0x50 && buf[i+1] === 0x4b && buf[i+2] === 0x05 && buf[i+3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('EOCD not found -- not a valid ZIP');

  const cdSize   = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let pos = cdOffset;
  const cdEnd = cdOffset + cdSize;

  while (pos < cdEnd) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break; // central dir signature
    const fileNameLen = buf.readUInt16LE(pos + 28);
    const extraLen    = buf.readUInt16LE(pos + 30);
    const commentLen  = buf.readUInt16LE(pos + 32);
    const name = buf.slice(pos + 46, pos + 46 + fileNameLen).toString('utf8');
    entries.push(name);
    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

// ---------------------------------------------------------------------------
console.log('');
console.log('=== check-browser-extension-load-folder ===');
console.log('Verifies ZIP structure so the correct "Load unpacked" folder is used.');
console.log('');

// ---------------------------------------------------------------------------
// 1. Find the latest ZIP
// ---------------------------------------------------------------------------
console.log('-- Section 1: Find latest ZIP --');

if (!fs.existsSync(DIST_PACKAGE_DIR)) {
  fail('dist-package/ folder does not exist -- run: pnpm -w run package:browser:beta');
  printSummaryAndExit();
}

const zipFiles = fs.readdirSync(DIST_PACKAGE_DIR)
  .filter(f => f.endsWith('.zip'))
  .map(f => {
    const full = path.join(DIST_PACKAGE_DIR, f);
    return { name: f, full, mtime: fs.statSync(full).mtimeMs, size: fs.statSync(full).size };
  })
  .sort((a, b) => b.mtime - a.mtime);

if (zipFiles.length === 0) {
  fail('No ZIP files in dist-package/ -- run: pnpm -w run package:browser:beta');
  printSummaryAndExit();
}

const latest = zipFiles[0];
pass(`Latest ZIP: ${latest.name} (${Math.round(latest.size / 1024)} KB)`);
if (zipFiles.length > 1) {
  warn(`${zipFiles.length} ZIP files found -- checking the latest only`);
}

console.log('');

// ---------------------------------------------------------------------------
// 2. Read ZIP entries
// ---------------------------------------------------------------------------
console.log('-- Section 2: ZIP structure analysis --');

let entries;
try {
  entries = readZipEntries(latest.full);
} catch (e) {
  fail(`Cannot read ZIP entries: ${e.message}`);
  printSummaryAndExit();
}

pass(`ZIP has ${entries.length} entries`);

// Check manifest.json is at root (not in a subfolder)
const hasRootManifest = entries.includes('manifest.json');
if (hasRootManifest) {
  pass('manifest.json is at the ZIP ROOT -- correct "Load unpacked" target is the extracted root folder');
} else {
  const nestedManifest = entries.find(e => e.endsWith('/manifest.json') || e.endsWith('\\manifest.json'));
  if (nestedManifest) {
    fail(`manifest.json found at nested path: ${nestedManifest}`);
    fail('Chrome requires manifest.json at the root of the "Load unpacked" folder');
    fail('Fix: rebuild with pnpm -r build && pnpm -w run package:browser:beta');
  } else {
    fail('manifest.json NOT FOUND in ZIP -- extension cannot be loaded in Chrome');
    fail('Fix: rebuild with pnpm -r build && pnpm -w run package:browser:beta');
  }
}

// Check expected files
const expectedFiles = [
  'dist/background/service-worker.js',
  'dist/content/chatgpt.js',
];
for (const f of expectedFiles) {
  if (entries.includes(f)) {
    pass(`Expected file present: ${f}`);
  } else {
    fail(`Expected file MISSING: ${f} -- run: pnpm -r build && pnpm -w run package:browser:beta`);
  }
}

// Check icons
const iconFiles = ['icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'];
const missingIcons = iconFiles.filter(f => !entries.includes(f));
if (missingIcons.length === 0) {
  pass('Icon files present: icon16.png, icon48.png, icon128.png');
} else {
  warn(`Icon files missing: ${missingIcons.join(', ')} -- run: pnpm -w run icons:create`);
}

// Check for forbidden files
const mapFiles = entries.filter(e => e.endsWith('.js.map'));
if (mapFiles.length === 0) {
  pass('No .js.map files in ZIP (source maps excluded)');
} else {
  warn(`Source map files in ZIP (should not be distributed): ${mapFiles.slice(0, 3).join(', ')}`);
}

const envFiles = entries.filter(e => e.endsWith('.env') || e === '.env');
if (envFiles.length === 0) {
  pass('No .env files in ZIP');
} else {
  fail(`SECURITY: .env file(s) found in ZIP: ${envFiles.join(', ')}`);
}

console.log('');

// ---------------------------------------------------------------------------
// 3. Print the correct Load unpacked instruction
// ---------------------------------------------------------------------------
console.log('-- Section 3: Correct "Load unpacked" instruction --');
console.log('');
console.log('  WHAT TO TELL THE TESTER:');
console.log('');
console.log(`  ZIP: ${latest.name}`);
console.log('');
console.log('  Step 1: Unzip the file.');
console.log(`    The extracted folder (e.g. "${latest.name.replace('.zip', '')}/") is the load target.`);
console.log('');
console.log('  Step 2: In Chrome go to chrome://extensions -> enable Developer Mode.');
console.log('    Click "Load unpacked".');
console.log(`    Select the extracted folder: the folder containing manifest.json directly.`);
console.log('    Do NOT navigate into dist/ or any subfolder -- select the root of what you unzipped.');
console.log('');
console.log('  Correct folder structure inside the extracted root:');
console.log('    manifest.json          <-- Chrome reads this first');
console.log('    dist/');
console.log('    dist/background/');
console.log('    dist/background/service-worker.js');
console.log('    dist/content/');
console.log('    dist/content/chatgpt.js');
console.log('    icons/');
console.log('    icons/icon16.png');
console.log('    icons/icon48.png');
console.log('    icons/icon128.png');
console.log('');
if (hasRootManifest) {
  pass('ZIP structure confirmed: extracted root IS the correct "Load unpacked" target');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
printSummaryAndExit();

function printSummaryAndExit() {
  console.log('');
  console.log('=== Summary ===');
  console.log(`  Passed:   ${passed}`);
  console.log(`  Warnings: ${warned}`);
  console.log(`  Failed:   ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('Result: FAIL -- fix the issues above before distributing the ZIP');
    console.log('');
    process.exit(1);
  } else if (warned > 0) {
    console.log('Result: PASS WITH WARNINGS -- review warnings above');
    console.log('');
    process.exit(0);
  } else {
    console.log('Result: PASS -- ZIP structure is correct; extracted root folder is the "Load unpacked" target');
    console.log('');
    process.exit(0);
  }
}
