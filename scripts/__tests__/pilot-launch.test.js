'use strict';
/**
 * Tests for scripts/lib/pilot-launch.js.
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  validateLaunchReadiness,
  loadPilotSetup,
  listLaunchSessions,
  makeSessionTimestamp,
  findChromeExecutable,
} = require('../lib/pilot-launch.js');
const { buildPilotSetup, validatePilotSetup, deriveStatus } = require('../lib/pilot-setup.js');

function validFixture(overrides) {
  const setup = buildPilotSetup(Object.assign(
    {
      pilotId: 'pilot-launch-lib-fixture',
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
  ));
  const validation = validatePilotSetup(setup);
  setup.status = deriveStatus(setup, validation);
  return setup;
}

test('validateLaunchReadiness passes a fully valid, READY, rollback-confirmed setup', () => {
  const setup = validFixture();
  const result = validateLaunchReadiness(setup);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('validateLaunchReadiness fails when status is not READY even if fields are individually valid', () => {
  const setup = validFixture();
  setup.status = 'DRAFT';
  const result = validateLaunchReadiness(setup);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /status must be READY/.test(e)));
});

test('validateLaunchReadiness fails when rollbackConfirmed is not true, even though validatePilotSetup only warns', () => {
  const setup = validFixture({ rollbackConfirmed: false });
  const base = validatePilotSetup(setup);
  assert.equal(base.valid, true); // base validator only warns
  const result = validateLaunchReadiness(setup);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /rollbackConfirmed must be true/.test(e)));
});

test('validateLaunchReadiness fails when setup is null', () => {
  const result = validateLaunchReadiness(null);
  assert.equal(result.valid, false);
});

test('loadPilotSetup reports exists:false for a missing instance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-launch-lib-test-'));
  process.env.PROMPTPROFIT_PILOT_INSTANCES_DIR = dir;
  delete require.cache[require.resolve('../lib/pilot-launch.js')];
  const { loadPilotSetup: freshLoad } = require('../lib/pilot-launch.js');
  const result = freshLoad('does-not-exist');
  assert.equal(result.exists, false);
  assert.equal(result.setup, null);
  delete process.env.PROMPTPROFIT_PILOT_INSTANCES_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listLaunchSessions returns an empty array when no sessions exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-launch-lib-test-'));
  process.env.PROMPTPROFIT_PILOT_INSTANCES_DIR = dir;
  delete require.cache[require.resolve('../lib/pilot-launch.js')];
  const { listLaunchSessions: freshList } = require('../lib/pilot-launch.js');
  assert.deepEqual(freshList('some-pilot'), []);
  delete process.env.PROMPTPROFIT_PILOT_INSTANCES_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listLaunchSessions returns newest-first for multiple session folders', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-launch-lib-test-'));
  process.env.PROMPTPROFIT_PILOT_INSTANCES_DIR = dir;
  delete require.cache[require.resolve('../lib/pilot-launch.js')];
  const { listLaunchSessions: freshList } = require('../lib/pilot-launch.js');
  const sessionsDir = path.join(dir, 'some-pilot', 'launch-sessions');
  fs.mkdirSync(path.join(sessionsDir, '2026-01-01T00-00-00-000Z'), { recursive: true });
  fs.mkdirSync(path.join(sessionsDir, '2026-06-01T00-00-00-000Z'), { recursive: true });
  const sessions = freshList('some-pilot');
  assert.deepEqual(sessions, ['2026-06-01T00-00-00-000Z', '2026-01-01T00-00-00-000Z']);
  delete process.env.PROMPTPROFIT_PILOT_INSTANCES_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('makeSessionTimestamp produces a Windows-path-safe string (no reserved characters)', () => {
  const ts = makeSessionTimestamp(new Date('2026-07-05T12:34:56.789Z'));
  // Windows forbids these characters in a path segment: < > : " / \ | ? *
  assert.doesNotMatch(ts, /[<>:"/\\|?*]/);
  assert.equal(ts, '2026-07-05T12-34-56-789Z');
});

test('findChromeExecutable does not throw when process.platform is win32 (Windows path handling)', () => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    delete require.cache[require.resolve('../lib/pilot-launch.js')];
    const { findChromeExecutable: freshFind } = require('../lib/pilot-launch.js');
    // No Chrome installed in this sandbox under any Windows-shaped path --
    // must return null, not throw, and must not crash on backslash paths.
    assert.doesNotThrow(() => freshFind());
    assert.equal(freshFind(), null);
  } finally {
    Object.defineProperty(process, 'platform', original);
    delete require.cache[require.resolve('../lib/pilot-launch.js')];
  }
});
