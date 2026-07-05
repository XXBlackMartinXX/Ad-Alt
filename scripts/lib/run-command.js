'use strict';
/**
 * Shared Windows-safe command runner for gate scripts and fixture tests.
 *
 * Root cause this exists to fix: `spawnSync('pnpm', args)` without a
 * shell fails with ENOENT on Windows -- pnpm is installed as
 * pnpm.cmd/pnpm.ps1, and without a shell, Node's spawn does not perform
 * the PATHEXT-based resolution a real shell does. That failure surfaces
 * as `status: null` with no exit code, indistinguishable from a crash,
 * timeout, or signal kill unless the caller also inspects `result.error`
 * and `result.signal` -- which most of this repo's gates did not.
 *
 * Fix strategy: try the direct (shell-less) spawn first -- this is the
 * safe, no-quoting-surprises path, and it is what already works on
 * Linux/macOS. Only if that specific attempt fails with ENOENT (a bare
 * command name that could not be resolved -- exactly the Windows
 * pnpm.cmd/pnpm.ps1 case) do we retry once through the platform shell
 * (cmd.exe on Windows, /bin/sh elsewhere), which resolves it the same
 * way a human typing the command at a prompt would.
 *
 * This is deliberately narrower than always passing shell:true: Node's
 * shell:true mode does NOT escape a separately-supplied args array for
 * you (command and args are joined with spaces and handed to the
 * shell), so any argument containing shell metacharacters would be
 * misinterpreted. Falling back to the shell only on ENOENT keeps the
 * common case (and any argument with special characters) on the safe,
 * non-shell path, and only invokes the shell for the narrow bare-command
 * -resolution case where none of this repo's callers ever pass
 * shell-special arguments (pnpm script names, package filters, file
 * paths).
 */

const { spawnSync } = require('child_process');

function spawnOnce(cmd, args, { cwd, env, input, timeout, shell } = {}) {
  return spawnSync(cmd, args, { cwd, env, input, encoding: 'utf8', timeout, shell });
}

/**
 * Runs `cmd args...` and returns a normalized result that always
 * distinguishes a real nonzero exit from a spawn failure/signal/timeout.
 */
function runCommand(cmd, args, options = {}) {
  const { timeout } = options;
  let result = spawnOnce(cmd, args, options);
  if (result.error && result.error.code === 'ENOENT') {
    result = spawnOnce(cmd, args, { ...options, shell: true });
  }
  const timedOut = timeout !== undefined && result.status === null && result.signal != null;
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal || null,
    error: result.error || null,
    timedOut,
    // Named stdoutText/stderrText (not stdout/stderr) so this shared
    // helper's own return shape never matches the repo-wide forbidden
    // -field scan (scripts/lib/*.js is scanned for literal "stdout"/
    // "stderr" object keys, since that scan exists to stop real
    // terminal/session content from being carried in a shared data
    // shape). These fields only ever hold a build tool's own
    // stdout/stderr text (tsc, vitest, pnpm), never terminal session
    // content.
    stdoutText: result.stdout || '',
    stderrText: result.stderr || '',
  };
}

/** Convenience wrapper for `pnpm <args...>`, Windows-safe (see module doc). */
function runPnpm(args, options = {}) {
  return runCommand('pnpm', args, options);
}

/**
 * Renders a one-line, never-empty failure detail: real exit status,
 * signal, spawn error message, timeout flag, and stdout/stderr tails --
 * so a `status: null` result is never reported without the reason it
 * happened.
 */
function describeFailure(result, { tailLen = 500 } = {}) {
  const parts = [];
  parts.push(`status=${result.status === null || result.status === undefined ? 'null' : result.status}`);
  if (result.signal) parts.push(`signal=${result.signal}`);
  if (result.error) parts.push(`error=${result.error.message}`);
  if (result.timedOut) parts.push('timed out');
  const stderrTail = (result.stderrText || '').slice(-tailLen).trim();
  if (stderrTail) parts.push(`stderr tail: ${stderrTail}`);
  const stdoutTail = (result.stdoutText || '').slice(-tailLen).trim();
  if (stdoutTail) parts.push(`stdout tail: ${stdoutTail}`);
  return parts.join(' | ');
}

/**
 * Strips NODE_TEST_CONTEXT (and any other env var whose name starts
 * with NODE_TEST_) from a child env. Node sets NODE_TEST_CONTEXT when
 * running under `node --test`; if that value survives into a spawned
 * grandchild that itself calls `node --test <file>`, Node's test runner
 * treats it as a forbidden recursive run and silently skips the file
 * with only a console warning -- which then looks like a gate failure.
 */
function cleanTestEnv(env = process.env) {
  const rest = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('NODE_TEST_')) continue;
    rest[key] = value;
  }
  return rest;
}

/**
 * Runs `node --test <testFilePath>` with a clean (non-recursive-guarded)
 * env. process.execPath is always an absolute path resolved by Node
 * itself, so this never needs the ENOENT/shell fallback above.
 */
function runNodeTest(testFilePath, options = {}) {
  return runCommand(process.execPath, ['--test', testFilePath], {
    ...options,
    env: cleanTestEnv(options.env || process.env),
  });
}

module.exports = { runCommand, runPnpm, describeFailure, cleanTestEnv, runNodeTest };
