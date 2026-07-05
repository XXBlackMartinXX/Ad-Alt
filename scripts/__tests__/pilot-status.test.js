'use strict';
/**
 * Tests for scripts/pilot-status.js.
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
const STATUS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'pilot-status.js');

function freshInstancesDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-status-test-'));
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
      pilotId: 'pilot-status-fixture',
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

function runStatus(args, instancesDir) {
  return spawnSync(process.execPath, [STATUS_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PROMPTPROFIT_PILOT_INSTANCES_DIR: instancesDir },
  });
}

test('pilot:status reports NOT FOUND and exits 1 for a missing pilot', () => {
  const dir = freshInstancesDir();
  const result = runStatus(['--pilot-id', 'does-not-exist'], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Setup status: NOT FOUND/);
  assert.match(result.stdout, /pilot:setup -- --pilot-id does-not-exist/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pilot:status reports full sanitized status for a valid READY pilot with no launch session yet', () => {
  const dir = freshInstancesDir();
  const { pilotId } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-status-ready' }));
  const result = runStatus(['--pilot-id', pilotId], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Setup status: READY/);
  assert.match(result.stdout, /Budget cap: \$25/);
  assert.match(result.stdout, /Platform: ChatGPT browser/);
  assert.match(result.stdout, /Manual revenue record exists: yes/);
  assert.match(result.stdout, /Latest launch session: \(none\)/);
  assert.match(result.stdout, /Closeout status: not closed out yet/);
  assert.match(result.stdout, /Next recommended command: pnpm -w run pilot:launch/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pilot:status reports HOLD-appropriate next command for an incomplete (non-READY) pilot', () => {
  const dir = freshInstancesDir();
  const { pilotId } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-status-incomplete', budgetCapUsd: '' }));
  const result = runStatus(['--pilot-id', pilotId], dir);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /Setup status: READY/);
  assert.match(result.stdout, /Next recommended command: Fix pilot setup/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pilot:status reflects the last known preflight decision from the most recent launch session', () => {
  const dir = freshInstancesDir();
  const { pilotId, dir: instanceDir } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-status-with-session' }));
  const sessionDir = path.join(instanceDir, 'launch-sessions', '2026-01-01T00-00-00-000Z');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'LAUNCH_SESSION.md'), '**Decision:** `GO`\n', 'utf8');
  const result = runStatus(['--pilot-id', pilotId], dir);
  assert.match(result.stdout, /Preflight \(last known\): GO/);
  assert.match(result.stdout, /Latest launch session: 2026-01-01T00-00-00-000Z/);
  assert.match(result.stdout, /Next recommended command: pnpm -w run pilot:closeout/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pilot:status never prints buyer alias or owner initials (no private/sanitized-but-unlisted fields beyond spec)', () => {
  const dir = freshInstancesDir();
  const { pilotId } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-status-no-extra-fields', buyerAlias: 'buyer-zzz-internal' }));
  const result = runStatus(['--pilot-id', pilotId], dir);
  assert.doesNotMatch(result.stdout, /buyer-zzz-internal/);
  fs.rmSync(dir, { recursive: true, force: true });
});
