'use strict';
/**
 * Verify that all tracked .ps1 files contain only ASCII bytes (< 0x80).
 *
 * Non-ASCII characters in PowerShell scripts are dangerous because Windows
 * PowerShell 5.1 reads UTF-8 files without a BOM using the system encoding
 * (typically CP1252). Multi-byte UTF-8 sequences then decode to different
 * characters; e.g. the em dash (U+2014, UTF-8: E2 80 94) becomes `ae"` in
 * CP1252, where 0x94 is a RIGHT DOUBLE QUOTATION MARK that terminates
 * PowerShell string literals prematurely.
 *
 * Usage:
 *   node scripts/check-ps1-ascii.js
 *   pnpm -w run check:ps1
 */

const fs   = require('fs');
const path = require('path');

const PS1_FILES = [
  'scripts/open-latest-live-chatgpt-report.ps1',
  'scripts/run-live-chatgpt-stability.ps1',
  'scripts/query-local-browser-events.ps1',
  'scripts/run-local-real-api-smoke.ps1',
  'scripts/get-local-dev-api-key.ps1',
  'scripts/live-chatgpt-smoke.ps1',
  'scripts/run-local-billing-ledger-smoke.ps1',
  'scripts/run-local-click-billing-smoke.ps1',
  'scripts/query-local-ledger.ps1',
  'scripts/query-local-billing-events.ps1',
];

let exitCode = 0;

for (const relPath of PS1_FILES) {
  const absPath = path.resolve(process.cwd(), relPath);

  if (!fs.existsSync(absPath)) {
    process.stderr.write(`[SKIP] Not found: ${relPath}\n`);
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
          ctx:  line.slice(0, 100),
        });
      }
    }
  }

  if (hits.length === 0) {
    process.stdout.write(`[OK]   ${relPath}: ASCII-clean\n`);
  } else {
    process.stderr.write(`[FAIL] ${relPath}: ${hits.length} non-ASCII byte(s) found\n`);
    for (const h of hits.slice(0, 10)) {
      process.stderr.write(`         line ${h.line}, col ${h.col}: 0x${h.byte} >> ${h.ctx}\n`);
    }
    if (hits.length > 10) {
      process.stderr.write(`         ... and ${hits.length - 10} more\n`);
    }
    exitCode = 1;
  }
}

if (exitCode === 0) {
  process.stdout.write('\nAll PS1 files are ASCII-clean.\n');
} else {
  process.stderr.write(
    '\nFix: replace non-ASCII characters with ASCII equivalents.\n' +
    'Common offenders: em dash (U+2014) -> use " - " or "; "\n' +
    '                  smart quotes -> use straight quotes\n' +
    '                  bullet points -> use "*" or "-"\n',
  );
}

process.exit(exitCode);
