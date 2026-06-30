'use strict';
/**
 * Remove all live ChatGPT smoke test reports (keeps the directory).
 *
 * Usage:
 *   node scripts/clean-smoke-reports.js [--force]
 *   pnpm -w run smoke:chatgpt:reports:clean
 *
 * Pass --force to skip the confirmation prompt.
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const REPORT_DIR = path.resolve(
  __dirname,
  '../apps/browser-extension/test-results/live',
);

const force = process.argv.includes('--force');

if (!fs.existsSync(REPORT_DIR)) {
  process.stdout.write('[--] No live smoke reports directory found; nothing to clean.\n');
  process.exit(0);
}

const files = fs.readdirSync(REPORT_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => path.join(REPORT_DIR, f));

if (files.length === 0) {
  process.stdout.write('[--] No .md reports found; nothing to clean.\n');
  process.exit(0);
}

process.stdout.write('[--] Found ' + files.length + ' report(s) in:\n');
process.stdout.write('     ' + REPORT_DIR + '\n\n');
for (const f of files) {
  process.stdout.write('  ' + path.basename(f) + '\n');
}
process.stdout.write('\n');

function doDelete() {
  let removed = 0;
  for (const f of files) {
    try {
      fs.unlinkSync(f);
      removed++;
    } catch (err) {
      process.stderr.write('[ERR] Could not remove ' + f + ': ' + err.message + '\n');
    }
  }
  process.stdout.write('[OK]  Removed ' + removed + ' report(s).\n');
}

if (force) {
  doDelete();
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Remove all ' + files.length + ' report(s)? [y/N] ', (answer) => {
  rl.close();
  if (answer.trim().toLowerCase() === 'y') {
    doDelete();
  } else {
    process.stdout.write('[--] Cancelled. No files removed.\n');
  }
});
