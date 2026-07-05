'use strict';
/**
 * Tests for scripts/launch-controlled-pilot.js.
 *
 * Most cases exercise fast HOLD paths (missing pilot, local validation
 * failure, or a preflight failure caught by preflight's own fail-fast
 * document scan) -- these never invoke the expensive upstream gate
 * chain. Exactly one test exercises the full GO path via `--dry-run`
 * (which still fresh-runs the real pilot:preflight gate, per this
 * script's own dry-run contract), and is genuinely slow, consistent
 * with every other fresh-execution gate test in this repo. No test ever
 * depends on a real ChatGPT/browser login -- `--dry-run` never opens a
 * browser unless `--open-browser` is also passed, which none of these
 * tests do.
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
const LAUNCH_SCRIPT = path.join(REPO_ROOT, 'scripts', 'launch-controlled-pilot.js');

const FORBIDDEN_FIELD_NAMES = [
  'promptText', 'aiResponse', 'chatHistory', 'conversationId', 'pageUrl', 'pageTitle',
  'domText', 'cookies', 'authToken', 'sessionCookie', 'clipboardContent', 'screenshotData',
  'videoData', 'traceData', 'commandText', 'terminalBuffer', 'accountEmail', 'paymentCredential',
  'cardNumber', 'bankAccount',
];

function freshInstancesDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-launch-cli-test-'));
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
      pilotId: 'pilot-launch-fixture',
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

function runLaunch(args, instancesDir) {
  return spawnSync(process.execPath, [LAUNCH_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PROMPTPROFIT_PILOT_INSTANCES_DIR: instancesDir },
  });
}

test('pilot:launch HOLD when --pilot-id is missing', () => {
  const dir = freshInstancesDir();
  const result = runLaunch(['--dry-run'], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: HOLD/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pilot:launch HOLD when the pilot instance does not exist', () => {
  const dir = freshInstancesDir();
  const result = runLaunch(['--pilot-id', 'does-not-exist', '--dry-run'], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: HOLD/);
  assert.match(result.stdout, /pilot instance not found/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pilot:launch HOLD when local validation fails (missing budget cap) -- does not run preflight, does not open a browser', () => {
  const dir = freshInstancesDir();
  const { pilotId } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-missing-budget', budgetCapUsd: '' }));
  const result = runLaunch(['--pilot-id', pilotId, '--dry-run'], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: HOLD/);
  assert.match(result.stdout, /budgetCapUsd is required/);
  assert.match(result.stdout, /not running preflight/);
  assert.match(result.stdout, /Browser was NOT opened/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pilot:launch HOLD when preflight fails (forbidden content injected into a generated doc, caught by preflight\'s own fail-fast scan)', () => {
  const dir = freshInstancesDir();
  const { pilotId, dir: instanceDir } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-preflight-will-fail' }));
  // The JSON fields themselves are clean (passes this script's own local
  // validateLaunchReadiness), but the generated markdown doc is hand-
  // edited to contain a forbidden pattern that only preflight's own
  // document-level scan catches -- proving this script actually invokes
  // the real preflight gate and correctly propagates its HOLD, without
  // needing to wait on the full multi-minute upstream chain (preflight's
  // own fail-fast triggers before its expensive gates run). Inserted
  // right after the file's own heading (not appended at the end, which
  // sits right after this same generator's trailing privacy-warning
  // boilerplate -- that boilerplate itself contains "do not", which
  // preflight's negation-aware scanner would then treat as the nearest
  // preceding negation cue and wrongly consider the injected text
  // negated/disclaimed rather than a real violation).
  const recordPath = path.join(instanceDir, 'MANUAL_REVENUE_RECORD.md');
  const recordLines = fs.readFileSync(recordPath, 'utf8').split('\n');
  recordLines.splice(1, 0, 'routing number 123456789');
  fs.writeFileSync(recordPath, recordLines.join('\n'), 'utf8');

  const result = runLaunch(['--pilot-id', pilotId, '--dry-run'], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Result: HOLD/);
  assert.match(result.stdout, /pilot:preflight did not return GO/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dry-run does not create real launch-session artifacts under the instance folder', () => {
  const dir = freshInstancesDir();
  const { pilotId, dir: instanceDir } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-dry-run-no-artifacts', budgetCapUsd: '' }));
  runLaunch(['--pilot-id', pilotId, '--dry-run'], dir);
  assert.equal(fs.existsSync(path.join(instanceDir, 'launch-sessions')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a fully valid, READY, rollback-confirmed fixture pilot reaches the full readiness chain and produces GO via --dry-run (never opens a browser)', { timeout: 240000 }, () => {
  const dir = freshInstancesDir();
  const { pilotId } = writeInstance(dir, validFixtureFields({ pilotId: 'pilot-launch-go-path' }));
  const result = runLaunch(['--pilot-id', pilotId, '--dry-run'], dir);
  assert.match(result.stdout, /Local validation passed/);
  assert.match(result.stdout, /Result: GO \(dry run/);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /Browser opened\./);

  // Locate the dry-run temp session dir this run reported and verify its
  // written files contain none of the forbidden field names, and no
  // "Browser opened" claim (since --open-browser was never passed).
  const dirMatch = result.stdout.match(/Launch session record written to: (\S+)/);
  assert.ok(dirMatch, 'expected a "Launch session record written to" line');
  const sessionDir = dirMatch[1];
  const writtenFiles = ['LAUNCH_SESSION.md', 'SAFE_OPERATOR_ACTIONS.md', 'STOP_CONDITIONS.md', 'POST_PILOT_CLOSEOUT.md'];
  for (const fileName of writtenFiles) {
    const filePath = path.join(sessionDir, fileName);
    assert.ok(fs.existsSync(filePath), `${fileName} should have been written`);
    const content = fs.readFileSync(filePath, 'utf8');
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELD_NAMES.join('|')})["']?\\s*:`, 'i');
    assert.doesNotMatch(content, fieldKeyRe, `${fileName} must not contain a forbidden field name`);
    assert.doesNotMatch(content, /prompt:|response:|chat history|conversation id/i,
      `${fileName} must never reference prompt/response/chat content`);
  }
  fs.rmSync(sessionDir, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});
