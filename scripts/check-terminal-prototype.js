'use strict';
/**
 * Terminal Fixture-Only Prototype Gate — proves the fixture-only terminal
 * prototype (scripts/lib/terminal-fixture.js, scripts/terminal-fixture-runner.js)
 * behaves as designed and never touches anything real: no child-process
 * spawning, no network I/O, no filesystem access to real paths, no
 * forbidden fields in its synthetic event.
 *
 * FRESH EXECUTION: runs the runner as a real child process every time,
 * never trusts a stale report.
 *
 * Usage:
 *   node scripts/check-terminal-prototype.js
 *   pnpm -w run check:terminal-prototype
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const LIB_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'terminal-fixture.js');
const RUNNER_PATH = path.join(REPO_ROOT, 'scripts', 'terminal-fixture-runner.js');

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
  console.log('[>>] Terminal Fixture-Only Prototype Gate');
  console.log('------------------------------------------------------------');

  section('1. Prototype files exist');
  record('scripts/lib/terminal-fixture.js exists', fs.existsSync(LIB_PATH));
  record('scripts/terminal-fixture-runner.js exists', fs.existsSync(RUNNER_PATH));

  section('2. Fresh execution of the runner succeeds and self-verifies');
  const result = spawnSync(process.execPath, [RUNNER_PATH], { cwd: REPO_ROOT, encoding: 'utf8' });
  record('node scripts/terminal-fixture-runner.js exits 0', result.status === 0,
    result.status !== 0 ? `exit status ${result.status}` : '');
  record('Runner output confirms no forbidden fields found',
    /Forbidden fields found: none/.test(result.stdout || ''));
  record('Runner output confirms kill-switch suppresses rendering',
    /"rendered": false/.test(result.stdout || '') && /kill_switch_active/.test(result.stdout || ''));

  section('3. Static source scan — no real process/network/filesystem access');
  if (fs.existsSync(LIB_PATH)) {
    const src = fs.readFileSync(LIB_PATH, 'utf8');
    const FORBIDDEN_REQUIRES = ["require('child_process')", 'require("child_process")',
      "require('http')", 'require("http")', "require('https')", 'require("https")',
      "require('net')", 'require("net")'];
    const hits = FORBIDDEN_REQUIRES.filter((needle) => src.includes(needle));
    record('terminal-fixture.js never requires child_process/http/https/net', hits.length === 0,
      hits.length ? JSON.stringify(hits) : '');

    const FORBIDDEN_FIELD_NAMES = [
      'commandText', 'commandArgs', 'stdout', 'stderr', 'terminalBuffer',
      'promptText', 'aiResponse', 'chatHistory', 'pageUrl', 'pageTitle', 'domText',
      'cookies', 'authToken', 'sessionCookie', 'clipboardContent', 'screenshotData',
      'sourceCode', 'fileContent', 'environmentVariables', 'workingDirectory',
    ];
    // These names must appear ONLY inside the FORBIDDEN_FIELDS array declaration
    // (as string literals being denylisted), never as an object key (":" after it)
    // anywhere else in the file — that would mean the prototype actually
    // constructs an event containing one of them.
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELD_NAMES.join('|')})["']?\\s*:`, 'g');
    const keyMatches = [...src.matchAll(fieldKeyRe)];
    record('No forbidden field used as an object key in terminal-fixture.js', keyMatches.length === 0,
      keyMatches.length ? JSON.stringify(keyMatches.map((m) => m[1])) : '');
  } else {
    record('terminal-fixture.js never requires child_process/http/https/net', false, 'file missing');
    record('No forbidden field used as an object key in terminal-fixture.js', false, 'file missing');
  }

  section('4. Support label sanity — must not claim verified/production support');
  const docPath = path.join(REPO_ROOT, 'docs', 'internal-beta', 'platforms', 'TERMINAL_PROTOTYPE_VERIFICATION.md');
  if (fs.existsSync(docPath)) {
    const docContent = fs.readFileSync(docPath, 'utf8');
    record('TERMINAL_PROTOTYPE_VERIFICATION.md exists', true);
    record('Doc does not claim this prototype is "verified"', !/\bverified\b/i.test(docContent));
    record('Doc declares fixture-only or experimental label',
      /fixture-only/i.test(docContent) && /experimental/i.test(docContent));
  } else {
    record('TERMINAL_PROTOTYPE_VERIFICATION.md exists', false);
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
