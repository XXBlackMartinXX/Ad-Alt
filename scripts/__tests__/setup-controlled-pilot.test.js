'use strict';
/**
 * Tests for scripts/setup-controlled-pilot.js -- template mode and the
 * interactive wizard, run as real child processes against a temp
 * instances directory (never the real tracked
 * docs/internal-beta/revenue-pilot/instances/).
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'setup-controlled-pilot.js');

function freshInstancesDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-setup-test-'));
}

function runWizard(args, stdinText, instancesDir) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    input: stdinText,
    encoding: 'utf8',
    env: { ...process.env, PROMPTPROFIT_PILOT_INSTANCES_DIR: instancesDir },
  });
}

const VALID_ANSWERS = [
  'pilot-fixture-test',
  'JD',
  'AB',
  'buyer-alpha',
  '25',
  '2026-07-10',
  '2026-07-17',
  'yes', // chatgptOnly
  'yes', // noPublicRelease
  'yes', // noRealPayouts
  'yes', // manualRevenueRecordRequired
  'yes', // rollbackConfirmed
  'yes', // finalPreflightRequired
].join('\n') + '\n';

test('template mode creates DRAFT_NEEDS_HUMAN_COMPLETION status, never GO/READY', () => {
  const dir = freshInstancesDir();
  const result = runWizard(['--template'], '', dir);
  assert.equal(result.status, 0);
  const setupMd = fs.readFileSync(path.join(dir, 'TEMPLATE', 'PILOT_SETUP.md'), 'utf8');
  assert.match(setupMd, /\*\*Status:\*\* `DRAFT_NEEDS_HUMAN_COMPLETION`/);
  assert.doesNotMatch(setupMd, /\*\*Status:\*\* `READY`/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('template mode creates all four required markdown instance files plus the JSON sidecar', () => {
  const dir = freshInstancesDir();
  runWizard(['--template'], '', dir);
  const files = fs.readdirSync(path.join(dir, 'TEMPLATE')).sort();
  assert.deepEqual(files, [
    'MANUAL_REVENUE_RECORD.md', 'PILOT_SETUP.json', 'PILOT_SETUP.md',
    'PRE_LAUNCH_CHECKLIST.md', 'ROLLBACK_CONFIRMATION.md',
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('template mode with a custom --pilot-id uses that ID', () => {
  const dir = freshInstancesDir();
  runWizard(['--template', '--pilot-id', 'custom-template-id'], '', dir);
  assert.equal(fs.existsSync(path.join(dir, 'custom-template-id', 'PILOT_SETUP.md')), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('interactive mode with fully valid answers produces a READY pilot', () => {
  const dir = freshInstancesDir();
  const result = runWizard([], VALID_ANSWERS, dir);
  assert.equal(result.status, 0);
  const setupMd = fs.readFileSync(path.join(dir, 'pilot-fixture-test', 'PILOT_SETUP.md'), 'utf8');
  assert.match(setupMd, /\*\*Status:\*\* `READY`/);
  assert.match(setupMd, /No validation errors\./);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('interactive mode rejects a buyerAlias containing an email and re-prompts until clean', () => {
  const dir = freshInstancesDir();
  const answers = [
    'pilot-fixture-email-test',
    'JD',
    'AB',
    'contact me at buyer@example.com', // rejected, re-prompted
    'buyer-alpha', // accepted on retry
    '25', '2026-07-10', '2026-07-17',
    'yes', 'yes', 'yes', 'yes', 'yes', 'yes',
  ].join('\n') + '\n';
  const result = runWizard([], answers, dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /looks like it contains: email address/);
  const setupMd = fs.readFileSync(path.join(dir, 'pilot-fixture-email-test', 'PILOT_SETUP.md'), 'utf8');
  assert.match(setupMd, /buyer-alpha/);
  assert.doesNotMatch(setupMd, /buyer@example\.com/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('interactive mode refuses to create an instance when chatgptOnly is declined', () => {
  const dir = freshInstancesDir();
  const answers = [
    'pilot-declined-scope',
    'JD',
    'AB',
    'buyer-alpha',
    '25', '2026-07-10', '2026-07-17',
    'no', // chatgptOnly declined
    'yes', 'yes', 'yes', 'yes', 'yes',
  ].join('\n') + '\n';
  const result = runWizard([], answers, dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[HOLD\]/);
  assert.equal(fs.existsSync(path.join(dir, 'pilot-declined-scope')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('interactive mode produces HOLD status (exit 1) when required fields would fail validation', () => {
  // budgetCapUsd far above the tiny-pilot ceiling -- passes the wizard's
  // own prompts (no client-side ceiling check there) but fails model
  // validation, so the written instance must be HOLD, not READY.
  const dir = freshInstancesDir();
  const answers = [
    'pilot-over-budget',
    'JD',
    'AB',
    'buyer-alpha',
    '999999',
    '2026-07-10', '2026-07-17',
    'yes', 'yes', 'yes', 'yes', 'yes', 'yes',
  ].join('\n') + '\n';
  const result = runWizard([], answers, dir);
  assert.equal(result.status, 1);
  const setupMd = fs.readFileSync(path.join(dir, 'pilot-over-budget', 'PILOT_SETUP.md'), 'utf8');
  assert.match(setupMd, /\*\*Status:\*\* `HOLD`/);
  assert.match(setupMd, /exceeds the tiny-capped-pilot ceiling/);
  fs.rmSync(dir, { recursive: true, force: true });
});
