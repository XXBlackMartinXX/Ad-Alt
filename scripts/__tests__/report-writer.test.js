'use strict';
/**
 * Unit tests for scripts/lib/report-writer.js -- the idempotent
 * generated-report writer that fixes the recurring "regenerating a report
 * dirties the tree on every run" workflow problem (see
 * docs/internal-beta/final-readiness/GENERATED_REPORT_WORKFLOW_REVIEW.md).
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { writeReportIfChanged, normalizeGeneratedLine } = require('../lib/report-writer.js');

function tmpReportPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'report-writer-test-')), 'REPORT.md');
}

function reportWithTimestamp(iso, rest) {
  return `# Title\n\n**Generated:** ${iso}\n${rest}`;
}

test('writes the file when it does not exist yet', () => {
  const p = tmpReportPath();
  const content = reportWithTimestamp('2026-01-01T00:00:00.000Z', 'body');

  const result = writeReportIfChanged(p, content);

  assert.equal(result.written, true);
  assert.match(result.reason, /did not exist yet/);
  assert.equal(fs.readFileSync(p, 'utf8'), content);
});

test('creates parent directories as needed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-writer-test-'));
  const nestedPath = path.join(dir, 'a', 'b', 'c', 'REPORT.md');
  const content = reportWithTimestamp('2026-01-01T00:00:00.000Z', 'body');

  writeReportIfChanged(nestedPath, content);

  assert.equal(fs.existsSync(nestedPath), true);
});

test('skips the write when only the Generated timestamp differs', () => {
  const p = tmpReportPath();
  const first = reportWithTimestamp('2026-01-01T00:00:00.000Z', 'body unchanged');
  writeReportIfChanged(p, first);
  const mtimeBefore = fs.statSync(p).mtimeMs;

  const second = reportWithTimestamp('2026-06-15T12:34:56.789Z', 'body unchanged');
  const result = writeReportIfChanged(p, second);

  assert.equal(result.written, false);
  assert.match(result.reason, /timestamp would differ/);
  // The file on disk must still have the ORIGINAL timestamp -- proving the
  // write was truly skipped, not just reported as skipped.
  assert.equal(fs.readFileSync(p, 'utf8'), first);
  assert.equal(fs.statSync(p).mtimeMs, mtimeBefore);
});

test('writes the file when content other than the Generated line changes', () => {
  const p = tmpReportPath();
  const first = reportWithTimestamp('2026-01-01T00:00:00.000Z', 'Result: PASS');
  writeReportIfChanged(p, first);

  const second = reportWithTimestamp('2026-01-01T00:00:01.000Z', 'Result: FAIL');
  const result = writeReportIfChanged(p, second);

  assert.equal(result.written, true);
  assert.match(result.reason, /changed materially/);
  assert.equal(fs.readFileSync(p, 'utf8'), second);
});

test('a real content regression is never hidden behind the timestamp-only skip logic', () => {
  const p = tmpReportPath();
  writeReportIfChanged(p, reportWithTimestamp('2026-01-01T00:00:00.000Z', '**Result:** PASS (17 passed, 0 failed)'));

  const result = writeReportIfChanged(
    p,
    reportWithTimestamp('2026-01-01T00:00:01.000Z', '**Result:** FAIL (16 passed, 1 failed)'),
  );

  assert.equal(result.written, true);
  assert.match(fs.readFileSync(p, 'utf8'), /FAIL \(16 passed, 1 failed\)/);
});

test('normalizeGeneratedLine replaces only the Generated line, leaving everything else intact', () => {
  const content = reportWithTimestamp('2026-01-01T00:00:00.000Z', 'line one\n**Generated:** should not match mid-body\nline two');
  const normalized = normalizeGeneratedLine(content);

  assert.match(normalized, /\*\*Generated:\*\* <normalized-for-comparison>/);
  assert.match(normalized, /line one/);
  assert.match(normalized, /line two/);
  // Only the FIRST "**Generated:**" occurrence should be normalized (the
  // real report format never has a second one, but this documents the
  // regex's actual behavior rather than assuming it).
  assert.equal((normalized.match(/\*\*Generated:\*\*/g) || []).length, 2);
});

test('repeated calls with identical content are fully idempotent (no dirty tree)', () => {
  const p = tmpReportPath();
  const content = reportWithTimestamp('2026-01-01T00:00:00.000Z', 'stable body');
  writeReportIfChanged(p, content);
  const mtimeAfterFirst = fs.statSync(p).mtimeMs;

  for (let i = 0; i < 3; i++) {
    const result = writeReportIfChanged(p, reportWithTimestamp(`2026-01-0${i + 2}T00:00:00.000Z`, 'stable body'));
    assert.equal(result.written, false);
  }

  assert.equal(fs.statSync(p).mtimeMs, mtimeAfterFirst);
});
