'use strict';
/**
 * Fixture tests for scripts/lib/run-command.js -- the shared
 * Windows-safe command runner used by the gate scripts that were
 * previously spawning `pnpm` directly (which fails with ENOENT/status
 * null on Windows without shell:true), and by the gates that spawn
 * nested `node --test` children (which Node's test runner silently
 * skips if NODE_TEST_CONTEXT leaks into the child env).
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCommand, runPnpm, describeFailure, cleanTestEnv, runNodeTest } = require('../lib/run-command.js');

test('runCommand reports a real nonzero exit as ok:false with the right status, via a script file (no shell metacharacters in the args)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-command-exit-test-'));
  const scriptPath = path.join(tmpDir, 'exit3.js');
  fs.writeFileSync(scriptPath, 'process.exit(3);\n');
  try {
    const result = runCommand(process.execPath, [scriptPath]);
    assert.equal(result.ok, false);
    assert.equal(result.status, 3);
    assert.equal(result.signal, null);
    assert.equal(result.error, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runCommand reports a clean exit as ok:true using the direct (shell-less) path', () => {
  const result = runCommand(process.execPath, ['--version']);
  assert.equal(result.ok, true);
  assert.equal(result.status, 0);
  assert.match(result.stdoutText.trim(), /^v\d+\.\d+\.\d+/);
});

test('runCommand falls back to the shell only on ENOENT (the Windows pnpm.cmd case), proven here with a deliberately nonexistent bare command name', () => {
  // Direct spawn of a bare, nonexistent command name fails with ENOENT
  // on every platform (this is exactly the failure mode `pnpm` hits on
  // Windows, where the resolvable binary is actually `pnpm.cmd`). The
  // fallback retries through the shell, which reports "command not
  // found" as a real nonzero exit rather than leaving status:null.
  const result = runCommand('this-binary-does-not-exist-anywhere-xyz', []);
  assert.notEqual(result.status, null);
  assert.equal(result.ok, false);
});

test('describeFailure never returns an empty string for a status:null spawn failure', () => {
  const fakeResult = { status: null, signal: null, error: new Error('spawn ENOENT'), timedOut: false, stdoutText: '', stderrText: '' };
  const detail = describeFailure(fakeResult);
  assert.ok(detail.length > 0);
  assert.match(detail, /status=null/);
  assert.match(detail, /error=spawn ENOENT/);
});

test('describeFailure includes signal when the process was killed by a signal', () => {
  const fakeResult = { status: null, signal: 'SIGTERM', error: null, timedOut: false, stdoutText: '', stderrText: '' };
  const detail = describeFailure(fakeResult);
  assert.match(detail, /signal=SIGTERM/);
});

test('cleanTestEnv strips NODE_TEST_CONTEXT but preserves everything else', () => {
  const cleaned = cleanTestEnv({ NODE_TEST_CONTEXT: 'child-v8', PATH: '/usr/bin', FOO: 'bar' });
  assert.equal('NODE_TEST_CONTEXT' in cleaned, false);
  assert.equal(cleaned.PATH, '/usr/bin');
  assert.equal(cleaned.FOO, 'bar');
});

test('runNodeTest: a nested node --test child actually runs and reports pass even when the parent env carries NODE_TEST_CONTEXT (regression for the recursion-skip bug)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-command-nested-test-'));
  const nestedFile = path.join(tmpDir, 'nested.test.js');
  fs.writeFileSync(
    nestedFile,
    "const test = require('node:test');\n"
    + "const assert = require('node:assert/strict');\n"
    + "test('nested trivial assertion', () => { assert.equal(1 + 1, 2); });\n",
  );
  try {
    // Simulate this test itself already running under `node --test`
    // (which sets NODE_TEST_CONTEXT) by explicitly injecting it into
    // the env passed to runNodeTest, regardless of whether the
    // outer harness happens to set it too.
    const parentEnv = { ...process.env, NODE_TEST_CONTEXT: 'child-v8' };
    const result = runNodeTest(nestedFile, { env: parentEnv });
    const output = result.stdoutText + result.stderrText;
    assert.equal(result.status, 0, `nested node --test did not exit 0: ${describeFailure(result)}`);
    assert.doesNotMatch(output, /skipping running files/i);
    assert.match(output, /# pass 1/);
    assert.match(output, /# fail 0/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runPnpm shells out to pnpm and surfaces its exit code', () => {
  const result = runPnpm(['--version']);
  assert.equal(result.ok, true);
  assert.match(result.stdoutText.trim(), /^\d+\.\d+\.\d+/);
});
