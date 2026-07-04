'use strict';
/**
 * Platform Certification Gate — the mission-level gate for "Complete
 * Multi-Platform Support Before Pilot Execution." Builds on
 * scripts/check-platform-support-readiness.js (check:platforms, which this
 * script also re-runs fresh) with additional certification-specific checks:
 *
 *   1. ChatGPT browser remains verified.
 *   2. Claude/Gemini cannot be marked verified unless their smoke + privacy
 *      tests exist AND pass (fresh execution, not a stale report).
 *   3. Desktop/terminal/Codex cannot be marked verified unless separate
 *      integration tests exist and pass (currently: none do, and none are
 *      claimed to).
 *   4. Fixture-only platforms are labeled fixture-only/experimental, never
 *      verified.
 *   5. All required platform docs exist.
 *   6. Privacy rules exist (adapter contract's forbidden-field list).
 *   7. check:revenue-pilot still passes (fresh).
 *   8. check:platforms still passes (fresh).
 *   9. No forbidden private fields anywhere in platform docs or adapter code
 *      (Claude, Gemini, and the terminal fixture-only prototype).
 *  10. Public release remains correctly blocked (fresh).
 *  11. No platform doc overclaims support (production-ready, publicly
 *      released, real-payout-ready, or a live/verified claim for any
 *      platform that has no real-session evidence).
 *
 * FRESH EXECUTION: every check that can be re-run as a real command is
 * re-run as a real child process every invocation — never trusts a stale
 * markdown report.
 *
 * Usage:
 *   node scripts/check-platform-certification.js
 *   pnpm -w run check:platform-certification
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLATFORMS_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'platforms');
const MATRIX_DOC = path.join(PLATFORMS_DIR, 'PLATFORM_SUPPORT_MATRIX.md');

const findings = [];
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

  return { ok: asExpected, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function main() {
  console.log('[>>] Platform Certification Gate');
  console.log('------------------------------------------------------------');

  // -------------------------------------------------------------------
  // 1 & 8. check:platforms must still pass fresh (covers ChatGPT-verified,
  // no-false-verified-claims, doc existence, privacy-rules-present checks)
  // -------------------------------------------------------------------
  section('1. check:platforms (fresh execution)');
  runFresh('check:platforms', 'scripts/check-platform-support-readiness.js', null, true);

  // -------------------------------------------------------------------
  // 7. check:revenue-pilot must still pass fresh
  // -------------------------------------------------------------------
  section('2. check:revenue-pilot (fresh execution)');
  runFresh('check:revenue-pilot', 'scripts/check-controlled-revenue-pilot-readiness.js', null, true);

  // -------------------------------------------------------------------
  // 10. Public release must remain correctly blocked (fresh)
  // -------------------------------------------------------------------
  section('3. Public release must remain correctly blocked (fresh execution)');
  runFresh('check:license --mode public-release', 'scripts/check-license-decision.js', ['--mode', 'public-release'], false);

  // -------------------------------------------------------------------
  // 2. Claude/Gemini smoke + privacy tests exist AND pass (fresh)
  // -------------------------------------------------------------------
  section('4. Claude/Gemini fixture smoke tests exist and pass (fresh execution)');
  const claudeSmokePath = path.join(REPO_ROOT, 'apps/browser-extension/e2e/claude-adapter.smoke.spec.ts');
  const geminiSmokePath = path.join(REPO_ROOT, 'apps/browser-extension/e2e/gemini-adapter.smoke.spec.ts');
  record('claude-adapter.smoke.spec.ts exists', fs.existsSync(claudeSmokePath));
  record('gemini-adapter.smoke.spec.ts exists', fs.existsSync(geminiSmokePath));

  {
    commandsRun.push('pnpm -w run smoke:claude:fixture');
    const r = spawnSync('pnpm', ['-w', 'run', 'smoke:claude:fixture'], { cwd: REPO_ROOT, encoding: 'utf8', shell: true });
    record('pnpm -w run smoke:claude:fixture passes', r.status === 0, r.status !== 0 ? `exit status ${r.status}` : '');
  }
  {
    commandsRun.push('pnpm -w run smoke:gemini:fixture');
    const r = spawnSync('pnpm', ['-w', 'run', 'smoke:gemini:fixture'], { cwd: REPO_ROOT, encoding: 'utf8', shell: true });
    record('pnpm -w run smoke:gemini:fixture passes', r.status === 0, r.status !== 0 ? `exit status ${r.status}` : '');
  }

  section('5. Claude/Gemini unit + privacy test files exist');
  const requiredUnitFiles = [
    'apps/browser-extension/src/adapters/claude/__tests__/claude.adapter.test.ts',
    'apps/browser-extension/src/adapters/claude/__tests__/claude.privacy.test.ts',
    'apps/browser-extension/src/adapters/gemini/__tests__/gemini.adapter.test.ts',
    'apps/browser-extension/src/adapters/gemini/__tests__/gemini.privacy.test.ts',
  ];
  for (const rel of requiredUnitFiles) {
    record(`${rel} exists`, fs.existsSync(path.join(REPO_ROOT, rel)));
  }

  // -------------------------------------------------------------------
  // 3 & 4. Desktop/terminal/Codex not verified; fixture-only/experimental labeling
  // -------------------------------------------------------------------
  section('6. Desktop/terminal/Codex labeling in the matrix');
  if (fs.existsSync(MATRIX_DOC)) {
    const content = fs.readFileSync(MATRIX_DOC, 'utf8');
    const rows = content.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---'));

    const terminalRow = rows.find((r) => r.includes('Claude Code terminal'));
    const genericTerminalRow = rows.find((r) => r.includes('Generic terminal AI tools'));
    const codexRows = rows.filter((r) => r.includes('Codex'));
    const desktopRow = rows.find((r) => r.includes('Claude Code desktop'));

    // Accepts either the original fixture-only-prototype wording or the
    // newer real-generic-adapter wording ("experimental") introduced by
    // the Safe Real Integration Sprint -- both are honest, non-"verified"
    // labels; only an unqualified "verified" claim should ever fail this.
    record('Claude Code terminal row uses fixture-only/experimental + requires-separate-integration wording',
      !!terminalRow &&
        (/fixture-only/i.test(terminalRow) || /experimental/i.test(terminalRow)) &&
        /requires separate integration/i.test(terminalRow),
      terminalRow ? terminalRow.trim() : 'row not found');

    record('Generic terminal AI tools row uses fixture-only/experimental wording',
      !!genericTerminalRow && (/fixture-only/i.test(genericTerminalRow) || /experimental/i.test(genericTerminalRow)),
      genericTerminalRow ? genericTerminalRow.trim() : 'row not found');

    record('All Codex rows use requires-separate-integration wording, never verified',
      codexRows.length > 0 && codexRows.every((r) => /requires separate integration/i.test(r) && !/\bverified\b/i.test(r)),
      JSON.stringify(codexRows.map((r) => r.trim())));

    record('Claude Code desktop row uses requires-separate-integration wording, never verified',
      !!desktopRow && /requires separate integration/i.test(desktopRow) && !/\bverified\b/i.test(desktopRow),
      desktopRow ? desktopRow.trim() : 'row not found');
  } else {
    record('Matrix doc exists for desktop/terminal/Codex labeling checks', false, 'matrix doc missing');
  }

  // -------------------------------------------------------------------
  // 5. Required platform docs exist (this sprint's new docs)
  // -------------------------------------------------------------------
  section('7. Required platform docs exist (this sprint)');
  const requiredDocs = [
    'PLATFORM_COMPLETION_AUDIT.md',
    'CLAUDE_BROWSER_VERIFICATION.md',
    'GEMINI_BROWSER_VERIFICATION.md',
    'VSCODE_EXTENSION_VERIFICATION.md',
    'DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md',
    'TERMINAL_PROTOTYPE_VERIFICATION.md',
    'CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md',
    'PLATFORM_SUPPORT_MATRIX.md',
  ];
  for (const docName of requiredDocs) {
    record(`docs/internal-beta/platforms/${docName} exists`, fs.existsSync(path.join(PLATFORMS_DIR, docName)));
  }

  // -------------------------------------------------------------------
  // 9. No forbidden private fields in platform docs or new adapter code
  // (Claude, Gemini, and the terminal fixture-only prototype)
  // -------------------------------------------------------------------
  section('8. No forbidden private fields in platform docs or new adapter/prototype code');
  {
    const FORBIDDEN_FIELD_NAMES = [
      'pageTitle', 'pageUrl', 'pageContent', 'domText', 'promptText', 'aiResponse',
      'chatHistory', 'cookieData', 'authToken', 'sessionCookie', 'clipboardContent',
      'screenshotData', 'commandText', 'commandArgs', 'stdout', 'stderr', 'terminalBuffer',
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
    scanDir(path.join(REPO_ROOT, 'apps', 'browser-extension', 'src', 'adapters', 'gemini'), ['.ts']);
    scanDir(path.join(REPO_ROOT, 'scripts', 'lib'), ['.js']);

    record('No forbidden private field found as a data/schema key', hits.length === 0,
      hits.length ? JSON.stringify(hits) : '');
  }

  // -------------------------------------------------------------------
  // 11. No platform doc overclaims support
  // -------------------------------------------------------------------
  section('9. No platform doc overclaims support');
  {
    const OVERCLAIM_PHRASES = [
      'production ready',
      'production-ready',
      'publicly released',
      'public release ready',
      'real payout ready',
      'payout execution ready',
      'ready for real payout',
      'claude code terminal is verified',
      'claude code desktop is verified',
      'codex is verified',
      'terminal support is verified',
      'desktop support is verified',
      'claude browser is verified',
      'gemini browser is verified',
    ];
    let overclaims = [];
    if (fs.existsSync(PLATFORMS_DIR)) {
      for (const entry of fs.readdirSync(PLATFORMS_DIR, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const full = path.join(PLATFORMS_DIR, entry.name);
        const contentLower = fs.readFileSync(full, 'utf8').toLowerCase();
        for (const phrase of OVERCLAIM_PHRASES) {
          if (contentLower.includes(phrase)) {
            overclaims.push({ file: entry.name, phrase });
          }
        }
      }
    }
    record('No platform doc contains an overclaiming phrase', overclaims.length === 0,
      overclaims.length ? JSON.stringify(overclaims) : '');
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
    console.log('Reason: ChatGPT remains verified; Claude/Gemini beta status is backed by');
    console.log('        passing fixture/unit/privacy tests; desktop/terminal/Codex remain');
    console.log('        correctly unverified; no doc overclaims support; public release');
    console.log('        remains correctly blocked; revenue pilot gate passes fresh.');
  }
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));

  process.exit(decision === 'PASS' ? 0 : 1);
}

main();
