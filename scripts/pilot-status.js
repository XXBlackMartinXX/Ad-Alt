#!/usr/bin/env node
'use strict';
/**
 * Controlled ChatGPT Pilot Status Dashboard.
 *
 * Read-only, fast (no gates re-run) summary of a single pilot instance's
 * current state, so an operator can see what to do next without waiting
 * on the multi-minute preflight gate chain. The reported preflight
 * status is "last known" -- the decision recorded in the most recent
 * launch session's LAUNCH_SESSION.md -- not a live re-check; run
 * `pilot:preflight` for a live result.
 *
 * Prints no private data: only the sanitized fields already present in
 * PILOT_SETUP.json (pilot ID, status, budget cap, platform) and file-
 * existence booleans.
 *
 * Usage:
 *   node scripts/pilot-status.js --pilot-id <id>
 *   pnpm -w run pilot:status -- --pilot-id <id>
 */

const fs = require('fs');
const path = require('path');
const { loadPilotSetup, listLaunchSessions } = require('./lib/pilot-launch.js');

function parseArgs(argv) {
  const idIdx = argv.indexOf('--pilot-id');
  return { pilotId: idIdx === -1 ? undefined : argv[idIdx + 1] };
}

function extractField(content, label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*\`?([^\`\\n]*)\`?`);
  const m = content.match(re);
  return m ? m[1].trim() : undefined;
}

function main() {
  console.log('[>>] Controlled ChatGPT Pilot Status');
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
    console.log(`Pilot ID: ${pilotId}`);
    console.log('Setup status: NOT FOUND');
    console.log(`Next recommended command: pnpm -w run pilot:setup -- --pilot-id ${pilotId}`);
    process.exit(1);
  }
  if (parseError || !setup) {
    console.log('');
    console.log(`Pilot ID: ${pilotId}`);
    console.log(`Setup status: UNREADABLE (${parseError})`);
    process.exit(1);
  }

  const manualRecordExists = fs.existsSync(path.join(instanceDir, 'MANUAL_REVENUE_RECORD.md'));

  const sessions = listLaunchSessions(pilotId);
  let latestSession = null;
  let lastKnownPreflightStatus = 'no launch session yet';
  if (sessions.length > 0) {
    latestSession = sessions[0];
    const sessionFile = path.join(instanceDir, 'launch-sessions', latestSession, 'LAUNCH_SESSION.md');
    if (fs.existsSync(sessionFile)) {
      const content = fs.readFileSync(sessionFile, 'utf8');
      lastKnownPreflightStatus = extractField(content, 'Decision') || 'unknown';
    }
  }

  const closeoutPath = path.join(instanceDir, 'PILOT_CLOSEOUT_SUMMARY.md');
  let closeoutStatus = 'not closed out yet';
  if (fs.existsSync(closeoutPath)) {
    const content = fs.readFileSync(closeoutPath, 'utf8');
    closeoutStatus = extractField(content, 'Result') || 'unknown';
  }

  let nextCommand;
  if (setup.status !== 'READY') {
    nextCommand = `Fix pilot setup (status is ${setup.status}), then: pnpm -w run pilot:preflight -- --pilot-id ${pilotId}`;
  } else if (!sessions.length) {
    nextCommand = `pnpm -w run pilot:launch -- --pilot-id ${pilotId} --dry-run`;
  } else if (!fs.existsSync(closeoutPath)) {
    nextCommand = `pnpm -w run pilot:closeout -- --pilot-id ${pilotId}`;
  } else {
    nextCommand = 'Pilot closed out. See PILOT_CLOSEOUT_SUMMARY.md for the reconciliation next step.';
  }

  console.log('');
  console.log(`Pilot ID: ${setup.pilotId}`);
  console.log(`Setup status: ${setup.status}`);
  console.log(`Preflight (last known): ${lastKnownPreflightStatus}`);
  console.log(`Budget cap: ${setup.budgetCapUsd !== '' && setup.budgetCapUsd !== undefined ? `$${setup.budgetCapUsd}` : '[not set]'}`);
  console.log(`Platform: ${setup.platform}`);
  console.log(`Manual revenue record exists: ${manualRecordExists ? 'yes' : 'no'}`);
  console.log(`Latest launch session: ${latestSession || '(none)'}`);
  console.log(`Closeout status: ${closeoutStatus}`);
  console.log(`Next recommended command: ${nextCommand}`);

  process.exit(0);
}

main();
