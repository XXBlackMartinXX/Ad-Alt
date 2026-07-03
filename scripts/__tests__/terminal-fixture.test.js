'use strict';
/**
 * Unit tests for scripts/lib/terminal-fixture.js -- the fixture-only
 * terminal/CLI integration prototype. Covers privacy (no forbidden fields
 * ever appear in the synthetic event) and kill-switch (global and
 * per-adapter suppression) behavior.
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ADAPTER_ID,
  FORBIDDEN_FIELDS,
  getSyntheticFlags,
  isAdapterDisabled,
  runSyntheticWaitStateFixture,
  findForbiddenFields,
} = require('../lib/terminal-fixture.js');

// ---------------------------------------------------------------------------
// Normal (enabled) path
// ---------------------------------------------------------------------------

test('renders a synthetic event when not kill-switched', () => {
  const result = runSyntheticWaitStateFixture(getSyntheticFlags());
  assert.equal(result.rendered, true);
  assert.equal(result.reason, 'ok');
  assert.ok(result.event);
});

test('the synthetic event uses the documented developer-tooling adapter ID', () => {
  const result = runSyntheticWaitStateFixture(getSyntheticFlags());
  assert.equal(result.event.adapterName, ADAPTER_ID);
  assert.equal(ADAPTER_ID, 'manual');
});

test('the synthetic event has the required identifiers', () => {
  const result = runSyntheticWaitStateFixture(getSyntheticFlags());
  assert.equal(typeof result.event.eventId, 'string');
  assert.equal(typeof result.event.sessionId, 'string');
  assert.equal(typeof result.event.clientTimestamp, 'string');
  assert.equal(typeof result.event.waitStateDurationMs, 'number');
  assert.ok(result.event.waitStateDurationMs > 0);
});

// ---------------------------------------------------------------------------
// Privacy — no forbidden field ever appears
// ---------------------------------------------------------------------------

test('the synthetic event contains none of the canonical forbidden fields', () => {
  const result = runSyntheticWaitStateFixture(getSyntheticFlags());
  const hits = findForbiddenFields(result.event);
  assert.deepEqual(hits, []);
});

test('FORBIDDEN_FIELDS covers every terminal-specific forbidden data category', () => {
  for (const field of [
    'commandText', 'commandArgs', 'stdout', 'stderr', 'terminalBuffer',
    'environmentVariables', 'workingDirectory',
  ]) {
    assert.ok(FORBIDDEN_FIELDS.includes(field), `expected FORBIDDEN_FIELDS to include ${field}`);
  }
});

test('findForbiddenFields detects a deliberately-injected forbidden field', () => {
  const dirtyEvent = { eventId: 'x', stdout: 'leaked output text' };
  const hits = findForbiddenFields(dirtyEvent);
  assert.deepEqual(hits, ['stdout']);
});

// ---------------------------------------------------------------------------
// Kill-switch — global and per-adapter
// ---------------------------------------------------------------------------

test('isAdapterDisabled returns true when the global kill switch is enabled', () => {
  const flags = getSyntheticFlags({ killSwitchEnabled: true });
  assert.equal(isAdapterDisabled(ADAPTER_ID, flags), true);
});

test('isAdapterDisabled returns true when the adapter is individually disabled', () => {
  const flags = getSyntheticFlags({ disabledAdapters: [ADAPTER_ID] });
  assert.equal(isAdapterDisabled(ADAPTER_ID, flags), true);
});

test('isAdapterDisabled returns true when the kill_switch_<adapterId> flag is set', () => {
  const flags = getSyntheticFlags({ flags: { [`kill_switch_${ADAPTER_ID}`]: true } });
  assert.equal(isAdapterDisabled(ADAPTER_ID, flags), true);
});

test('isAdapterDisabled returns false when nothing disables the adapter', () => {
  const flags = getSyntheticFlags();
  assert.equal(isAdapterDisabled(ADAPTER_ID, flags), false);
});

test('runSyntheticWaitStateFixture suppresses rendering when globally kill-switched', () => {
  const result = runSyntheticWaitStateFixture(getSyntheticFlags({ killSwitchEnabled: true }));
  assert.equal(result.rendered, false);
  assert.equal(result.reason, 'kill_switch_active');
  assert.equal(result.event, null);
});

test('runSyntheticWaitStateFixture suppresses rendering when individually disabled', () => {
  const result = runSyntheticWaitStateFixture(getSyntheticFlags({ disabledAdapters: [ADAPTER_ID] }));
  assert.equal(result.rendered, false);
  assert.equal(result.event, null);
});

test('runSyntheticWaitStateFixture does not suppress rendering for an unrelated adapter ID', () => {
  const result = runSyntheticWaitStateFixture(getSyntheticFlags({ disabledAdapters: ['browser_chatgpt'] }));
  assert.equal(result.rendered, true);
});
