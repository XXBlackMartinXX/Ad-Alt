'use strict';
/**
 * Native Hook Installation Safety Gate -- verifies
 * scripts/install-claude-code-hooks.js and scripts/install-codex-hooks.js
 * are dry-run by default, only ever write with an explicit --write flag,
 * always back up an existing target before overwriting it, and never
 * touch a real user config path in this gate's own test run.
 *
 * FRESH EXECUTION: re-runs the installer fixture tests as a real child
 * process every time, plus independent static source checks.
 *
 * Usage:
 *   node scripts/check-native-hook-installation.js
 *   pnpm -w run check:native-hook-installation
 */

const fs = require('fs');
const path = require('path');
const { runNodeTest, describeFailure } = require('./lib/run-command.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLAUDE_INSTALLER = path.join(REPO_ROOT, 'scripts', 'install-claude-code-hooks.js');
const CODEX_INSTALLER = path.join(REPO_ROOT, 'scripts', 'install-codex-hooks.js');
const INSTALLER_TEST = path.join(REPO_ROOT, 'scripts', '__tests__', 'native-hook-installers.test.js');

const findings = [];
function record(label, ok, detail) {
  findings.push({ label, ok, detail: detail || '' });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' -- ' + detail : ''}`);
}
function section(t) {
  console.log('');
  console.log(`== ${t} ==`);
}

function main() {
  console.log('[>>] Native Hook Installation Safety Gate');
  console.log('------------------------------------------------------------');

  section('1. Installer scripts exist');
  record('scripts/install-claude-code-hooks.js exists', fs.existsSync(CLAUDE_INSTALLER));
  record('scripts/install-codex-hooks.js exists', fs.existsSync(CODEX_INSTALLER));
  record('scripts/lib/native-hook-installer.js exists', fs.existsSync(path.join(REPO_ROOT, 'scripts', 'lib', 'native-hook-installer.js')));

  section('2. Fresh execution of installer fixture tests (temp-dir only)');
  // runNodeTest strips NODE_TEST_CONTEXT -- see the identical comment in
  // check-claude-code-native-hooks.js for why this is required whenever
  // this gate itself may run nested under `node --test`.
  const testResult = runNodeTest(INSTALLER_TEST, { cwd: REPO_ROOT });
  const testOutput = testResult.stdoutText + testResult.stderrText;
  record('node --test scripts/__tests__/native-hook-installers.test.js exits 0', testResult.ok,
    testResult.ok ? '' : `${describeFailure(testResult)} -- output tail: ${testOutput.slice(-800)}`);
  record('Test file only ever targets os.tmpdir() paths (static check)', (() => {
    const src = fs.readFileSync(INSTALLER_TEST, 'utf8');
    return src.includes('os.tmpdir()') && !/homedir\(\)/.test(src);
  })());

  section('3. Static safety checks on the installer scripts');
  for (const [label, scriptPath] of [['Claude Code installer', CLAUDE_INSTALLER], ['Codex installer', CODEX_INSTALLER]]) {
    const src = fs.readFileSync(scriptPath, 'utf8');
    record(`${label}: defaults to dry-run (checks a "write" boolean before any file write)`,
      /if\s*\(\s*!write\s*\)/.test(src));
    record(`${label}: resolves its default target via os.homedir(), never a hardcoded absolute path`,
      /os\.homedir\(\)/.test(src) && !/\/home\/[a-z]+\//.test(src) && !/C:\\\\Users/.test(src));
    record(`${label}: calls a backup function before writing`,
      /backupIfExists/.test(src));
    record(`${label}: validates JSON before writing`,
      /validateJsonRoundTrip/.test(src));
    record(`${label}: never logs a raw hook payload (no reference to stdin/rawText)`,
      !/rawText/.test(src) && !/process\.stdin/.test(src));
  }

  section('4. No forbidden field names written by the shared installer library');
  {
    const FORBIDDEN_FIELD_NAMES = [
      'commandText', 'commandArgs', 'stdout', 'stderr', 'terminalBuffer',
      'promptText', 'aiResponse', 'chatHistory', 'conversationId',
      'accountEmail', 'authToken', 'sessionCookie', 'clipboardContent',
      'screenshotData', 'sourceCode', 'fileContent', 'toolInput', 'toolOutput',
    ];
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELD_NAMES.join('|')})["']?\\s*:`, 'g');
    let hits = [];
    for (const file of [CLAUDE_INSTALLER, CODEX_INSTALLER, path.join(REPO_ROOT, 'scripts', 'lib', 'native-hook-installer.js')]) {
      const src = fs.readFileSync(file, 'utf8');
      const matches = [...src.matchAll(fieldKeyRe)];
      if (matches.length > 0) hits.push({ file: path.relative(REPO_ROOT, file), fields: matches.map((m) => m[1]) });
    }
    record('No forbidden field name used as an object key in installer scripts', hits.length === 0,
      hits.length ? JSON.stringify(hits) : '');
  }

  const failures = findings.filter((f) => !f.ok);
  console.log('');
  console.log('=== Summary ===');
  console.log(`  Checks: ${findings.length}`);
  console.log(`  Failures: ${failures.length}`);
  const decision = failures.length === 0 ? 'PASS' : 'FAIL';
  console.log('');
  console.log(`Result: ${decision}`);
  if (failures.length > 0) {
    console.log('Reason:');
    failures.forEach((f) => console.log(`  - ${f.label}${f.detail ? ': ' + f.detail : ''}`));
  }
  process.exit(decision === 'PASS' ? 0 : 1);
}

main();
