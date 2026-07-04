'use strict';
/**
 * Tests for scripts/check-controlled-pilot-preflight.js.
 *
 * Most cases exercise the fail-fast HOLD path (cheap, local checks only
 * -- no upstream gates run), which is fast. Exactly one test exercises
 * the full GO path, which fresh-runs the entire upstream readiness
 * chain and is genuinely slow (consistent with every other
 * fresh-execution gate in this repo).
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
const PREFLIGHT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-controlled-pilot-preflight.js');

function freshInstancesDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-preflight-test-'));
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
  return setup.pilotId;
}

function validFixtureFields(overrides) {
  return Object.assign(
    {
      pilotId: 'pilot-preflight-fixture',
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

function runPreflight(args, instancesDir) {
  return spawnSync(process.execPath, [PREFLIGHT_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PROMPTPROFIT_PILOT_INSTANCES_DIR: instancesDir },
  });
}

test('missing --pilot-id produces HOLD', () => {
  const dir = freshInstancesDir();
  const result = runPreflight([], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: HOLD/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a nonexistent pilot instance folder produces HOLD (fast fail, no upstream gates run)', () => {
  const dir = freshInstancesDir();
  const result = runPreflight(['--pilot-id', 'does-not-exist'], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: HOLD/);
  assert.match(result.stdout, /Skipping expensive fresh-execution gates/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an incomplete instance (missing required fields) produces HOLD listing each missing field', () => {
  const dir = freshInstancesDir();
  const pilotId = writeInstance(dir, { pilotId: 'incomplete-pilot' });
  const result = runPreflight(['--pilot-id', pilotId], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: HOLD/);
  assert.match(result.stdout, /ownerInitials is required/);
  assert.match(result.stdout, /budgetCapUsd is required/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('private data injected directly into PILOT_SETUP.json is caught and produces HOLD', () => {
  const dir = freshInstancesDir();
  const pilotId = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-with-leaked-email' }));
  // Simulate a hand-edited instance file bypassing the wizard's own scan.
  const setupJsonPath = path.join(dir, pilotId, 'PILOT_SETUP.json');
  const setup = JSON.parse(fs.readFileSync(setupJsonPath, 'utf8'));
  setup.buyerAlias = 'contact buyer@example.com directly';
  fs.writeFileSync(setupJsonPath, JSON.stringify(setup, null, 2) + '\n', 'utf8');
  const setupMdPath = path.join(dir, pilotId, 'PILOT_SETUP.md');
  fs.writeFileSync(setupMdPath, fs.readFileSync(setupMdPath, 'utf8').replace('buyer-alpha-internal', 'contact buyer@example.com directly'), 'utf8');

  const result = runPreflight(['--pilot-id', pilotId], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: HOLD/);
  assert.match(result.stdout, /forbidden private data/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an unsupported platform label injected into notes produces HOLD', () => {
  const dir = freshInstancesDir();
  const pilotId = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-with-codex-mention', notes: '' }));
  const setupJsonPath = path.join(dir, pilotId, 'PILOT_SETUP.json');
  const setup = JSON.parse(fs.readFileSync(setupJsonPath, 'utf8'));
  setup.notes = 'also enable this for codex users';
  fs.writeFileSync(setupJsonPath, JSON.stringify(setup, null, 2) + '\n', 'utf8');
  const setupMdPath = path.join(dir, pilotId, 'PILOT_SETUP.md');
  fs.appendFileSync(setupMdPath, '\nalso enable this for codex users\n', 'utf8');

  const result = runPreflight(['--pilot-id', pilotId], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: HOLD/);
  assert.match(result.stdout, /unsupported-platform overclaim/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a fully valid sanitized instance reaches the full readiness chain and produces GO', { timeout: 240000 }, () => {
  const dir = freshInstancesDir();
  const pilotId = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-preflight-go-path' }));
  const result = runPreflight(['--pilot-id', pilotId], dir);
  assert.match(result.stdout, /check:final-internal-pilot/);
  assert.match(result.stdout, /check:license --mode public-release must FAIL/);
  assert.match(result.stdout, /Result: GO/);
  assert.equal(result.status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
