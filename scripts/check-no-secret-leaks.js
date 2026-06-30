'use strict';
/**
 * Scan source files and local generated reports for leaked API key patterns.
 *
 * A real PromptProfit API key is formatted as:
 *   ppft_<64 lowercase hex chars>
 *
 * The scan checks:
 *  1. All tracked source files (TypeScript, JavaScript, PowerShell, Markdown)
 *     excluding node_modules, dist, dist-test, .turbo, .git, playwright-report.
 *  2. Local generated report directories (test-results/) if they exist.
 *     These are git-ignored and only present after a local smoke run.
 *
 * Any match of ppft_[0-9a-f]{48,} is treated as a potential key leak.
 * Documentation placeholders like "ppft_..." or "ppft_<64-hex-chars>" are
 * safe because they do not match 48+ lowercase hex characters.
 *
 * Exit codes:
 *   0 - No leaks found
 *   1 - One or more potential leaks detected
 *
 * Usage:
 *   node scripts/check-no-secret-leaks.js
 *   pnpm -w run check:secrets:local
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Real ppft_ key: "ppft_" + 64 hex chars. Require 48+ to catch both full
// keys and any truncated-but-still-suspicious substrings.
const KEY_RE = /ppft_[0-9a-f]{48,}/i;

// Directories to skip entirely during source scan.
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'dist-test', '.turbo', '.git',
  'playwright-report', '.vscode-test',
]);

// Source file extensions to scan.
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.ps1', '.md', '.json']);

// Report directories to scan (git-ignored; only present after local smoke runs).
const REPORT_DIRS = [
  path.join(ROOT, 'apps', 'browser-extension', 'test-results', 'live'),
  path.join(ROOT, 'apps', 'browser-extension', 'test-results', 'local-api'),
];

const leaks = [];
let scanned = 0;

// ---------------------------------------------------------------------------
// Recursive source scan
// ---------------------------------------------------------------------------

function scanFile(absPath) {
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (KEY_RE.test(lines[i])) {
      leaks.push({
        file: path.relative(ROOT, absPath),
        line: i + 1,
        preview: lines[i].replace(KEY_RE, (m) => m.slice(0, 10) + '...[REDACTED]').slice(0, 120),
      });
    }
  }
  scanned++;
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return; }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      scanDir(full);
    } else if (SOURCE_EXTS.has(path.extname(entry).toLowerCase())) {
      scanFile(full);
    }
  }
}

// ---------------------------------------------------------------------------
// Report directory scan (generated artifacts)
// ---------------------------------------------------------------------------

function scanReportDir(dir) {
  if (!fs.existsSync(dir)) return;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return; }

  for (const entry of entries) {
    if (!entry.endsWith('.md') && !entry.endsWith('.json')) continue;
    const full = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isFile()) scanFile(full);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

process.stdout.write('[--] Scanning for leaked API key patterns (ppft_...)\n');
process.stdout.write('[--] Source: ' + ROOT + '\n');

scanDir(ROOT);

process.stdout.write('[--] Scanned ' + scanned + ' source file(s).\n');

let reportScanned = 0;
for (const dir of REPORT_DIRS) {
  if (fs.existsSync(dir)) {
    const before = scanned;
    scanReportDir(dir);
    const added = scanned - before;
    reportScanned += added;
    process.stdout.write('[--] Report dir: ' + path.relative(ROOT, dir) + ' (' + added + ' file(s))\n');
  }
}

if (leaks.length === 0) {
  process.stdout.write('\n[OK]  No API key leaks detected (' + scanned + ' file(s) scanned).\n');
  process.exit(0);
} else {
  process.stderr.write('\n[FAIL] ' + leaks.length + ' potential API key leak(s) found:\n\n');
  for (const l of leaks) {
    process.stderr.write('  ' + l.file + ':' + l.line + '\n');
    process.stderr.write('    ' + l.preview + '\n\n');
  }
  process.stderr.write(
    'Fix: ensure no real ppft_* keys are committed to source or\n' +
    'included in generated reports. Use placeholder strings like\n' +
    '"ppft_..." or "ppft_<64-hex-chars>" in documentation.\n'
  );
  process.exit(1);
}
