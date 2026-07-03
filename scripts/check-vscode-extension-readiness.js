'use strict';
/**
 * VS Code Extension Readiness Gate — validates what CAN be automated
 * (typecheck + unit tests, including the new adapter/controller-level
 * coverage) and clearly reports what remains HOLD (a real e2e host
 * harness, and a human-operated live session) instead of overclaiming.
 *
 * FRESH EXECUTION: re-runs `pnpm --filter promptprofit typecheck` and
 * `pnpm --filter promptprofit test:unit` as real child processes every
 * time -- never trusts a stale report.
 *
 * This gate NEVER marks VS Code "verified" -- that requires a real
 * VS Code test-electron harness (does not exist) and a completed,
 * qualifying VSCODE_VERIFICATION_RESULT_LOG.md (does not exist yet).
 *
 * Usage:
 *   node scripts/check-vscode-extension-readiness.js
 *   pnpm -w run check:vscode-extension
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXTENSION_DIR = path.join(REPO_ROOT, 'apps', 'extension');
const PLATFORMS_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'platforms');

const findings = [];
const commandsRun = [];

function record(label, ok, detail) {
  findings.push({ label, ok, detail: detail || '' });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' -- ' + detail : ''}`);
}

function note(label, detail) {
  console.log(`  NOTE  ${label}${detail ? ' -- ' + detail : ''}`);
}

function section(t) {
  console.log('');
  console.log(`== ${t} ==`);
}

function run(label, cmd, args) {
  commandsRun.push(`${cmd} ${args.join(' ')} (cwd: apps/extension)`);
  const result = spawnSync(cmd, args, { cwd: EXTENSION_DIR, encoding: 'utf8', shell: true });
  const ok = result.status === 0;
  record(label, ok, ok ? '' : `exit status ${result.status}`);
  return { ok, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function main() {
  console.log('[>>] VS Code Extension Readiness Gate');
  console.log('------------------------------------------------------------');

  section('1. Fresh typecheck + unit tests (apps/extension)');
  run('pnpm typecheck', 'pnpm', ['typecheck']);
  const unitResult = run('pnpm test:unit', 'pnpm', ['test:unit']);

  section('2. Required unit-test files exist (this sprint\'s hardening)');
  const requiredTestFiles = [
    'src/__tests__/privacy.test.ts',
    'src/__tests__/event-queue.test.ts',
    'src/__tests__/api-client.test.ts',
    'src/__tests__/status-bar.test.ts',
    'src/__tests__/controller.test.ts',
    'src/adapters/__tests__/ai-status-bar.adapter.test.ts',
    'src/adapters/__tests__/mock.adapter.test.ts',
    'src/__tests__/test-utils/vscode-mock.ts',
  ];
  for (const rel of requiredTestFiles) {
    record(`${rel} exists`, fs.existsSync(path.join(EXTENSION_DIR, rel)));
  }

  section('3. Test count sanity check (must have grown beyond the pre-hardening baseline)');
  const testCountMatch = unitResult.stdout.match(/Tests\s+(\d+)\s+passed/);
  const testCount = testCountMatch ? parseInt(testCountMatch[1], 10) : 0;
  // Baseline before this sprint's hardening was 34 (26 privacy + 8 event-queue).
  record('Unit test count exceeds pre-hardening baseline of 34', testCount > 34,
    `found ${testCount} passing tests`);

  section('4. Required documentation exists');
  const requiredDocs = [
    'VSCODE_EXTENSION_VERIFICATION.md',
    'VSCODE_EXTENSION_DEEP_VERIFICATION.md',
    'VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md',
    'VSCODE_VERIFICATION_RESULT_TEMPLATE.md',
  ];
  for (const docName of requiredDocs) {
    record(`docs/internal-beta/platforms/${docName} exists`, fs.existsSync(path.join(PLATFORMS_DIR, docName)));
  }

  section('5. What remains HOLD (reported honestly, not folded into pass/fail)');
  note('Real VS Code extension-host (e2e) test harness', 'does not exist -- @vscode/test-electron or equivalent not present; all tests above run against a hand-written vscode module mock, not a real running VS Code host');

  const resultLogPath = path.join(PLATFORMS_DIR, 'VSCODE_VERIFICATION_RESULT_LOG.md');
  if (fs.existsSync(resultLogPath)) {
    const content = fs.readFileSync(resultLogPath, 'utf8');
    const checkedRe = /-\s*\[[xX]\]\s*`?([A-Z_]+)`?/g;
    const tokens = [...content.matchAll(checkedRe)].map((m) => m[1]);
    const verified = tokens.includes('VERIFIED_BY_HUMAN_LIVE_SESSION');
    note('VSCODE_VERIFICATION_RESULT_LOG.md exists', `recorded result: ${tokens.join(', ') || 'none recognized'}`);
    if (verified) {
      const forbiddenTelemetryMatch = content.match(/Forbidden telemetry found[^\n]*?:\s*([^\n]*)/i);
      const forbiddenTelemetryNo = forbiddenTelemetryMatch ? /no/i.test(forbiddenTelemetryMatch[1]) : false;
      record('VERIFIED_BY_HUMAN_LIVE_SESSION requires forbidden telemetry found = no', forbiddenTelemetryNo,
        forbiddenTelemetryMatch ? forbiddenTelemetryMatch[1].trim() : 'field not found');
    }
  } else {
    note('VSCODE_VERIFICATION_RESULT_LOG.md does not exist yet', 'human-operated live session not yet performed (acceptable -- HOLD, not FAIL)');
  }

  section('6. No overclaiming phrase in this gate\'s own required docs');
  {
    const OVERCLAIM_PHRASES = ['production ready', 'production-ready', 'public release ready', 'vs code verified', 'vscode verified'];
    let overclaims = [];
    for (const docName of requiredDocs) {
      const full = path.join(PLATFORMS_DIR, docName);
      if (!fs.existsSync(full)) continue;
      const lower = fs.readFileSync(full, 'utf8').toLowerCase();
      for (const phrase of OVERCLAIM_PHRASES) {
        if (lower.includes(phrase)) overclaims.push({ file: docName, phrase });
      }
    }
    record('No overclaiming phrase found', overclaims.length === 0, overclaims.length ? JSON.stringify(overclaims) : '');
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
  } else {
    console.log('Reason: typecheck and unit tests pass fresh with expanded coverage;');
    console.log('        required docs exist; no overclaiming phrase found.');
    console.log('        Support label remains "beta" -- a real e2e host harness and a');
    console.log('        completed human-operated live session (HOLD until then) are');
    console.log('        still required before "verified" can ever be claimed.');
  }
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));

  process.exit(decision === 'PASS' ? 0 : 1);
}

main();
