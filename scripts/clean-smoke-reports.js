'use strict';
/**
 * Remove all smoke test reports (live and local-API), keeping the directories.
 *
 * Usage:
 *   node scripts/clean-smoke-reports.js [--force] [--live-only] [--local-api-only]
 *   pnpm -w run smoke:chatgpt:reports:clean
 *
 * Flags:
 *   --force          Skip confirmation prompt.
 *   --live-only      Only clean live (mock) reports.
 *   --local-api-only Only clean local-API reports.
 *   --yes            Alias for --force.
 *
 * SAFETY:
 *   - Only removes .md and .json files inside known report directories.
 *   - Never removes source files, scripts, dist/, or node_modules.
 *   - Requires explicit confirmation unless --force / --yes is passed.
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const LIVE_DIR = path.resolve(
  __dirname,
  '../apps/browser-extension/test-results/live',
);

const LOCAL_API_DIR = path.resolve(
  __dirname,
  '../apps/browser-extension/test-results/local-api',
);

const args        = process.argv.slice(2);
const force       = args.includes('--force') || args.includes('--yes');
const liveOnly    = args.includes('--live-only');
const localOnly   = args.includes('--local-api-only');

const scanDirs = [];
if (!localOnly) scanDirs.push({ dir: LIVE_DIR,      label: 'Live smoke (mock API)' });
if (!liveOnly)  scanDirs.push({ dir: LOCAL_API_DIR, label: 'Local-API smoke (real API)' });

function collectReportFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

const allFiles = [];
for (const { dir, label } of scanDirs) {
  const files = collectReportFiles(dir);
  if (files.length > 0) {
    process.stdout.write('[--] ' + label + ': ' + files.length + ' file(s) in:\n');
    process.stdout.write('     ' + dir + '\n');
    for (const f of files) {
      process.stdout.write('  ' + path.basename(f) + '\n');
    }
    process.stdout.write('\n');
  }
  allFiles.push(...files);
}

if (allFiles.length === 0) {
  process.stdout.write('[--] No report files found; nothing to clean.\n');
  process.exit(0);
}

process.stdout.write('[--] ' + allFiles.length + ' report file(s) will be removed.\n\n');

function doDelete() {
  let removed = 0;
  for (const f of allFiles) {
    try {
      fs.unlinkSync(f);
      removed++;
    } catch (err) {
      process.stderr.write('[ERR] Could not remove ' + f + ': ' + err.message + '\n');
    }
  }
  process.stdout.write('[OK]  Removed ' + removed + ' file(s).\n');
}

if (force) {
  doDelete();
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Remove all ' + allFiles.length + ' report file(s)? [y/N] ', (answer) => {
  rl.close();
  if (answer.trim().toLowerCase() === 'y') {
    doDelete();
  } else {
    process.stdout.write('[--] Cancelled. No files removed.\n');
  }
});
