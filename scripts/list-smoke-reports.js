'use strict';
/**
 * List live ChatGPT smoke test reports in chronological order.
 *
 * Usage:
 *   node scripts/list-smoke-reports.js
 *   pnpm -w run smoke:chatgpt:reports:list
 */

const fs   = require('fs');
const path = require('path');

const REPORT_DIR = path.resolve(
  __dirname,
  '../apps/browser-extension/test-results/live',
);

if (!fs.existsSync(REPORT_DIR)) {
  process.stdout.write('[--] No live smoke reports directory found.\n');
  process.stdout.write('[--] Generate a report with: pnpm smoke:chatgpt:live\n');
  process.stdout.write('     Directory: ' + REPORT_DIR + '\n');
  process.exit(0);
}

const files = fs.readdirSync(REPORT_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const full = path.join(REPORT_DIR, f);
    const stat = fs.statSync(full);
    return { name: f, mtime: stat.mtimeMs, size: stat.size };
  })
  .sort((a, b) => b.mtime - a.mtime);

if (files.length === 0) {
  process.stdout.write('[--] No .md reports found in: ' + REPORT_DIR + '\n');
  process.stdout.write('[--] Generate a report with: pnpm smoke:chatgpt:live\n');
  process.exit(0);
}

process.stdout.write('\n[--] Live smoke reports (' + files.length + ' total):\n');
process.stdout.write('[--] Directory: ' + REPORT_DIR + '\n\n');

for (let i = 0; i < files.length; i++) {
  const f    = files[i];
  const dt   = new Date(f.mtime).toISOString().replace('T', ' ').slice(0, 19);
  const kb   = (f.size / 1024).toFixed(1);
  const tag  = i === 0 ? ' (latest)' : '';
  process.stdout.write('  ' + (i + 1) + '. ' + f.name + '  ' + dt + '  ' + kb + ' KB' + tag + '\n');
}

process.stdout.write('\n[--] View latest: pnpm smoke:chatgpt:report\n\n');
