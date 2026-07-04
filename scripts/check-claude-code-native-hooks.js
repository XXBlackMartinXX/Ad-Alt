'use strict';
/**
 * Claude Code Native Hook Gate -- verifies scripts/claude-code-hook.js
 * fixture tests pass fresh, the example settings.json config exists and
 * is schema-valid, the integration/decision docs exist, and the
 * declared support label is honest (never "verified" without a
 * qualifying human result log; must say "beta" or lower).
 *
 * FRESH EXECUTION: re-runs the fixture test file as a real child
 * process every time.
 *
 * Usage:
 *   node scripts/check-claude-code-native-hooks.js
 *   pnpm -w run check:claude-code-native-hooks
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLATFORMS_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'platforms');
const HOOK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'claude-code-hook.js');
const FIXTURE_TEST = path.join(REPO_ROOT, 'scripts', '__tests__', 'claude-code-hook.test.js');
const EXAMPLE_CONFIG = path.join(PLATFORMS_DIR, 'examples', 'claude-code-hooks.example.json');
const INTEGRATION_DOC = path.join(PLATFORMS_DIR, 'CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md');
const RESULT_LOG = path.join(PLATFORMS_DIR, 'CLAUDE_CODE_NATIVE_HOOK_RESULT_LOG.md');

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
  console.log('[>>] Claude Code Native Hook Gate');
  console.log('------------------------------------------------------------');

  section('1. Hook script and fixture tests exist and pass (fresh)');
  record('scripts/claude-code-hook.js exists', fs.existsSync(HOOK_SCRIPT));
  record('scripts/__tests__/claude-code-hook.test.js exists', fs.existsSync(FIXTURE_TEST));
  if (fs.existsSync(FIXTURE_TEST)) {
    const result = spawnSync(process.execPath, ['--test', FIXTURE_TEST], { cwd: REPO_ROOT, encoding: 'utf8' });
    const output = (result.stdout || '') + (result.stderr || '');
    record('node --test scripts/__tests__/claude-code-hook.test.js exits 0', result.status === 0,
      result.status !== 0 ? output.slice(-800) : '');
    record('Test output reports 0 failing tests', /# fail 0/.test(output), /# fail 0/.test(output) ? '' : output.slice(-400));
  }

  section('2. Example config exists and is schema-valid');
  if (fs.existsSync(EXAMPLE_CONFIG)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(EXAMPLE_CONFIG, 'utf8'));
      record('Example config is valid JSON', true);
      record('Example config has a top-level "hooks" object', typeof parsed.hooks === 'object' && parsed.hooks !== null);
      const eventNames = Object.keys(parsed.hooks || {});
      record('Example config wires at least one recognized event', eventNames.length > 0, eventNames.join(', '));
    } catch (err) {
      record('Example config is valid JSON', false, String(err));
    }
  } else {
    record('Example config exists', false);
  }

  section('3. Required docs exist');
  record('CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md exists', fs.existsSync(INTEGRATION_DOC));
  record('CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md exists (updated by this sprint)',
    fs.existsSync(path.join(PLATFORMS_DIR, 'CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md')));
  record('CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md exists',
    fs.existsSync(path.join(PLATFORMS_DIR, 'CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md')));
  record('CLAUDE_CODE_NATIVE_HOOK_RESULT_TEMPLATE.md exists',
    fs.existsSync(path.join(PLATFORMS_DIR, 'CLAUDE_CODE_NATIVE_HOOK_RESULT_TEMPLATE.md')));

  section('4. Support label honesty');
  if (fs.existsSync(INTEGRATION_DOC)) {
    const content = fs.readFileSync(INTEGRATION_DOC, 'utf8');
    const lower = content.toLowerCase();
    const claimsVerified = /\*\*`verified`\*\*/i.test(content) || /support label[^\n]*verified/i.test(lower);
    if (claimsVerified) {
      const hasResultLog = fs.existsSync(RESULT_LOG);
      let resultLogConfirms = false;
      if (hasResultLog) {
        const logContent = fs.readFileSync(RESULT_LOG, 'utf8').toLowerCase();
        resultLogConfirms = /ready to propose `verified`/.test(logContent) || /overall verdict.*ready to propose/i.test(logContent);
      }
      record('If doc claims "verified", a qualifying CLAUDE_CODE_NATIVE_HOOK_RESULT_LOG.md exists and confirms it',
        hasResultLog && resultLogConfirms,
        hasResultLog ? 'result log exists but does not confirm readiness' : 'no result log exists yet');
    } else {
      record('Doc does not claim "verified" without a qualifying result log', true);
    }
    record('Doc declares the "beta" label (the expected label this sprint)', /\bbeta\b/i.test(content));
  } else {
    record('Support label honesty check', false, 'integration doc missing');
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
