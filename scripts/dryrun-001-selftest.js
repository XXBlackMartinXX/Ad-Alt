#!/usr/bin/env node
// DRYRUN-001 Automated Banner Selftest
//
// Builds the test extension (dist-test/) and runs a Playwright test that
// verifies the sponsored banner appears without any API configuration,
// using internal demo mode (dryRunDemoMode: true).
//
// This script is the automated gate before a human dry-run is scheduled.
// If the banner cannot appear without API config, the dry-run would fail
// for the same reason — catch it here first.
//
// On failure: prints "BLOCKED BEFORE HUMAN TEST" and exits 1.
// On success: prints confirmation and exits 0.
//
// Usage: node scripts/dryrun-001-selftest.js
//        pnpm -w run dryrun:001:selftest
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

console.log('');
console.log('=== dryrun-001-selftest ===');
console.log('Builds test extension and runs banner selftest in headless Chromium.');
console.log('No API configuration required — uses internal-beta demo mode.');
console.log('');

// ---------------------------------------------------------------------------
// Step 1: Build the test extension (dist-test/) with internal-beta mode
// ---------------------------------------------------------------------------
console.log('-- Step 1: Build test extension (dist-test/) --');

const buildResult = spawnSync(
  'pnpm',
  ['--filter', '@ad-alt/browser-extension', 'run', 'build:test'],
  { cwd: ROOT, stdio: 'inherit', shell: true },
);

if (buildResult.status !== 0) {
  console.error('');
  console.error('BLOCKED BEFORE HUMAN TEST: Test extension build failed.');
  console.error('Fix the build error above before scheduling a human dry-run.');
  process.exit(1);
}

console.log('');

// ---------------------------------------------------------------------------
// Step 2: Run the Playwright selftest spec
// ---------------------------------------------------------------------------
console.log('-- Step 2: Run Playwright selftest (headless Chromium) --');

const testResult = spawnSync(
  'pnpm',
  ['--filter', '@ad-alt/browser-extension', 'run', 'test:e2e:selftest'],
  { cwd: ROOT, stdio: 'inherit', shell: true },
);

console.log('');

if (testResult.status !== 0) {
  console.error('BLOCKED BEFORE HUMAN TEST: Banner selftest FAILED.');
  console.error('');
  console.error('The sponsored banner did not render without API configuration.');
  console.error('A human dry-run would fail for the same reason — fix the issue first.');
  console.error('');
  console.error('Likely causes:');
  console.error('  1. PROMPTPROFIT_BUILD_MODE is not "internal-beta" in dist-test/ service worker.');
  console.error('     Check: apps/browser-extension/scripts/bundle-test.mjs define block.');
  console.error('  2. dryRunDemoMode storage key not read before apiBaseUrl check.');
  console.error('     Check: getAdDecision() in service-worker.ts.');
  console.error('  3. Kill-switch is ON. Check featureFlags in configureExtensionStorage() call.');
  console.error('  4. Spec file name mismatch: must be *.smoke.spec.ts to match playwright testMatch.');
  console.error('');
  process.exit(1);
}

console.log('=== Selftest PASS ===');
console.log('Banner confirmed visible with demo mode (no API config required).');
console.log('Kill-switch correctly blocks banner when enabled.');
console.log('Extension is cleared for human dry-run scheduling.');
console.log('');
process.exit(0);
