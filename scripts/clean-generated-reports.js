'use strict';
/**
 * Restores the known set of tracked, auto-regenerated report files to
 * their last-committed (HEAD) state -- a safety net for the rare case
 * where a report was regenerated with genuinely different content (not
 * just a timestamp) that a developer wants to discard before committing,
 * without risking a broader `git checkout .`/`git clean` that could also
 * discard unrelated real work-in-progress.
 *
 * This is deliberately a narrow allowlist, not a general-purpose reset:
 * it touches ONLY the exact paths below, never anything else in the
 * working tree.
 *
 * Usage:
 *   node scripts/clean-generated-reports.js
 *   pnpm -w run clean:generated-reports
 */

const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

const GENERATED_REPORT_PATHS = [
  'docs/internal-beta/monetization/LEDGER_CONFIDENCE_REPORT.md',
  'docs/internal-beta/monetization/PAYOUT_SIMULATION_REPORT.md',
  'docs/internal-beta/monetization/PILOT_REHEARSAL_REPORT.md',
];

function main() {
  console.log('[>>] Restoring known generated report files to their last-committed (HEAD) state');
  console.log('------------------------------------------------------------');
  console.log('This touches ONLY these exact tracked files, nothing else:');
  GENERATED_REPORT_PATHS.forEach((p) => console.log(`  - ${p}`));
  console.log('');

  const result = spawnSync('git', ['checkout', '--', ...GENERATED_REPORT_PATHS], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error('');
    console.error('git checkout failed -- see output above. No other files were touched.');
    process.exit(result.status ?? 1);
  }

  console.log('Done. These files now match HEAD exactly. Re-run the relevant check');
  console.log('script (check:ledger:confidence / simulate:payouts / pilot:rehearsal)');
  console.log('if you need a fresh report -- since scripts/lib/report-writer.js now');
  console.log('skips no-op rewrites, a fresh run will only touch the file again if its');
  console.log('content genuinely changed.');
}

main();
