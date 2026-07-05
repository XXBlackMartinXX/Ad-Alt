#!/usr/bin/env node
'use strict';
/**
 * Controlled ChatGPT Pilot Launch Orchestrator.
 *
 * One command that automates every SAFE local step around launching a
 * controlled, founder-operated, ChatGPT-browser-only pilot, while
 * preserving every required human boundary (see PILOT_LAUNCH_DAY_
 * QUICKSTART.md and CONTROLLED_REVENUE_PILOT_CRITERIA.md).
 *
 * This script DOES: validate the pilot instance locally, run the real
 * pilot:preflight gate fresh, write a sanitized launch-session record,
 * optionally open local operator docs and a fresh disposable Chrome
 * profile pointed at chatgpt.com's root URL, and print exactly which
 * manual actions remain.
 *
 * This script NEVER: logs in, types/submits a prompt, reads page/DOM/
 * chat/response content, inspects cookies/tokens/storage, captures a
 * screenshot/video/trace, collects real buyer/payment data, executes a
 * real payout, or performs a public release.
 *
 * Usage:
 *   node scripts/launch-controlled-pilot.js --pilot-id <id>
 *   node scripts/launch-controlled-pilot.js --pilot-id <id> --dry-run
 *   node scripts/launch-controlled-pilot.js --pilot-id <id> --no-open-browser
 *   pnpm -w run pilot:launch -- --pilot-id <id>
 *   pnpm -w run pilot:launch -- --pilot-id <id> --dry-run
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCommand, describeFailure } = require('./lib/run-command.js');
const {
  REPO_ROOT,
  INSTANCES_DIR,
  validateLaunchReadiness,
  loadPilotSetup,
  makeSessionTimestamp,
  openFileWithDefaultApp,
  openChatGptBrowserSurface,
} = require('./lib/pilot-launch.js');
const {
  generateLaunchSessionMd,
  generateSafeOperatorActionsMd,
  generateStopConditionsMd,
  generatePostPilotCloseoutMd,
} = require('./lib/pilot-launch-docs.js');

const PREFLIGHT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-controlled-pilot-preflight.js');
const QUICKSTART_DOC = path.join(REPO_ROOT, 'docs', 'internal-beta', 'revenue-pilot', 'PILOT_LAUNCH_DAY_QUICKSTART.md');

function parseArgs(argv) {
  const idIdx = argv.indexOf('--pilot-id');
  return {
    pilotId: idIdx === -1 ? undefined : argv[idIdx + 1],
    dryRun: argv.includes('--dry-run'),
    openBrowser: argv.includes('--open-browser'),
    noOpenBrowser: argv.includes('--no-open-browser'),
    noOpenDocs: argv.includes('--no-open-docs'),
    // Accepted for forward compatibility / explicit scripted invocations.
    // A GO decision from validation + real preflight is already the sole
    // gate for proceeding -- these flags never change that decision.
    confirmed: argv.includes('--yes') || argv.includes('--confirm-go'),
  };
}

function runPreflight(pilotId) {
  const result = runCommand(process.execPath, [PREFLIGHT_SCRIPT, '--pilot-id', pilotId], { cwd: REPO_ROOT });
  return { ok: result.ok, detail: result.ok ? '' : describeFailure(result) };
}

function writeSessionFiles(sessionDir, setup, decision, reasons, timestamp, browserOpened, browserReason, dryRun) {
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, 'LAUNCH_SESSION.md'),
    generateLaunchSessionMd({ setup, decision, reasons, timestamp, browserOpened, browserReason, dryRun }),
    'utf8',
  );
  if (decision === 'GO') {
    fs.writeFileSync(path.join(sessionDir, 'SAFE_OPERATOR_ACTIONS.md'), generateSafeOperatorActionsMd(setup), 'utf8');
    fs.writeFileSync(path.join(sessionDir, 'STOP_CONDITIONS.md'), generateStopConditionsMd(setup), 'utf8');
    fs.writeFileSync(path.join(sessionDir, 'POST_PILOT_CLOSEOUT.md'), generatePostPilotCloseoutMd(setup), 'utf8');
  }
}

function printOperatorScreen(setup, sessionDir) {
  console.log('');
  console.log('============================================================');
  console.log('STATUS: GO');
  console.log(`PILOT ID: ${setup.pilotId}`);
  console.log(`BUDGET CAP: $${setup.budgetCapUsd}`);
  console.log('PLATFORM: ChatGPT browser only');
  console.log(`LAUNCH SESSION: ${path.relative(REPO_ROOT, sessionDir)}`);
  console.log('MANUAL ACTIONS LEFT:');
  console.log('  - log into ChatGPT manually if needed');
  console.log('  - run the pilot interaction manually');
  console.log('  - record revenue manually (MANUAL_REVENUE_RECORD.md)');
  console.log('  - stop on any S0/S1 issue (see STOP_CONDITIONS.md)');
  console.log('  - run pilot:closeout when the pilot interaction is done');
  console.log('============================================================');
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('[>>] Controlled ChatGPT Pilot Launch');
  console.log('------------------------------------------------------------');

  if (!args.pilotId) {
    console.log('');
    console.log('Result: HOLD');
    console.log('Reason: --pilot-id <id> is required.');
    process.exit(1);
  }

  const { instanceDir, exists, setup, parseError } = loadPilotSetup(args.pilotId);

  if (!exists) {
    console.log('');
    console.log('Result: HOLD');
    console.log(`Reason: pilot instance not found (${path.relative(REPO_ROOT, instanceDir)}).`);
    console.log(`Run: pnpm -w run pilot:setup -- --pilot-id ${args.pilotId}`);
    process.exit(1);
  }
  if (parseError || !setup) {
    console.log('');
    console.log('Result: HOLD');
    console.log(`Reason: PILOT_SETUP.json could not be read: ${parseError}`);
    process.exit(1);
  }

  console.log(`Pilot: ${setup.pilotId} (status: ${setup.status})`);
  console.log(args.dryRun ? 'Mode: DRY RUN' : 'Mode: REAL LAUNCH');

  const localValidation = validateLaunchReadiness(setup);
  let decision = 'HOLD';
  let reasons = [];

  if (!localValidation.valid) {
    reasons = localValidation.errors;
    console.log('');
    console.log('Local validation failed -- not running preflight.');
  } else {
    console.log('');
    console.log('Local validation passed. Running pilot:preflight fresh (this fresh-runs the full gate chain)...');
    const preflight = runPreflight(args.pilotId);
    if (preflight.ok) {
      decision = 'GO';
    } else {
      reasons = [`pilot:preflight did not return GO: ${preflight.detail}`];
    }
  }

  const timestamp = makeSessionTimestamp();
  const sessionsRoot = args.dryRun
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'promptprofit-pilot-launch-dry-run-'))
    : path.join(instanceDir, 'launch-sessions');
  const sessionDir = args.dryRun ? sessionsRoot : path.join(sessionsRoot, timestamp);

  let browserOpened = false;
  let browserReason = '';

  if (decision !== 'GO') {
    writeSessionFiles(sessionDir, setup, decision, reasons, timestamp, false, '', args.dryRun);
    console.log('');
    console.log('Result: HOLD');
    console.log('Reason:');
    reasons.forEach((r) => console.log(`  - ${r}`));
    console.log('');
    console.log(`Launch session record written to: ${args.dryRun ? sessionDir : path.relative(REPO_ROOT, sessionDir)}`);
    console.log('Browser was NOT opened.');
    process.exit(1);
  }

  // Decide whether to open the browser: real launches open by default
  // (per the launch-day quickstart) unless explicitly suppressed; dry
  // runs never open unless explicitly requested, so an automated dry
  // run never has a side effect on the operator's machine.
  const shouldOpenBrowser = args.dryRun ? args.openBrowser : !args.noOpenBrowser;
  if (shouldOpenBrowser) {
    console.log('');
    console.log('Opening a fresh, disposable Chrome profile with the extension loaded, pointed at chatgpt.com...');
    const result = openChatGptBrowserSurface({});
    browserOpened = result.opened;
    browserReason = result.reason;
    console.log(browserOpened ? '  Browser opened.' : `  Browser NOT opened: ${browserReason}`);
  } else {
    browserReason = args.dryRun ? 'dry run (pass --open-browser to also open it)' : 'suppressed via --no-open-browser';
  }

  writeSessionFiles(sessionDir, setup, decision, reasons, timestamp, browserOpened, browserReason, args.dryRun);

  if (!args.dryRun && !args.noOpenDocs) {
    console.log('');
    console.log('Opening local operator docs...');
    for (const docPath of [
      QUICKSTART_DOC,
      path.join(instanceDir, 'MANUAL_REVENUE_RECORD.md'),
      path.join(instanceDir, 'ROLLBACK_CONFIRMATION.md'),
    ]) {
      const r = openFileWithDefaultApp(docPath);
      console.log(`  ${path.relative(REPO_ROOT, docPath)}: ${r.opened ? 'opened' : `not opened (${r.reason})`}`);
    }
  }

  console.log('');
  console.log(`Launch session record written to: ${args.dryRun ? sessionDir : path.relative(REPO_ROOT, sessionDir)}`);

  if (args.dryRun) {
    console.log('');
    console.log('Result: GO (dry run -- no real launch performed)');
    console.log('A real launch (without --dry-run) would proceed: open local docs,');
    console.log(`open the ChatGPT browser surface (${browserOpened ? 'opened just now' : 'not opened this dry run'}), and print the operator screen below.`);
  } else {
    console.log('Result: GO');
  }
  printOperatorScreen(setup, sessionDir);

  process.exit(0);
}

main();
