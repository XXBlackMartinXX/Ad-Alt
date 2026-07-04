'use strict';
/**
 * Codex Native Hook Gate -- verifies scripts/codex-hook.js fixture
 * tests pass fresh, the example hooks.json config exists and is
 * schema-valid, the integration/decision docs exist, and the declared
 * support label is honest (never "beta"/"verified" without qualifying
 * evidence; this sprint's expected label is "experimental").
 *
 * FRESH EXECUTION: re-runs the fixture test file as a real child
 * process every time.
 *
 * Usage:
 *   node scripts/check-codex-native-hooks.js
 *   pnpm -w run check:codex-native-hooks
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLATFORMS_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'platforms');
const HOOK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'codex-hook.js');
const FIXTURE_TEST = path.join(REPO_ROOT, 'scripts', '__tests__', 'codex-hook.test.js');
const EXAMPLE_CONFIG = path.join(PLATFORMS_DIR, 'examples', 'codex-hooks.example.json');
const INTEGRATION_DOC = path.join(PLATFORMS_DIR, 'CODEX_CLI_NATIVE_HOOK_INTEGRATION.md');
const IDE_DECISION_DOC = path.join(PLATFORMS_DIR, 'CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md');
const RESULT_LOG = path.join(PLATFORMS_DIR, 'CODEX_CLI_NATIVE_HOOK_RESULT_LOG.md');

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
  console.log('[>>] Codex Native Hook Gate');
  console.log('------------------------------------------------------------');

  section('1. Hook script and fixture tests exist and pass (fresh)');
  record('scripts/codex-hook.js exists', fs.existsSync(HOOK_SCRIPT));
  record('scripts/__tests__/codex-hook.test.js exists', fs.existsSync(FIXTURE_TEST));
  if (fs.existsSync(FIXTURE_TEST)) {
    // Strip NODE_TEST_CONTEXT -- see the identical comment in
    // check-claude-code-native-hooks.js for why this is required
    // whenever this gate itself may run nested under `node --test`.
    const { NODE_TEST_CONTEXT, ...childEnv } = process.env;
    const result = spawnSync(process.execPath, ['--test', FIXTURE_TEST], { cwd: REPO_ROOT, encoding: 'utf8', env: childEnv });
    const output = (result.stdout || '') + (result.stderr || '');
    record('node --test scripts/__tests__/codex-hook.test.js exits 0', result.status === 0,
      result.status !== 0 ? output.slice(-800) : '');
    record('Test output reports 0 failing tests', /# fail 0/.test(output), /# fail 0/.test(output) ? '' : output.slice(-400));
  }

  section('2. Example config exists and is schema-valid');
  if (fs.existsSync(EXAMPLE_CONFIG)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(EXAMPLE_CONFIG, 'utf8'));
      record('Example config is valid JSON', true);
      const eventNames = Object.keys(parsed);
      record('Example config wires at least one recognized event as a top-level key', eventNames.length > 0, eventNames.join(', '));
      record('Example config does not use notify (avoids the content-bearing mechanism)',
        !JSON.stringify(parsed).toLowerCase().includes('"notify"'));
    } catch (err) {
      record('Example config is valid JSON', false, String(err));
    }
  } else {
    record('Example config exists', false);
  }

  section('3. Required docs exist');
  record('CODEX_CLI_NATIVE_HOOK_INTEGRATION.md exists', fs.existsSync(INTEGRATION_DOC));
  record('CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md exists', fs.existsSync(IDE_DECISION_DOC));
  record('CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md exists',
    fs.existsSync(path.join(PLATFORMS_DIR, 'CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md')));
  record('CODEX_CLI_NATIVE_HOOK_RESULT_TEMPLATE.md exists',
    fs.existsSync(path.join(PLATFORMS_DIR, 'CODEX_CLI_NATIVE_HOOK_RESULT_TEMPLATE.md')));

  section('4. Support label honesty (must not be beta/verified without evidence)');
  for (const [label, docPath] of [['CODEX_CLI_NATIVE_HOOK_INTEGRATION.md', INTEGRATION_DOC], ['CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md', IDE_DECISION_DOC]]) {
    if (!fs.existsSync(docPath)) {
      record(`${label}: support label honesty`, false, 'doc missing');
      continue;
    }
    const content = fs.readFileSync(docPath, 'utf8');
    const claimsBetaOrVerified = /\*\*`beta`\*\*/.test(content) || /\*\*`verified`\*\*/.test(content);
    if (claimsBetaOrVerified) {
      const hasResultLog = fs.existsSync(RESULT_LOG);
      record(`${label}: does not claim beta/verified without a qualifying CODEX_CLI_NATIVE_HOOK_RESULT_LOG.md`,
        hasResultLog, hasResultLog ? '' : 'no result log exists yet, but doc claims beta/verified');
    } else {
      record(`${label}: does not claim beta/verified without evidence`, true);
    }
    record(`${label}: declares the "experimental" label (the expected label this sprint)`, /\bexperimental\b/i.test(content));
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
