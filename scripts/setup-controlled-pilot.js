#!/usr/bin/env node
'use strict';
/**
 * Controlled ChatGPT Pilot Setup Wizard.
 *
 * Interactive mode (default): asks only the safe questions listed in
 * PILOT_SETUP_AUTOMATION_REVIEW.md / this script's own prompts, then
 * writes a sanitized pilot instance under
 * docs/internal-beta/revenue-pilot/instances/<PILOT_ID>/.
 *
 * Template mode (--template): creates a blank, sanitized instance
 * folder with no questions asked. Always status
 * DRAFT_NEEDS_HUMAN_COMPLETION -- never READY.
 *
 * This script never collects, stores, or transmits prompt/response/
 * chat/page/terminal content, payment credentials, or account
 * identifiers -- see scripts/lib/pilot-setup.js's forbidden-pattern
 * scanner, applied to every free-text answer before it is written.
 *
 * Usage:
 *   node scripts/setup-controlled-pilot.js                 (interactive)
 *   node scripts/setup-controlled-pilot.js --template       (blank template)
 *   node scripts/setup-controlled-pilot.js --template --pilot-id my-id
 *   pnpm -w run pilot:setup
 *   pnpm -w run pilot:setup -- --template
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  buildPilotSetup,
  validatePilotSetup,
  deriveStatus,
  scanForPrivateData,
} = require('./lib/pilot-setup.js');
const {
  generatePilotSetupMd,
  generateManualRevenueRecordMd,
  generatePreLaunchChecklistMd,
  generateRollbackConfirmationMd,
} = require('./lib/pilot-instance-docs.js');

const REPO_ROOT = path.resolve(__dirname, '..');
// Overridable for tests, so automated test runs never write into the
// real tracked instances directory.
const INSTANCES_DIR = process.env.PROMPTPROFIT_PILOT_INSTANCES_DIR
  || path.join(REPO_ROOT, 'docs', 'internal-beta', 'revenue-pilot', 'instances');

function parseArgs(argv) {
  const idIdx = argv.indexOf('--pilot-id');
  return {
    template: argv.includes('--template'),
    pilotIdOverride: idIdx === -1 ? undefined : argv[idIdx + 1],
  };
}

function writeInstanceFiles(setup, validation) {
  const dir = path.join(INSTANCES_DIR, setup.pilotId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PILOT_SETUP.md'), generatePilotSetupMd(setup, validation), 'utf8');
  fs.writeFileSync(path.join(dir, 'MANUAL_REVENUE_RECORD.md'), generateManualRevenueRecordMd(setup), 'utf8');
  fs.writeFileSync(path.join(dir, 'PRE_LAUNCH_CHECKLIST.md'), generatePreLaunchChecklistMd(setup, validation), 'utf8');
  fs.writeFileSync(path.join(dir, 'ROLLBACK_CONFIRMATION.md'), generateRollbackConfirmationMd(setup), 'utf8');
  // Machine-readable sidecar for scripts/check-controlled-pilot-preflight.js
  // -- same sanitized fields as the markdown above, just structured for
  // programmatic re-validation instead of markdown parsing.
  fs.writeFileSync(path.join(dir, 'PILOT_SETUP.json'), JSON.stringify(setup, null, 2) + '\n', 'utf8');
  return dir;
}

/**
 * Reuses an existing blank template's createdAt timestamp if one exists,
 * so re-running --template for the same (still-blank) pilot ID produces
 * byte-identical output instead of dirtying the tree with a fresh
 * timestamp every time (the same class of problem
 * scripts/lib/report-writer.js already solved for generated reports).
 */
function existingTemplateCreatedAt(pilotId) {
  const jsonPath = path.join(INSTANCES_DIR, pilotId, 'PILOT_SETUP.json');
  if (!fs.existsSync(jsonPath)) return undefined;
  try {
    const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return existing.status === 'DRAFT_NEEDS_HUMAN_COMPLETION' ? existing.createdAt : undefined;
  } catch {
    return undefined;
  }
}

function runTemplateMode(pilotIdOverride) {
  const pilotId = pilotIdOverride || 'TEMPLATE';
  const setup = buildPilotSetup({
    pilotId,
    createdAt: existingTemplateCreatedAt(pilotId),
    status: 'DRAFT_NEEDS_HUMAN_COMPLETION',
  });
  const validation = validatePilotSetup(setup);
  const dir = writeInstanceFiles(setup, validation);

  console.log('[>>] Controlled ChatGPT Pilot Setup — template mode');
  console.log('------------------------------------------------------------');
  console.log(`Created blank template at: ${path.relative(REPO_ROOT, dir)}`);
  console.log(`Status: ${setup.status} (never GO/READY from template mode alone)`);
  console.log('');
  console.log('Fill in the required fields, then re-run this wizard in');
  console.log('interactive mode (or hand-edit PILOT_SETUP.md and re-validate');
  console.log('via pilot:preflight) before launch.');
  process.exit(0);
}

/**
 * Builds an `ask(prompt)` function that works correctly whether stdin is
 * a real interactive terminal or a piped/redirected stream (as used by
 * this script's own automated tests).
 *
 * On a real TTY, `readline.question()` is used normally -- it prints
 * the prompt and waits for the next line the human types.
 *
 * On a non-TTY stream, Node's readline emits every buffered 'line'
 * event as fast as the event loop allows, independent of whether a
 * `question()` call is currently pending -- sequential `await
 * question()` calls each register a one-shot listener too late to
 * catch most of the buffered lines, silently dropping answers. To
 * avoid that race, non-TTY mode instead reads all of stdin up front,
 * splits it into lines, and hands them out one at a time in order,
 * printing the prompt text itself (mirroring what a human would see).
 */
function makeAsker() {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return {
      ask: (q) => new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim()))),
      close: () => rl.close(),
    };
  }

  const rawInput = fs.readFileSync(0, 'utf8');
  const queue = rawInput.split('\n').map((l) => l.trim());
  return {
    ask: async (q) => {
      process.stdout.write(q);
      const next = queue.shift();
      if (next === undefined) {
        throw new Error('Pilot setup wizard ran out of piped answers before all questions were asked.');
      }
      process.stdout.write(`${next}\n`);
      return next;
    },
    close: () => {},
  };
}

async function runInteractiveMode(pilotIdOverride) {
  const { ask, close: closeAsker } = makeAsker();
  const askRequired = async (q) => {
    for (;;) {
      const ans = await ask(q);
      if (ans.length > 0) return ans;
      console.log('  This field is required.');
    }
  };
  const askYesNo = async (q) => {
    for (;;) {
      const ans = (await ask(`${q} (yes/no): `)).toLowerCase();
      if (ans === 'yes' || ans === 'y') return true;
      if (ans === 'no' || ans === 'n') return false;
      console.log('  Please answer yes or no.');
    }
  };
  const askDate = async (q) => {
    for (;;) {
      const ans = await ask(`${q} (YYYY-MM-DD): `);
      if (/^\d{4}-\d{2}-\d{2}$/.test(ans)) return ans;
      console.log('  Please use YYYY-MM-DD format.');
    }
  };
  const askSanitized = async (q) => {
    for (;;) {
      const ans = await askRequired(q);
      const hits = scanForPrivateData(ans);
      if (hits.length === 0) return ans;
      console.log(`  That answer looks like it contains: ${hits.join(', ')}.`);
      console.log('  Please use a short alias/reference with no private data.');
    }
  };

  console.log('[>>] Controlled ChatGPT Pilot Setup Wizard');
  console.log('------------------------------------------------------------');
  console.log('This creates a founder-operated, ChatGPT-browser-only,');
  console.log('manual-revenue-record pilot instance. No real payment or');
  console.log('account data is ever collected by this wizard.');
  console.log('');

  const idAnswer = pilotIdOverride || (await ask('Pilot ID (leave blank to auto-generate): '));
  const ownerInitials = await askRequired('Owner initials: ');
  const rollbackOwnerInitials = await askRequired('Rollback owner initials: ');
  const buyerAlias = await askSanitized('Buyer alias / internal reference (no name, email, or payment info): ');
  const budgetCapUsd = await askRequired('Budget cap in USD (small, tiny-pilot ceiling): ');
  const startDate = await askDate('Start date');
  const endDate = await askDate('End date');

  const chatgptOnly = await askYesNo('Confirm this pilot is ChatGPT-browser-only');
  const noPublicRelease = await askYesNo('Confirm no public release of any kind');
  const noRealPayouts = await askYesNo('Confirm no real payout execution');
  const manualRevenueRecordRequired = await askYesNo('Confirm manual revenue recording only (no automatic billing)');
  const rollbackConfirmed = await askYesNo('Confirm the rollback plan has been reviewed');
  const finalPreflightRequired = await askYesNo('Confirm a final preflight will be run before launch');

  closeAsker();

  if (!chatgptOnly || !noPublicRelease || !noRealPayouts || !manualRevenueRecordRequired || !finalPreflightRequired) {
    console.log('');
    console.log('[HOLD] This wizard only supports the fixed controlled-pilot scope:');
    console.log('       ChatGPT-browser-only, no public release, no real payouts,');
    console.log('       manual revenue recording, and a final preflight before launch.');
    console.log('       Expanding scope requires explicit owner re-approval outside');
    console.log('       this tool -- see CONTROLLED_REVENUE_PILOT_CRITERIA.md.');
    console.log('       No pilot instance was created.');
    process.exit(1);
  }

  const setup = buildPilotSetup({
    pilotId: idAnswer || undefined,
    ownerInitials,
    rollbackOwnerInitials,
    buyerAlias,
    budgetCapUsd,
    startDate,
    endDate,
    chatgptOnly,
    rollbackConfirmed,
    status: 'DRAFT',
  });
  const validation = validatePilotSetup(setup);
  setup.status = deriveStatus(setup, validation);
  const dir = writeInstanceFiles(setup, validation);

  console.log('');
  console.log(`Pilot instance written to: ${path.relative(REPO_ROOT, dir)}`);
  console.log(`Status: ${setup.status}`);
  if (validation.errors.length > 0) {
    console.log('');
    console.log('Errors (this pilot is HOLD until these are fixed):');
    validation.errors.forEach((e) => console.log(`  - ${e}`));
  }
  if (validation.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    validation.warnings.forEach((w) => console.log(`  - ${w}`));
  }
  console.log('');
  console.log(`Next: pnpm -w run pilot:preflight -- --pilot-id ${setup.pilotId}`);
  process.exit(validation.valid ? 0 : 1);
}

async function main() {
  const { template, pilotIdOverride } = parseArgs(process.argv.slice(2));
  if (template) {
    runTemplateMode(pilotIdOverride);
  } else {
    await runInteractiveMode(pilotIdOverride);
  }
}

main();
