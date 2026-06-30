'use strict';
/**
 * List local real-API ChatGPT smoke test reports.
 *
 * Usage:
 *   node scripts/list-local-api-smoke-reports.js
 *   pnpm -w run smoke:chatgpt:local-api:report
 */

const fs   = require('fs');
const path = require('path');

const REPORT_DIR = path.resolve(
  __dirname,
  '../apps/browser-extension/test-results/local-api',
);

if (!fs.existsSync(REPORT_DIR)) {
  process.stdout.write('[--] No local-API smoke reports directory found.\n');
  process.stdout.write('[--] Generate a report with: pnpm smoke:chatgpt:local-api\n');
  process.stdout.write('     Directory: ' + REPORT_DIR + '\n');
  process.exit(0);
}

const files = fs.readdirSync(REPORT_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const full = path.join(REPORT_DIR, f);
    const stat = fs.statSync(full);
    return { name: f, mtime: stat.mtimeMs, size: stat.size, full };
  })
  .sort((a, b) => b.mtime - a.mtime);

if (files.length === 0) {
  process.stdout.write('[--] No .md reports found in: ' + REPORT_DIR + '\n');
  process.stdout.write('[--] Generate a report with: pnpm smoke:chatgpt:local-api\n');
  process.exit(0);
}

process.stdout.write('\n[--] Local real-API smoke reports (' + files.length + ' total):\n');
process.stdout.write('[--] Directory: ' + REPORT_DIR + '\n\n');

for (let i = 0; i < files.length; i++) {
  const f  = files[i];
  const dt = new Date(f.mtime).toISOString().replace('T', ' ').slice(0, 19);
  const kb = (f.size / 1024).toFixed(1);
  const tag = i === 0 ? ' (latest)' : '';
  process.stdout.write('  ' + (i + 1) + '. ' + f.name + '  ' + dt + '  ' + kb + ' KB' + tag + '\n');
}

// Print the latest report content
const latest = files[0];
process.stdout.write('\n--- Latest report: ' + latest.name + ' ---\n\n');
process.stdout.write(fs.readFileSync(latest.full, 'utf8'));
process.stdout.write('\n---\n\n');
