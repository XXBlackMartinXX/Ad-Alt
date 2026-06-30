'use strict';
/**
 * List all live and local-API ChatGPT smoke test reports.
 *
 * Usage:
 *   node scripts/list-smoke-reports.js
 *   pnpm -w run smoke:chatgpt:reports:list
 */

const fs   = require('fs');
const path = require('path');

const LIVE_DIR = path.resolve(
  __dirname,
  '../apps/browser-extension/test-results/live',
);

const LOCAL_API_DIR = path.resolve(
  __dirname,
  '../apps/browser-extension/test-results/local-api',
);

function listDir(dir, label) {
  if (!fs.existsSync(dir)) {
    process.stdout.write('[--] No ' + label + ' reports found.\n');
    process.stdout.write('     Directory: ' + dir + '\n');
    return [];
  }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { name: f, mtime: stat.mtimeMs, size: stat.size, full };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    process.stdout.write('[--] No .md reports found in ' + label + '.\n');
    return [];
  }

  process.stdout.write('\n[--] ' + label + ' reports (' + files.length + ' total):\n');
  process.stdout.write('[--] Directory: ' + dir + '\n\n');

  for (let i = 0; i < files.length; i++) {
    const f   = files[i];
    const dt  = new Date(f.mtime).toISOString().replace('T', ' ').slice(0, 19);
    const kb  = (f.size / 1024).toFixed(1);
    const tag = i === 0 ? ' (latest)' : '';

    // Try to read result from JSON sidecar
    let resultTag = '';
    const jsonPath = f.full.replace(/\.md$/, '.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (j && j.result) resultTag = '  [' + j.result.toUpperCase() + ']';
        if (j && j.apiBackend) resultTag += '  api:' + j.apiBackend;
        if (j && typeof j.checks === 'object') {
          const arr = Array.isArray(j.checks) ? j.checks : [];
          const dbCheck = arr.find((c) => c.name === 'events_db_verification');
          if (dbCheck && dbCheck.result !== 'skip') resultTag += '  db-verified';
        }
      } catch { /* ignore bad JSON */ }
    }

    process.stdout.write('  ' + (i + 1) + '. ' + f.name + '  ' + dt + '  ' + kb + ' KB' + tag + resultTag + '\n');
  }

  return files;
}

const liveFiles     = listDir(LIVE_DIR,     'Live smoke (mock API)');
const localApiFiles = listDir(LOCAL_API_DIR, 'Local-API smoke (real API)');

const total = liveFiles.length + localApiFiles.length;

if (total === 0) {
  process.stdout.write('\n[--] No smoke reports found in either directory.\n');
  process.stdout.write('[--] Generate a fixture/live report:    pnpm smoke:chatgpt:live\n');
  process.stdout.write('[--] Generate a local-API report:       pnpm smoke:chatgpt:local-api\n');
} else {
  process.stdout.write('\n[--] Total: ' + total + ' report(s) across both directories.\n');
  process.stdout.write('[--] View latest live report:           pnpm smoke:chatgpt:report\n');
  process.stdout.write('[--] View latest local-API report:      pnpm smoke:chatgpt:local-api:report\n');
  process.stdout.write('[--] Clean reports:                     pnpm smoke:chatgpt:reports:clean\n');
}
process.stdout.write('\n');
