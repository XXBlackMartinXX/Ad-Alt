'use strict';
/**
 * Regression tests for scripts/lib/import-file.js -- the Windows-safe
 * dynamic-import helper.
 *
 * Background: check-ledger-confidence.js, check-monetization-privacy.js,
 * and simulate-payouts.js each dynamic-import a workspace package's built
 * dist/index.js by absolute path. Passing that raw path straight to
 * `import()` works by accident on POSIX (Node treats a leading `/` as an
 * unambiguous absolute file path) but fails on Windows: a path like
 * `C:\Users\dev\repo\dist\index.js` gets parsed as a URL whose scheme is
 * `c:`, and Node's ESM loader rejects any scheme other than file/data/node
 * with ERR_UNSUPPORTED_ESM_URL_SCHEME. The fix is to always convert the
 * absolute path to a proper `file://` URL via `pathToFileURL` first.
 *
 * IMPORTANT PLATFORM CAVEAT: `pathToFileURL`'s Windows-vs-POSIX branch is
 * selected once, internally, from `process.platform` at Node startup --
 * it cannot be forced into the Windows branch by reassigning
 * `process.platform` at runtime (verified: doing so has no effect on its
 * output). So the tests below that assert the exact `file:///C:/...`
 * shape only run when this suite is actually executing on win32; on any
 * other platform they are explicitly skipped (not silently omitted) and
 * labeled "not verified yet" per this session's canary requirements. The
 * platform-independent tests (URL-scheme regression, round-trip fidelity,
 * a real dynamic import via the helper) run everywhere and are what
 * actually prove the fix is structurally correct.
 *
 * Run: node --test scripts/__tests__/*.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { importFile, toFileUrl } = require('../lib/import-file.js');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'import-file-fixture.mjs');

test('root-cause regression: a raw Windows-style path parses as a non-file URL scheme', () => {
  // This is exactly what the ESM loader does internally to a dynamic
  // import() specifier before deciding whether it's an acceptable scheme.
  // URL parsing itself is platform-independent (unlike pathToFileURL's
  // input interpretation), so this reproduces the real failure mode on
  // any platform, proving why raw-path import() breaks on Windows.
  const u = new URL('C:\\Users\\tester\\repo\\packages\\ledger\\dist\\index.js');
  assert.notEqual(u.protocol, 'file:');
  assert.equal(u.protocol, 'c:');
});

test('toFileUrl produces a URL with protocol "file:" for a current-platform absolute path', () => {
  const absPath = path.join(__dirname, 'fixtures', 'import-file-fixture.mjs');
  const href = toFileUrl(absPath);
  assert.match(href, /^file:\/\//);
  const parsed = new URL(href);
  assert.equal(parsed.protocol, 'file:');
});

test('toFileUrl round-trips back to the original absolute path via fileURLToPath', () => {
  const absPath = path.resolve(__dirname, 'fixtures', 'import-file-fixture.mjs');
  const href = toFileUrl(absPath);
  assert.equal(fileURLToPath(href), absPath);
});

test('toFileUrl correctly encodes and round-trips a path containing spaces', () => {
  // Simulates "My Repo" style paths without needing a real directory named
  // that on disk -- pathToFileURL/fileURLToPath operate on the string, not
  // the filesystem, so this exercises real encode/decode logic.
  //
  // Uses path.resolve (not path.join) with the leading path.sep so this is
  // a genuinely absolute path on every platform. path.join(path.sep, ...)
  // alone produces a drive-relative path on Windows (e.g.
  // "\tmp\My Test Repo\dist\index.js", with no drive letter) -- that is
  // not how a real absolute Windows path looks, and comparing
  // fileURLToPath's round-tripped result (which resolves against the
  // current drive, e.g. "C:\tmp\My Test Repo\dist\index.js") against the
  // driveless original would fail the equality check. path.resolve
  // anchors the fixture path to the current drive up front, so both sides
  // of the round-trip compare the same true absolute path.
  const absPathWithSpaces = path.resolve(path.sep, 'tmp', 'My Test Repo', 'dist', 'index.js');
  const href = toFileUrl(absPathWithSpaces);
  assert.match(href, /%20/, 'space must be percent-encoded in the URL, not left raw');
  assert.equal(fileURLToPath(href), absPathWithSpaces);
});

test('importFile actually dynamic-imports a real file via the helper (end-to-end, real code path)', async () => {
  const mod = await importFile(FIXTURE_PATH);
  assert.equal(mod.IMPORT_FILE_FIXTURE_MARKER, 'import-file-fixture-ok');
});

test('importFile on the real workspace packages used by the monetization scripts', async () => {
  // Exercises the exact three specifiers check-ledger-confidence.js,
  // simulate-payouts.js, and check-monetization-privacy.js import via this
  // helper, proving the fix works against the real build output, not just
  // a synthetic fixture.
  const repoRoot = path.resolve(__dirname, '..', '..');
  const ledgerDist = path.join(repoRoot, 'packages', 'ledger', 'dist', 'index.js');
  const fraudDist = path.join(repoRoot, 'packages', 'fraud', 'dist', 'index.js');
  const platformCoreDist = path.join(repoRoot, 'packages', 'platform-core', 'dist', 'index.js');

  if (!require('node:fs').existsSync(ledgerDist)) {
    // dist/ only exists after `pnpm -r build`; skip cleanly rather than
    // failing the whole suite in an unbuilt checkout.
    return;
  }

  const ledgerMod = await importFile(ledgerDist);
  const fraudMod = await importFile(fraudDist);
  const platformCoreMod = await importFile(platformCoreDist);

  assert.equal(typeof ledgerMod.LedgerCalculator, 'function');
  assert.equal(typeof fraudMod.FraudScorer, 'function');
  assert.ok(Array.isArray(platformCoreMod.TELEMETRY_FORBIDDEN_FIELDS));
});

test('Windows-specific URL shape (file:///C:/...) -- only verifiable when actually running on win32', (t) => {
  if (process.platform !== 'win32') {
    t.skip('not verified yet -- this test only runs on real Windows (process.platform !== "win32" here)');
    return;
  }
  const winPath = 'C:\\Users\\tester\\repo\\packages\\ledger\\dist\\index.js';
  const href = toFileUrl(winPath);
  assert.match(href, /^file:\/\/\/[A-Za-z]:\//, 'expected file:///C:/... shape on Windows');
  assert.ok(!href.includes('\\'), 'backslashes must be converted to forward slashes in the URL');
  assert.equal(fileURLToPath(href), winPath);
});

test('Windows-specific: path with spaces produces a valid file:// URL -- only verifiable on real Windows', (t) => {
  if (process.platform !== 'win32') {
    t.skip('not verified yet -- this test only runs on real Windows (process.platform !== "win32" here)');
    return;
  }
  const winPath = 'C:\\Users\\tester\\My Repo\\dist\\index.js';
  const href = toFileUrl(winPath);
  assert.match(href, /%20/);
  assert.equal(fileURLToPath(href), winPath);
});
