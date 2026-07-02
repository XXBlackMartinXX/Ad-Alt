'use strict';
/**
 * Integration tests for the DRYRUN-001 stale-package-prevention pipeline.
 *
 * These spawn the REAL scripts as subprocesses (not mocks) to verify the
 * exact bug this session fixes cannot recur: a packaging failure must never
 * let dryrun-001-prepare.js or dryrun-001-launch-chrome.js proceed as if a
 * fresh package existed. Slower than the pure-function tests in
 * zip-utils.test.js (each spawns real child processes -- bundle.mjs is
 * temporarily broken to force a deterministic failure), so these are kept
 * to the two most behaviorally distinct scenarios rather than duplicating
 * every case already covered by the pure-function tests.
 *
 * Run: node --test scripts/__tests__/*.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE_SCRIPT = path.join(ROOT, 'apps', 'browser-extension', 'scripts', 'bundle.mjs');
const BUNDLE_SCRIPT_BAK = BUNDLE_SCRIPT + '.integration-test-bak';

/**
 * Temporarily renames bundle.mjs so package:browser:beta's rebuild step
 * fails deterministically (a real MODULE_NOT_FOUND, not a mock) -- this is
 * the same class of failure (a rebuild crash) that produced the original
 * "Node.js vX.Y.Z"-only symptom this session fixes the reporting for.
 */
function withBrokenBundleScript(fn) {
  assert.ok(fs.existsSync(BUNDLE_SCRIPT), 'bundle.mjs must exist before the test can break it');
  fs.renameSync(BUNDLE_SCRIPT, BUNDLE_SCRIPT_BAK);
  try {
    fn();
  } finally {
    // Always restore, even if the assertion inside fn() throws.
    if (fs.existsSync(BUNDLE_SCRIPT_BAK)) {
      fs.renameSync(BUNDLE_SCRIPT_BAK, BUNDLE_SCRIPT);
    }
  }
}

test(
  'dryrun-001-launch-chrome.js refuses to launch Chrome when packaging fails',
  { timeout: 60_000 },
  () => {
    withBrokenBundleScript(() => {
      const res = spawnSync('node', [path.join(ROOT, 'scripts', 'dryrun-001-launch-chrome.js')], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 55_000,
      });
      const out = (res.stdout || '') + (res.stderr || '');

      assert.notEqual(res.status, 0, 'launcher must exit non-zero when packaging fails');
      assert.match(out, /BLOCKED/, 'launcher must print a BLOCKED message');
      assert.doesNotMatch(out, /Chrome launched/, 'launcher must NOT report Chrome as launched');
      assert.doesNotMatch(out, /LAUNCH SUMMARY/, 'launcher must NOT print a launch summary');
    });
  },
);

test(
  'package-browser-extension.mjs failure is fully captured (not reduced to a bare Node.js version line)',
  { timeout: 30_000 },
  () => {
    withBrokenBundleScript(() => {
      const res = spawnSync(
        'node',
        [path.join(ROOT, 'scripts', 'package-browser-extension.mjs')],
        { cwd: ROOT, encoding: 'utf8', timeout: 25_000 },
      );
      const out = (res.stdout || '') + (res.stderr || '');

      assert.notEqual(res.status, 0, 'packaging must exit non-zero when the rebuild fails');
      // The exact regression this session fixes: previously only the LAST
      // line of a Node crash report ("Node.js vX.Y.Z") was visible. Now the
      // full command, exit code, and captured stdout/stderr must be present.
      assert.match(out, /Command:/, 'full command must be printed on failure');
      assert.match(out, /Exit code:/, 'exit code must be printed on failure');
      assert.match(out, /--- stderr ---/, 'captured stderr section must be printed on failure');
      // A durable log file must also be written for post-mortem debugging.
      const logPath = path.join(ROOT, '.tmp', 'package-browser-beta-failure.txt');
      assert.ok(fs.existsSync(logPath), 'failure log file must be written to .tmp/');
      const logContent = fs.readFileSync(logPath, 'utf8');
      assert.match(logContent, /Exit code:/);
    });
  },
);
