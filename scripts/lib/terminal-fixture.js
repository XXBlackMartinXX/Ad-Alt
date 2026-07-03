'use strict';
/**
 * Fixture-only terminal/CLI integration prototype library.
 *
 * Proves the safe lifecycle-only architecture described in
 * docs/internal-beta/platforms/DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md
 * WITHOUT touching any real terminal session. Every timestamp, "command",
 * and event produced here is hardcoded synthetic test data.
 *
 * This module never:
 *   - spawns or wraps a real process
 *   - reads any real command text, stdin, stdout, or stderr
 *   - reads a real terminal buffer
 *   - performs any network I/O
 *   - reads or writes any file outside its own return values
 *
 * It exists to prove that a lifecycle-only event model (start timestamp,
 * end timestamp, duration, kill-switch check) produces a schema-shaped,
 * privacy-clean monetization event -- the same shape a real CLI wrapper
 * (explicitly NOT built this sprint -- see
 * docs/internal-beta/platforms/CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md)
 * would need to produce.
 */

const crypto = require('crypto');

/**
 * Adapter ID used by this prototype. "manual" is the existing
 * DEV_ADAPTER_IDS entry documented as "developer tooling only" in
 * packages/shared/src/schemas/adapters.ts -- deliberately NOT a new
 * production-looking adapter ID, so this prototype can never be mistaken
 * for a shipped, supported terminal product.
 */
const ADAPTER_ID = 'manual';

/**
 * Fields that must never appear in an event produced by this prototype (or
 * any future real terminal integration). Mirrors
 * apps/browser-extension's FORBIDDEN_FIELDS plus terminal-specific fields
 * from the non-negotiable privacy rules.
 */
const FORBIDDEN_FIELDS = [
  'commandText',
  'commandArgs',
  'stdout',
  'stderr',
  'terminalBuffer',
  'promptText',
  'aiResponse',
  'chatHistory',
  'pageUrl',
  'pageTitle',
  'domText',
  'cookies',
  'authToken',
  'sessionCookie',
  'clipboardContent',
  'screenshotData',
  'sourceCode',
  'fileContent',
  'environmentVariables',
  'workingDirectory',
];

/** Synthetic feature-flag shape -- mirrors packages/platform-core's FeatureFlags. */
function getSyntheticFlags(overrides) {
  return Object.assign(
    { killSwitchEnabled: false, disabledAdapters: [], flags: {} },
    overrides || {},
  );
}

/** Mirrors packages/platform-core/src/feature-flags.ts's isAdapterDisabled exactly. */
function isAdapterDisabled(adapterId, flags) {
  if (flags.killSwitchEnabled) return true;
  if (flags.disabledAdapters.includes(adapterId)) return true;
  if (flags.flags[`kill_switch_${adapterId}`] === true) return true;
  return false;
}

/**
 * Simulates one synthetic "wrapped command" lifecycle. The startedAt/
 * durationMs values below are hardcoded fixture constants -- never derived
 * from any real process, clock read of a real command, or file.
 *
 * @param {object} flags - synthetic feature-flag state (see getSyntheticFlags)
 * @returns {{ rendered: boolean, reason: string, event: object|null }}
 */
function runSyntheticWaitStateFixture(flags) {
  const adapterId = ADAPTER_ID;

  if (isAdapterDisabled(adapterId, flags)) {
    return { rendered: false, reason: 'kill_switch_active', event: null };
  }

  const startedAt = new Date('2026-01-01T00:00:00.000Z'); // synthetic, fixed
  const durationMs = 4200; // synthetic, fixed -- not measured from anything real
  const endedAt = new Date(startedAt.getTime() + durationMs);

  const event = {
    eventId: crypto.randomUUID(),
    eventType: 'impression_requested',
    deviceId: 'dev_synthetic0000000000',
    sessionId: crypto.randomUUID(),
    extensionVersion: '0.0.0-terminal-fixture',
    adapterName: adapterId,
    clientTimestamp: endedAt.toISOString(),
    sequenceNumber: 0,
    adDecisionId: 'fixture-0000-0000-0000-000000000001',
    campaignId: 'fixture-0000-0000-0000-000000000002',
    creativeId: 'fixture-0000-0000-0000-000000000003',
    waitStateDurationMs: durationMs,
  };

  return { rendered: true, reason: 'ok', event };
}

/** Returns the list of forbidden fields present as JSON keys in an event (empty = clean). */
function findForbiddenFields(event) {
  const json = JSON.stringify(event);
  return FORBIDDEN_FIELDS.filter((f) => json.includes(`"${f}"`));
}

module.exports = {
  ADAPTER_ID,
  FORBIDDEN_FIELDS,
  getSyntheticFlags,
  isAdapterDisabled,
  runSyntheticWaitStateFixture,
  findForbiddenFields,
};
