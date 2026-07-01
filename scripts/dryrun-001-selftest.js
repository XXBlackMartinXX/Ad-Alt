#!/usr/bin/env node
// DRYRUN-001 Automated Banner Selftest
//
// Builds the test extension (dist-test/) and runs a Playwright test that
// verifies the sponsored banner renders through the DETERMINISTIC internal-beta
// forced demo fallback: no wait-state trigger, no apiBaseUrl, no ad-decision
// API round-trip. The banner appears as soon as the extension loads on a
// supported ChatGPT host with demo mode on and the kill-switch off.
//
// This script is the automated gate before a human dry-run is scheduled.
// If the forced fallback cannot render deterministically here, a human
// dry-run would fail for the same reason — catch it here first.
//
// On failure: prints "BLOCKED BEFORE HUMAN TEST" and exits 1.
// On success: prints "PASS: forced internal-beta demo fallback banner rendered" and exits 0.
//
// Usage: node scripts/dryrun-001-selftest.js
//        pnpm -w run dryrun:001:selftest
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

console.log('');
console.log('=== dryrun-001-selftest ===');
console.log('Builds test extension and runs the forced demo fallback selftest in headless Chromium.');
console.log('No wait-state trigger, no API configuration -- uses the deterministic internal-beta fallback.');
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
  console.error('BLOCKED BEFORE HUMAN TEST: Forced demo fallback selftest FAILED.');
  console.error('');
  console.error('The sponsored banner did not render deterministically via the forced');
  console.error('internal-beta fallback (no wait-state trigger, no API config).');
  console.error('A human dry-run would fail for the same reason — fix the issue first.');
  console.error('');
  console.error('Likely causes:');
  console.error('  1. PROMPTPROFIT_BUILD_MODE is not "internal-beta" in dist-test/ service worker.');
  console.error('     Check: apps/browser-extension/scripts/bundle-test.mjs define block.');
  console.error('  2. dryRunDemoMode storage key not read, or the forced fallback block in');
  console.error('     chatgpt.ts / fixture-test.ts was removed or gated incorrectly.');
  console.error('  3. Kill-switch is ON. Check featureFlags in configureExtensionStorage() call.');
  console.error('  4. Spec file name mismatch: must be *.smoke.spec.ts to match playwright testMatch.');
  console.error('');
  process.exit(1);
}

console.log('=== Selftest PASS ===');
console.log('PASS: forced internal-beta demo fallback banner rendered');
console.log('Banner confirmed visible with demo mode, with NO wait-state trigger and NO API config.');
console.log('Kill-switch correctly blocks banner when enabled.');
console.log('Extension is cleared for human dry-run scheduling.');
console.log('');
process.exit(0);
