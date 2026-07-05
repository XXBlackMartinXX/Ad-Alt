#!/usr/bin/env node
'use strict';
/**
 * Controlled ChatGPT Pilot Closeout Wizard.
 *
 * Asks only the six safe yes/no questions listed below -- never buyer
 * contact/payment details, never prompt/response/chat content -- and
 * writes a sanitized PILOT_CLOSEOUT_SUMMARY.md for the given pilot
 * instance.
 *
 * Usage:
 *   node scripts/closeout-controlled-pilot.js --pilot-id <id>
 *   pnpm -w run pilot:closeout -- --pilot-id <id>
 */

const fs = require('fs');
const path = require('path');
const { loadPilotSetup } = require('./lib/pilot-launch.js');
const { generatePilotCloseoutSummaryMd } = require('./lib/pilot-launch-docs.js');
const { makeAsker } = require('./lib/interactive-asker.js');

function parseArgs(argv) {
  const idIdx = argv.indexOf('--pilot-id');
  return { pilotId: idIdx === -1 ? undefined : argv[idIdx + 1] };
}

async function main() {
  console.log('[>>] Controlled ChatGPT Pilot Closeout');
  console.log('------------------------------------------------------------');

  const { pilotId } = parseArgs(process.argv.slice(2));
  if (!pilotId) {
    console.log('');
    console.log('Result: ERROR');
    console.log('Reason: --pilot-id <id> is required.');
    process.exit(1);
  }

  const { instanceDir, exists, setup, parseError } = loadPilotSetup(pilotId);
  if (!exists) {
    console.log('');
    console.log('Result: ERROR');
    console.log(`Reason: pilot instance not found (${instanceDir}).`);
    process.exit(1);
  }
  if (parseError || !setup) {
    console.log('');
    console.log('Result: ERROR');
    console.log(`Reason: PILOT_SETUP.json could not be read: ${parseError}`);
    process.exit(1);
  }

  const manualRecordPath = path.join(instanceDir, 'MANUAL_REVENUE_RECORD.md');
  const manualRecordExists = fs.existsSync(manualRecordPath);
  console.log(`MANUAL_REVENUE_RECORD.md exists: ${manualRecordExists ? 'yes' : 'no'}`);
  if (!manualRecordExists) {
    console.log('  NOTE: proceeding, but this pilot instance is missing its manual revenue record file.');
  }

  const { ask, close: closeAsker } = makeAsker();
  const askYesNo = async (q) => {
    for (;;) {
      const ans = (await ask(`${q} (yes/no): `)).toLowerCase();
      if (ans === 'yes' || ans === 'y') return true;
      if (ans === 'no' || ans === 'n') return false;
      console.log('  Please answer yes or no.');
    }
  };

  console.log('');
  const budgetCapRespected = await askYesNo('Was the budget cap respected?');
  const manualRevenueRecordUpdated = await askYesNo('Was the manual revenue record updated?');
  const hadS0S1Issue = await askYesNo('Was there any S0/S1 issue?');
  const rollbackNeeded = await askYesNo('Was rollback needed?');
  const publicReleaseAvoided = await askYesNo('Was public release avoided?');
  const realPayoutAvoided = await askYesNo('Was real payout execution avoided?');
  closeAsker();

  const answers = {
    budgetCapRespected,
    manualRevenueRecordUpdated,
    hadS0S1Issue,
    rollbackNeeded,
    publicReleaseAvoided,
    realPayoutAvoided,
    closedAt: new Date().toISOString(),
  };

  // An S0/S1 issue always requires human review before reconciliation.
  // A "no" on either scope-boundary question (public release avoided /
  // real payout avoided) is treated the same way -- a strengthening
  // beyond the letter of this workflow's own spec, since either answer
  // being false means a non-negotiable pilot boundary was crossed and
  // this pilot cannot simply be marked closed-and-ready.
  const result = (hadS0S1Issue || !publicReleaseAvoided || !realPayoutAvoided)
    ? 'STOP_REVIEW_REQUIRED'
    : 'CLOSED_READY_FOR_RECONCILIATION';

  const summaryPath = path.join(instanceDir, 'PILOT_CLOSEOUT_SUMMARY.md');
  fs.writeFileSync(summaryPath, generatePilotCloseoutSummaryMd(setup, answers, result), 'utf8');

  console.log('');
  console.log(`Result: ${result}`);
  console.log(`Summary written to: ${summaryPath}`);
  if (result === 'STOP_REVIEW_REQUIRED') {
    console.log('Reason: an S0/S1 issue was reported, or a non-negotiable scope');
    console.log('boundary (public release / real payout) was not confirmed avoided.');
    console.log('Do not mark this pilot reconciled until reviewed.');
  } else {
    console.log('Next: re-run check:billing:reconciliation -- --mode internal-beta');
    console.log('and complete PILOT_ACCEPTANCE_CHECKLIST.md\'s post-pilot section.');
  }

  process.exit(result === 'CLOSED_READY_FOR_RECONCILIATION' ? 0 : 1);
}

main();
