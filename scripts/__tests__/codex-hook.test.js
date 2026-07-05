'use strict';
/**
 * Fixture tests for scripts/codex-hook.js -- feeds synthetic (including
 * hostile, private-content-shaped) JSON via stdin and asserts the
 * script only ever prints a sanitized, no-content event.
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { runPnpm, describeFailure } = require('../lib/run-command.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'codex-hook.js');

test.before(() => {
  const build = runPnpm(['--filter', '@ad-alt/native-hook-adapter', 'build'], { cwd: REPO_ROOT });
  assert.equal(build.status, 0, `native-hook-adapter build failed: ${describeFailure(build)}`);
});

function runHook(stdinText, extraArgs) {
  return spawnSync(process.execPath, [HOOK_SCRIPT, ...(extraArgs || [])], {
    cwd: REPO_ROOT,
    input: stdinText,
    encoding: 'utf8',
  });
}

test('exits 0 for a clean Stop event, tagged codex_cli by default', () => {
  const result = runHook(JSON.stringify({ hook_event_name: 'Stop' }));
  assert.equal(result.status, 0);
  const event = JSON.parse(result.stdout.trim());
  assert.equal(event.sourcePlatform, 'codex_cli');
  assert.equal(event.hookEventType, 'Stop');
  assert.equal(event.sanitizedResult, 'ok');
});

test('tags codex_ide when --ide is passed', () => {
  const result = runHook(JSON.stringify({ hook_event_name: 'SessionStart' }), ['--ide']);
  assert.equal(result.status, 0);
  const event = JSON.parse(result.stdout.trim());
  assert.equal(event.sourcePlatform, 'codex_ide');
});

test('never echoes tool_input content from a hostile PreToolUse payload', () => {
  const hostile = {
    hook_event_name: 'PreToolUse',
    tool_input: { command: 'rm -rf ~/Documents && cat /etc/shadow' },
  };
  const result = runHook(JSON.stringify(hostile));
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /etc\/shadow/);
  assert.doesNotMatch(result.stdout, /Documents/);
});

test('never echoes notify-shaped content (input-messages/last-assistant-message) if fed by mistake', () => {
  const hostile = {
    hook_event_name: 'Stop',
    'input-messages': ['do something secret'],
    'last-assistant-message': 'the secret answer is 42',
  };
  const result = runHook(JSON.stringify(hostile));
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /secret answer/);
  assert.doesNotMatch(result.stdout, /do something secret/);
});

test('exits 0 and reports a safe parse_error code for unparsable stdin', () => {
  const result = runHook('{ not json, leak-marker-should-not-appear');
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /leak-marker-should-not-appear/);
  const event = JSON.parse(result.stdout.trim());
  assert.equal(event.sanitizedResult, 'error');
  assert.equal(event.errorCodeSafeOnly, 'parse_error');
});
