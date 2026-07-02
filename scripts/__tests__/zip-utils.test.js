'use strict';
/**
 * Unit tests for scripts/lib/zip-utils.js.
 *
 * Uses Node's built-in test runner (node:test) -- no new dependency, and
 * these scripts already have no test harness of their own (turbo test only
 * covers apps/*  packages). Run directly:
 *   node --test scripts/__tests__/
 * or via the package.json script:
 *   pnpm -w run test:scripts
 *
 * Pure-function tests (validateBuildInfo, isFreshEnough) need no I/O.
 * ZIP round-trip tests build a real ZIP fixture on disk (via the `zip`
 * command if available, else skip gracefully) so readZipEntries /
 * readZipEntryContent / extractZip / readBuildInfoFromZip are exercised
 * against real ZIP bytes, not a hand-mocked structure.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  readZipEntries,
  readZipEntryContent,
  extractZip,
  extractBuildInfo,
  readBuildInfoFromZip,
  validateBuildInfo,
  isFreshEnough,
  BUILD_INFO_ENTRY_NAME,
} = require('../lib/zip-utils.js');

// ---------------------------------------------------------------------------
// Pure-function tests -- no filesystem, no ZIP needed
// ---------------------------------------------------------------------------

test('validateBuildInfo: passes when all expectations match', () => {
  const result = validateBuildInfo(
    { gitCommit: 'abc123', buildMode: 'internal-beta', dryRunDemoFallbackExpected: true },
    { expectedCommit: 'abc123', expectedBuildMode: 'internal-beta', requireFallback: true },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});

test('validateBuildInfo: fails on commit mismatch with a clear reason', () => {
  const result = validateBuildInfo(
    { gitCommit: 'old-commit', buildMode: 'internal-beta', dryRunDemoFallbackExpected: true },
    { expectedCommit: 'new-commit' },
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /gitCommit mismatch/);
});

test('validateBuildInfo: fails on wrong buildMode', () => {
  const result = validateBuildInfo(
    { gitCommit: 'abc', buildMode: 'production', dryRunDemoFallbackExpected: false },
    { expectedBuildMode: 'internal-beta' },
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /buildMode mismatch/);
});

test('validateBuildInfo: requireFallback true fails when fallback is false', () => {
  const result = validateBuildInfo(
    { gitCommit: 'abc', buildMode: 'internal-beta', dryRunDemoFallbackExpected: false },
    { requireFallback: true },
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /dryRunDemoFallbackExpected is false/);
});

test('validateBuildInfo: requireFallback false (public-release) fails when fallback is true', () => {
  // This is the exact case that must be caught: a public-release package
  // whose build-info still declares the internal-beta fallback is present.
  const result = validateBuildInfo(
    { gitCommit: 'abc', buildMode: 'internal-beta', dryRunDemoFallbackExpected: true },
    { requireFallback: false },
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /expected false \(public-release\)/);
});

test('validateBuildInfo: null build-info fails with a specific reason, not a crash', () => {
  const result = validateBuildInfo(null, { expectedCommit: 'abc' });
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /missing or not an object/);
});

test('validateBuildInfo: no expectations passed -> always ok if build-info is an object', () => {
  const result = validateBuildInfo({ gitCommit: 'anything' }, {});
  assert.equal(result.ok, true);
});

test('isFreshEnough: true when mtime is at or after the reference time', () => {
  assert.equal(isFreshEnough(1000, 500), true);
  assert.equal(isFreshEnough(1000, 1000), true);
});

test('isFreshEnough: false when mtime is before the reference time (stale)', () => {
  assert.equal(isFreshEnough(500, 1000), false);
});

test('extractBuildInfo: returns null when the entry is absent', () => {
  const result = extractBuildInfo([{ name: 'manifest.json' }], Buffer.alloc(0));
  assert.equal(result, null);
});

test('BUILD_INFO_ENTRY_NAME is the exact filename package-browser-extension.mjs writes', () => {
  assert.equal(BUILD_INFO_ENTRY_NAME, 'promptprofit-build-info.json');
});

// ---------------------------------------------------------------------------
// Real-ZIP round-trip tests -- build a small ZIP fixture with the `zip`
// command (present on this repo's Linux/macOS dev and CI images; skipped
// gracefully if unavailable, e.g. a bare Windows dev box without it).
// ---------------------------------------------------------------------------

function zipAvailable() {
  const res = spawnSync('zip', ['-v'], { stdio: 'ignore' });
  return !res.error;
}

test('readZipEntries + readZipEntryContent + extractZip + readBuildInfoFromZip: real ZIP round-trip', { skip: !zipAvailable() }, () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-utils-test-'));
  const stageDir = path.join(tmpRoot, 'stage');
  fs.mkdirSync(stageDir, { recursive: true });

  // Build a small fixture mirroring the real package layout.
  fs.writeFileSync(path.join(stageDir, 'manifest.json'), JSON.stringify({ name: 'PromptProfit' }));
  fs.mkdirSync(path.join(stageDir, 'dist', 'background'), { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'dist', 'background', 'service-worker.js'), 'console.log("sw")');
  const buildInfo = {
    gitCommit: 'deadbeef00000000000000000000000000000000',
    buildMode: 'internal-beta',
    packageKind: 'internal-beta',
    builtAt: new Date(0).toISOString(),
    sourceBranch: 'test-branch',
    dryRunDemoFallbackExpected: true,
    generatedBy: 'zip-utils.test.js',
  };
  fs.writeFileSync(path.join(stageDir, BUILD_INFO_ENTRY_NAME), JSON.stringify(buildInfo, null, 2));

  const zipPath = path.join(tmpRoot, 'fixture.zip');
  const zipRes = spawnSync('zip', ['-r', zipPath, '.'], { cwd: stageDir });
  assert.equal(zipRes.status, 0, 'zip command should succeed building the fixture');

  // readZipEntries
  const { entries, buf } = readZipEntries(zipPath);
  const names = entries.map((e) => e.name);
  assert.ok(names.includes('manifest.json'), 'manifest.json should be listed');
  assert.ok(names.includes('dist/background/service-worker.js'), 'service-worker.js should be listed');
  assert.ok(names.includes(BUILD_INFO_ENTRY_NAME), 'build-info should be listed');

  // readZipEntryContent
  const manifestEntry = entries.find((e) => e.name === 'manifest.json');
  const manifestContent = JSON.parse(readZipEntryContent(buf, manifestEntry).toString('utf8'));
  assert.equal(manifestContent.name, 'PromptProfit');

  // extractBuildInfo / readBuildInfoFromZip
  const extracted = extractBuildInfo(entries, buf);
  assert.deepEqual(extracted, buildInfo);
  const readBack = readBuildInfoFromZip(zipPath);
  assert.deepEqual(readBack, buildInfo);

  // validateBuildInfo against the round-tripped object
  const validation = validateBuildInfo(readBack, {
    expectedCommit: buildInfo.gitCommit,
    expectedBuildMode: 'internal-beta',
    requireFallback: true,
  });
  assert.equal(validation.ok, true);

  // extractZip -- full extraction to a new directory
  const extractDir = path.join(tmpRoot, 'extracted');
  const count = extractZip(zipPath, extractDir);
  assert.equal(count, 3); // manifest.json, service-worker.js, build-info.json
  assert.ok(fs.existsSync(path.join(extractDir, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(extractDir, 'dist', 'background', 'service-worker.js')));
  assert.ok(fs.existsSync(path.join(extractDir, BUILD_INFO_ENTRY_NAME)));

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('readBuildInfoFromZip: returns null for a nonexistent ZIP instead of throwing', () => {
  const result = readBuildInfoFromZip('/nonexistent/path/does-not-exist.zip');
  assert.equal(result, null);
});
