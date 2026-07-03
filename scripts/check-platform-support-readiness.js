'use strict';
/**
 * Platform Support Readiness Gate — verifies that platform support claims
 * in this repo's docs match actual evidence, that ChatGPT remains the one
 * verified revenue platform, that no other platform is mislabeled
 * "verified" without a real-session evidence record, and that the
 * ChatGPT controlled revenue pilot gate still passes.
 *
 * FRESH EXECUTION: re-runs check:revenue-pilot and check:license
 * (public-release mode) as real child processes on every invocation --
 * never trusts a stale markdown report, mirroring the pattern already
 * established in check-controlled-revenue-pilot-readiness.js and
 * check-billing-reconciliation-readiness.js.
 *
 * Usage:
 *   node scripts/check-platform-support-readiness.js
 *   pnpm -w run check:platforms
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLATFORMS_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'platforms');
const MATRIX_DOC = path.join(PLATFORMS_DIR, 'PLATFORM_SUPPORT_MATRIX.md');
const CONTRACT_DOC = path.join(PLATFORMS_DIR, 'PLATFORM_ADAPTER_CONTRACT.md');
const AUDIT_DOC = path.join(PLATFORMS_DIR, 'PLATFORM_SUPPORT_AUDIT.md');

const findings = []; // { ok, label, detail }
const commandsRun = [];

function record(label, ok, detail) {
  findings.push({ label, ok, detail: detail || '' });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' -- ' + detail : ''}`);
}

function section(t) {
  console.log('');
  console.log(`== ${t} ==`);
}

function runFresh(label, scriptRelPath, extraArgs, expectSuccess) {
  const scriptAbsPath = path.join(REPO_ROOT, scriptRelPath);
  const args = [scriptAbsPath, ...(extraArgs || [])];
  const cmdString = `node ${scriptRelPath}${extraArgs ? ' ' + extraArgs.join(' ') : ''}`;
  commandsRun.push(cmdString);

  const result = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  const succeeded = result.status === 0;
  const asExpected = expectSuccess ? succeeded : !succeeded;

  record(`${label} (${cmdString})`, asExpected,
    asExpected ? '' : `expected ${expectSuccess ? 'success' : 'failure'}, got status=${result.status}`);

  return { ok: asExpected, status: result.status, stdout: result.stdout || '' };
}

function main() {
  console.log('[>>] Platform Support Readiness Gate');
  console.log('------------------------------------------------------------');

  // -------------------------------------------------------------------
  // 1. ChatGPT revenue pilot gate must still pass (fresh)
  // -------------------------------------------------------------------
  section('1. ChatGPT revenue pilot gate (fresh execution)');
  runFresh('check:revenue-pilot', 'scripts/check-controlled-revenue-pilot-readiness.js', null, true);

  // -------------------------------------------------------------------
  // 2. Public release must remain correctly blocked (fresh)
  // -------------------------------------------------------------------
  section('2. Public release must remain correctly blocked (fresh execution)');
  runFresh('check:license --mode public-release', 'scripts/check-license-decision.js', ['--mode', 'public-release'], false);

  // -------------------------------------------------------------------
  // 3. Privacy rules present (fresh execution of the monetization privacy gate)
  // -------------------------------------------------------------------
  section('3. Monetization privacy gate (fresh execution)');
  runFresh('check:monetization:privacy', 'scripts/check-monetization-privacy.js', null, true);

  // -------------------------------------------------------------------
  // 4. Required platform docs exist
  // -------------------------------------------------------------------
  section('4. Required platform docs exist');
  record('docs/internal-beta/platforms/PLATFORM_SUPPORT_AUDIT.md exists', fs.existsSync(AUDIT_DOC));
  record('docs/internal-beta/platforms/PLATFORM_ADAPTER_CONTRACT.md exists', fs.existsSync(CONTRACT_DOC));
  record('docs/internal-beta/platforms/PLATFORM_SUPPORT_MATRIX.md exists', fs.existsSync(MATRIX_DOC));

  // -------------------------------------------------------------------
  // 5. Adapter contract defines forbidden fields and support-status labels
  // -------------------------------------------------------------------
  section('5. Adapter contract defines privacy rules and support-status labels');
  if (fs.existsSync(CONTRACT_DOC)) {
    const content = fs.readFileSync(CONTRACT_DOC, 'utf8');
    record('Contract documents forbidden data fields', /[Ff]orbidden [Dd]ata [Ff]ields/.test(content));
    record('Contract documents support-status labels (verified/beta/experimental/placeholder)',
      /verified/.test(content) && /placeholder/.test(content) && /experimental/.test(content));
  } else {
    record('Contract documents forbidden data fields', false, 'contract doc missing');
    record('Contract documents support-status labels', false, 'contract doc missing');
  }

  // -------------------------------------------------------------------
  // 6. ChatGPT remains verified; no unsupported platform is mislabeled verified
  // -------------------------------------------------------------------
  section('6. Platform support matrix: ChatGPT verified, no false "verified" claims');

  const NON_VERIFIABLE_PLATFORMS_YET = [
    'Claude browser',
    'Gemini browser',
    'Codex',
    'Claude Code desktop',
    'Claude Code terminal',
    'Generic terminal AI tools',
  ];

  if (fs.existsSync(MATRIX_DOC)) {
    const content = fs.readFileSync(MATRIX_DOC, 'utf8');
    const rows = content.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---'));

    const chatgptRow = rows.find((r) => /ChatGPT browser/.test(r));
    const chatgptVerified = !!chatgptRow && /\bverified\b/i.test(chatgptRow) && !/not verified/i.test(chatgptRow);
    record('ChatGPT browser row is marked verified', chatgptVerified,
      chatgptRow ? chatgptRow.trim() : 'ChatGPT browser row not found in matrix');

    let falseVerifiedClaims = [];
    for (const platformName of NON_VERIFIABLE_PLATFORMS_YET) {
      const row = rows.find((r) => r.includes(platformName));
      if (!row) continue; // platform not listed at all -- not a false claim
      // "verified" must not appear as a bare word (allow "not supported",
      // "placeholder", "experimental", etc.) unless it's part of a phrase
      // like "verified (fixture only)" which is explicitly exempted for
      // browser_mock only, not for these real-platform names.
      const claimsVerified = /\bverified\b/i.test(row) && !/not verified/i.test(row);
      if (claimsVerified) {
        falseVerifiedClaims.push({ platformName, row: row.trim() });
      }
    }
    record(
      `No unverified platform (${NON_VERIFIABLE_PLATFORMS_YET.join(', ')}) is marked "verified" in the matrix`,
      falseVerifiedClaims.length === 0,
      falseVerifiedClaims.length ? JSON.stringify(falseVerifiedClaims) : '',
    );
  } else {
    record('ChatGPT browser row is marked verified', false, 'matrix doc missing');
    record('No unverified platform is marked "verified" in the matrix', false, 'matrix doc missing');
  }

  // -------------------------------------------------------------------
  // 7. No forbidden private fields anywhere in the new platform docs/code
  // -------------------------------------------------------------------
  section('7. No forbidden private fields in platform docs or new adapter code');
  {
    const FORBIDDEN_FIELD_NAMES = [
      'pageTitle', 'pageUrl', 'pageContent', 'domText', 'promptText', 'aiResponse',
      'chatHistory', 'cookieData', 'authToken', 'sessionCookie', 'clipboardContent',
      'screenshotData',
    ];
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELD_NAMES.join('|')})["']?\\s*:`, 'g');

    let hits = [];
    function scanDir(dir, exts) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full, exts);
        } else if (exts.some((e) => entry.name.endsWith(e))) {
          const content = fs.readFileSync(full, 'utf8');
          const matches = [...content.matchAll(fieldKeyRe)];
          if (matches.length > 0) {
            hits.push({ file: path.relative(REPO_ROOT, full), fields: matches.map((m) => m[1]) });
          }
        }
      }
    }
    scanDir(PLATFORMS_DIR, ['.md']);
    scanDir(path.join(REPO_ROOT, 'apps', 'browser-extension', 'src', 'adapters', 'claude'), ['.ts']);

    record('No forbidden private field found as a data/schema key', hits.length === 0,
      hits.length ? JSON.stringify(hits) : '');
  }

  // -------------------------------------------------------------------
  // Decision
  // -------------------------------------------------------------------

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
    console.log('Reason: ChatGPT remains verified; no platform is mislabeled verified without');
    console.log('        evidence; required docs exist; privacy rules present; public release');
    console.log('        remains correctly blocked; revenue pilot gate passes fresh.');
  }
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));

  process.exit(decision === 'PASS' ? 0 : 1);
}

main();
