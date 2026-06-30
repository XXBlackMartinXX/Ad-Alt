'use strict';
/**
 * Verify that report-generating source files contain no non-ASCII characters
 * in string literals that would produce mojibake in Windows PowerShell 5.1
 * or GitHub Markdown renderers.
 *
 * This script is stricter than check-ps1-ascii.js (which only checks PS1):
 * it scans TypeScript and JavaScript files that generate Markdown/JSON reports,
 * and flags ANY non-ASCII byte regardless of whether it is in a comment or a
 * string literal. This is intentionally conservative: a developer who wants to
 * use a Unicode character in a comment should use the ASCII equivalent instead
 * (e.g. "-" instead of "–") to avoid accidental copy-paste into a string.
 *
 * Files scanned:
 *   - apps/browser-extension/e2e/live/live-chatgpt-smoke.spec.ts
 *   - scripts/list-local-api-smoke-reports.js
 *   - scripts/list-smoke-reports.js
 *   - scripts/clean-smoke-reports.js
 *
 * Exit codes:
 *   0 - All files ASCII-clean
 *   1 - Non-ASCII bytes found
 *
 * Usage:
 *   node scripts/check-report-templates-ascii.js
 *   pnpm -w run check:report-ascii
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const REPORT_TEMPLATE_FILES = [
  'apps/browser-extension/e2e/live/live-chatgpt-smoke.spec.ts',
  'scripts/list-local-api-smoke-reports.js',
  'scripts/list-smoke-reports.js',
  'scripts/clean-smoke-reports.js',
  'scripts/run-local-billing-ledger-smoke.ps1',
  'scripts/run-local-click-billing-smoke.ps1',
  'scripts/query-local-ledger.ps1',
  'scripts/query-local-billing-events.ps1',
];

let exitCode = 0;

for (const relPath of REPORT_TEMPLATE_FILES) {
  const absPath = path.resolve(ROOT, relPath);

  if (!fs.existsSync(absPath)) {
    process.stderr.write('[SKIP] Not found: ' + relPath + '\n');
    continue;
  }

  const buf   = fs.readFileSync(absPath);
  const lines = buf.toString('binary').split('\n');
  const hits  = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let ci = 0; ci < line.length; ci++) {
      const code = line.charCodeAt(ci);
      if (code > 127) {
        hits.push({
          line: li + 1,
          col:  ci + 1,
          byte: code.toString(16).toUpperCase().padStart(2, '0'),
          ctx:  line.slice(0, 120),
        });
      }
    }
  }

  if (hits.length === 0) {
    process.stdout.write('[OK]   ' + relPath + ': ASCII-clean\n');
  } else {
    process.stderr.write('[FAIL] ' + relPath + ': ' + hits.length + ' non-ASCII byte(s)\n');
    for (const h of hits.slice(0, 8)) {
      process.stderr.write(
        '         line ' + h.line + ', col ' + h.col +
        ': 0x' + h.byte + ' >> ' + h.ctx + '\n'
      );
    }
    if (hits.length > 8) {
      process.stderr.write('         ... and ' + (hits.length - 8) + ' more\n');
    }
    exitCode = 1;
  }
}

if (exitCode === 0) {
  process.stdout.write('\nAll report template files are ASCII-clean.\n');
} else {
  process.stderr.write(
    '\nFix: replace non-ASCII with ASCII equivalents in report-generating files.\n' +
    'Common offenders: em dash (U+2014) -> " - "; en dash (U+2013) -> "-";\n' +
    '                  check marks (U+2713, U+2717) -> "[PASS]"/"[FAIL]"\n' +
    '                  smart quotes -> straight quotes\n'
  );
}

process.exit(exitCode);
