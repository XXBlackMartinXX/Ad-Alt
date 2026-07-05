'use strict';
/**
 * Tests for scripts/closeout-controlled-pilot.js.
 *
 * Feeds synthetic piped yes/no answers via stdin (never real buyer/
 * payment/prompt content) and asserts the resulting PILOT_CLOSEOUT_SUMMARY.md
 * and exit code.
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildPilotSetup, validatePilotSetup, deriveStatus } = require('../lib/pilot-setup.js');
const {
  generatePilotSetupMd,
  generateManualRevenueRecordMd,
  generatePreLaunchChecklistMd,
  generateRollbackConfirmationMd,
} = require('../lib/pilot-instance-docs.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLOSEOUT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'closeout-controlled-pilot.js');

function freshInstancesDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-closeout-test-'));
}

function writeInstance(instancesDir, partialSetup) {
  const setup = buildPilotSetup(partialSetup);
  const validation = validatePilotSetup(setup);
  setup.status = deriveStatus(setup, validation);
  const dir = path.join(instancesDir, setup.pilotId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PILOT_SETUP.md'), generatePilotSetupMd(setup, validation), 'utf8');
  fs.writeFileSync(path.join(dir, 'MANUAL_REVENUE_RECORD.md'), generateManualRevenueRecordMd(setup), 'utf8');
  fs.writeFileSync(path.join(dir, 'PRE_LAUNCH_CHECKLIST.md'), generatePreLaunchChecklistMd(setup, validation), 'utf8');
  fs.writeFileSync(path.join(dir, 'ROLLBACK_CONFIRMATION.md'), generateRollbackConfirmationMd(setup), 'utf8');
  fs.writeFileSync(path.join(dir, 'PILOT_SETUP.json'), JSON.stringify(setup, null, 2) + '\n', 'utf8');
  return { pilotId: setup.pilotId, dir };
}

function validFixtureFields(overrides) {
  return Object.assign(
    {
      pilotId: 'pilot-closeout-fixture',
      ownerInitials: 'JD',
      rollbackOwnerInitials: 'AB',
      buyerAlias: 'buyer-alpha-internal',
      budgetCapUsd: 25,
      startDate: '2026-07-10',
      endDate: '2026-07-17',
      chatgptOnly: true,
      rollbackConfirmed: true,
    },
    overrides || {},
  );
}

function runCloseout(args, instancesDir, answersLines) {
  return spawnSync(process.execPath, [CLOSEOUT_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input: answersLines.join('\n') + '\n',
    env: { ...process.env, PROMPTPROFIT_PILOT_INSTANCES_DIR: instancesDir },
  });
}

test('closeout errors when --pilot-id is missing', () => {
  const dir = freshInstancesDir();
  const result = spawnSync(process.execPath, [CLOSEOUT_SCRIPT], {
    cwd: REPO_ROOT, encoding: 'utf8',
    env: { ...process.env, PROMPTPROFIT_PILOT_INSTANCES_DIR: dir },
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: ERROR/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('closeout errors when the pilot instance does not exist', () => {
  const dir = freshInstancesDir();
  const result = runCloseout(['--pilot-id', 'does-not-exist'], dir, []);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /pilot instance not found/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('closeout produces STOP_REVIEW_REQUIRED when an S0/S1 issue is reported', () => {
  const dir = freshInstancesDir();
  const { pilotId, dir: instanceDir } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-closeout-s0s1' }));
  // budget cap respected, revenue record updated, S0/S1=YES, rollback needed, public release avoided, payout avoided
  const result = runCloseout(['--pilot-id', pilotId], dir, ['yes', 'yes', 'yes', 'no', 'yes', 'yes']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: STOP_REVIEW_REQUIRED/);
  const summary = fs.readFileSync(path.join(instanceDir, 'PILOT_CLOSEOUT_SUMMARY.md'), 'utf8');
  assert.match(summary, /STOP_REVIEW_REQUIRED/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('closeout produces STOP_REVIEW_REQUIRED when public release was NOT avoided, even with no S0/S1 issue', () => {
  const dir = freshInstancesDir();
  const { pilotId } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-closeout-public-release' }));
  const result = runCloseout(['--pilot-id', pilotId], dir, ['yes', 'yes', 'no', 'no', 'no', 'yes']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: STOP_REVIEW_REQUIRED/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('closeout produces CLOSED_READY_FOR_RECONCILIATION on all-safe answers', () => {
  const dir = freshInstancesDir();
  const { pilotId, dir: instanceDir } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-closeout-safe' }));
  const result = runCloseout(['--pilot-id', pilotId], dir, ['yes', 'yes', 'no', 'no', 'yes', 'yes']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Result: CLOSED_READY_FOR_RECONCILIATION/);
  const summary = fs.readFileSync(path.join(instanceDir, 'PILOT_CLOSEOUT_SUMMARY.md'), 'utf8');
  assert.match(summary, /CLOSED_READY_FOR_RECONCILIATION/);
  assert.doesNotMatch(summary, /prompt:|response:|chat history/i);
  fs.rmSync(dir, { recursive: true, force: true });
});
