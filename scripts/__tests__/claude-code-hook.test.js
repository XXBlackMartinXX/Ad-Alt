'use strict';
/**
 * Fixture tests for scripts/claude-code-hook.js -- feeds synthetic
 * (including hostile, private-content-shaped) JSON via stdin and
 * asserts the script only ever prints a sanitized, no-content event.
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'claude-code-hook.js');

test.before(() => {
  const build = spawnSync('pnpm', ['--filter', '@ad-alt/native-hook-adapter', 'build'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, `native-hook-adapter build failed: ${build.stderr}`);
});

function runHook(stdinText) {
  const result = spawnSync(process.execPath, [HOOK_SCRIPT], {
    cwd: REPO_ROOT,
    input: stdinText,
    encoding: 'utf8',
  });
  return result;
}

test('exits 0 for a clean Stop event', () => {
  const result = runHook(JSON.stringify({ hook_event_name: 'Stop', session_id: 'sess-1' }));
  assert.equal(result.status, 0);
  const event = JSON.parse(result.stdout.trim());
  assert.equal(event.sourcePlatform, 'claude_code');
  assert.equal(event.hookEventType, 'Stop');
  assert.equal(event.sanitizedResult, 'ok');
});

test('never echoes tool_input/tool_response content from a hostile PreToolUse payload', () => {
  const hostile = {
    hook_event_name: 'PreToolUse',
    session_id: 'sess-2',
    cwd: '/home/attacker/secret-project',
    tool_name: 'Bash',
    tool_input: { command: 'cat ~/.ssh/id_rsa' },
    tool_response: { output: 'FAKE-PRIVATE-KEY-CONTENT-abc123' },
  };
  const result = runHook(JSON.stringify(hostile));
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /id_rsa/);
  assert.doesNotMatch(result.stdout, /FAKE-PRIVATE-KEY-CONTENT/);
  assert.doesNotMatch(result.stdout, /secret-project/);
  const event = JSON.parse(result.stdout.trim());
  assert.deepEqual(
    Object.keys(event).sort(),
    ['adapterVersion', 'dryRun', 'hookEventType', 'hookReceivedAt', 'integrationType',
      'killSwitchActive', 'repoCommit', 'sanitizedResult', 'sourcePlatform'].sort(),
  );
});

test('never echoes prompt text from a hostile UserPromptSubmit payload', () => {
  const hostile = { hook_event_name: 'UserPromptSubmit', prompt: 'my secret token is xyz-789' };
  const result = runHook(JSON.stringify(hostile));
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /xyz-789/);
  assert.doesNotMatch(result.stdout, /secret token/);
});

test('exits 0 and reports a safe parse_error code for unparsable stdin, never echoing it', () => {
  const result = runHook('{ not json, leak-marker-should-not-appear');
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /leak-marker-should-not-appear/);
  const event = JSON.parse(result.stdout.trim());
  assert.equal(event.sanitizedResult, 'error');
  assert.equal(event.errorCodeSafeOnly, 'parse_error');
});

test('never writes to stdin-adjacent forbidden fields even when --log is passed', () => {
  const os = require('os');
  const fs = require('fs');
  const logPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hook-log-test-')), 'log.jsonl');
  const hostile = { hook_event_name: 'PostToolUse', tool_response: { output: 'leak-via-log-file-test' } };
  const result = spawnSync(process.execPath, [HOOK_SCRIPT, '--log', logPath], {
    cwd: REPO_ROOT,
    input: JSON.stringify(hostile),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  const logContent = fs.readFileSync(logPath, 'utf8');
  assert.doesNotMatch(logContent, /leak-via-log-file-test/);
  fs.rmSync(path.dirname(logPath), { recursive: true, force: true });
});
