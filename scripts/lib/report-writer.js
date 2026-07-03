'use strict';
/**
 * Idempotent generated-report writer.
 *
 * The recurring workflow problem this fixes: several gate scripts
 * (check-ledger-confidence.js, simulate-payouts.js,
 * run-internal-beta-pilot-rehearsal.js) regenerate a tracked markdown
 * report on every run, and each report includes a
 * "**Generated:** <ISO timestamp>" line. Because that line always
 * differs, every routine verification run left the working tree dirty
 * (git status showed a diff) even when nothing substantive about the
 * report's content had changed -- which in turn could block a future
 * `git pull --ff-only`.
 *
 * The fix: compare the new content against the existing file with the
 * "**Generated:**" line normalized out on both sides. If nothing else
 * changed, skip the write entirely -- the file (including its old
 * timestamp) is left completely untouched, so `git status` stays clean.
 * If content genuinely changed, write it with the fresh timestamp, same
 * as before. This never hides a real result change: only the timestamp
 * line itself is ignored for the comparison, nothing else.
 */

const fs = require('fs');
const path = require('path');

const GENERATED_LINE_RE = /^\*\*Generated:\*\*.*$/m;

/** Replaces the "**Generated:** <timestamp>" line with a fixed placeholder for comparison. */
function normalizeGeneratedLine(content) {
  return content.replace(GENERATED_LINE_RE, '**Generated:** <normalized-for-comparison>');
}

/**
 * Writes `content` to `reportPath` only if it differs from the file's
 * current content once each side's "**Generated:**" line is normalized
 * out. Returns whether a write actually happened and why, for the
 * caller to log.
 *
 * @param {string} reportPath - absolute path to the report file
 * @param {string} content - full report content, including exactly one
 *   "**Generated:** <ISO timestamp>" line
 * @returns {{ written: boolean, reason: string }}
 */
function writeReportIfChanged(reportPath, content) {
  const existing = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;

  if (existing !== null && normalizeGeneratedLine(existing) === normalizeGeneratedLine(content)) {
    return {
      written: false,
      reason: 'content unchanged (only the timestamp would differ) -- write skipped to avoid a no-op dirty tree',
    };
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, content, 'utf8');
  return {
    written: true,
    reason: existing === null ? 'report did not exist yet' : 'content changed materially',
  };
}

module.exports = { writeReportIfChanged, normalizeGeneratedLine };
