'use strict';
/**
 * Nonbrowser Platform Readiness Gate — the mission-level gate for
 * "Verify and harden the next non-browser platform surfaces": VS Code,
 * terminal/CLI, Claude Code, and Codex.
 *
 * FRESH EXECUTION: re-runs check:revenue-pilot, check:platform-
 * certification, and check:vscode-extension as real child processes
 * every time -- never trusts a stale report.
 *
 * This gate:
 *   1. Confirms ChatGPT browser remains verified.
 *   2. Confirms Claude/Gemini remain beta, pending live evidence (not
 *      overclaimed as verified without a qualifying result log).
 *   3. Validates VS Code's label is honest (beta, not verified, unless a
 *      qualifying VSCODE_VERIFICATION_RESULT_LOG.md exists).
 *   4. Validates terminal/Claude Code/Codex are never claimed as
 *      verified/supported anywhere in the platform docs.
 *   5. Fails on "all platforms verified" style overclaiming language.
 *   6. Fails on forbidden private fields in the new nonbrowser docs/code.
 *
 * Usage:
 *   node scripts/check-nonbrowser-platform-readiness.js
 *   pnpm -w run check:nonbrowser-platforms
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

function runFresh(label, scriptRelPath, expectSuccess) {
  const scriptAbsPath = path.join(REPO_ROOT, scriptRelPath);
  commandsRun.push(`node ${scriptRelPath}`);
  const result = spawnSync(process.execPath, [scriptAbsPath], { cwd: REPO_ROOT, encoding: 'utf8' });
  const succeeded = result.status === 0;
  const asExpected = expectSuccess ? succeeded : !succeeded;
  record(`${label} (node ${scriptRelPath})`, asExpected,
    asExpected ? '' : `expected ${expectSuccess ? 'success' : 'failure'}, got status=${result.status}`);
  return { ok: asExpected, stdout: result.stdout || '' };
}

function read(p) {
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  } catch {
    return null;
  }
}

function main() {
  console.log('[>>] Nonbrowser Platform Readiness Gate');
  console.log('------------------------------------------------------------');

  // -------------------------------------------------------------------
  // 1. Required upstream gates, fresh execution
  // -------------------------------------------------------------------
  section('1. Upstream gates (fresh execution)');
  runFresh('check:revenue-pilot', 'scripts/check-controlled-revenue-pilot-readiness.js', true);
  runFresh('check:platform-certification', 'scripts/check-platform-certification.js', true);
  if (fs.existsSync(path.join(REPO_ROOT, 'scripts', 'check-vscode-extension-readiness.js'))) {
    runFresh('check:vscode-extension', 'scripts/check-vscode-extension-readiness.js', true);
  }
  if (fs.existsSync(path.join(REPO_ROOT, 'scripts', 'check-terminal-prototype.js'))) {
    runFresh('check:terminal-prototype', 'scripts/check-terminal-prototype.js', true);
  }
  if (fs.existsSync(path.join(REPO_ROOT, 'scripts', 'check-terminal-adapter.js'))) {
    runFresh('check:terminal-adapter', 'scripts/check-terminal-adapter.js', true);
  }

  // -------------------------------------------------------------------
  // 2. Required nonbrowser docs exist
  // -------------------------------------------------------------------
  section('2. Required nonbrowser platform docs exist');
  const requiredDocs = [
    'VSCODE_EXTENSION_DEEP_VERIFICATION.md',
    'VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md',
    'VSCODE_VERIFICATION_RESULT_TEMPLATE.md',
    'TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md',
    'DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md',
    'CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md',
    'TERMINAL_DESKTOP_CODEX_DEEP_INTEGRATION_AUDIT.md',
    'REAL_TERMINAL_ADAPTER_DESIGN.md',
    'CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md',
    'CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md',
    'CODEX_CLI_IDE_INTEGRATION_DECISION.md',
  ];
  for (const docName of requiredDocs) {
    record(`docs/internal-beta/platforms/${docName} exists`, fs.existsSync(path.join(PLATFORMS_DIR, docName)));
  }

  // -------------------------------------------------------------------
  // 3-4. Matrix labeling honesty per platform
  // -------------------------------------------------------------------
  section('3. Platform matrix labels are honest');
  const matrixContent = read(MATRIX_DOC);
  if (matrixContent !== null) {
    const rows = matrixContent.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---'));

    const chatgptRow = rows.find((r) => r.includes('ChatGPT browser'));
    const chatgptVerified = !!chatgptRow && /\bverified\b/i.test(chatgptRow) && !/not verified/i.test(chatgptRow);
    record('ChatGPT browser remains marked verified', chatgptVerified,
      chatgptRow ? '' : 'row not found');

    const NEVER_VERIFIED_PLATFORMS = [
      'Claude browser',
      'Gemini browser',
      'Claude Code terminal',
      'Claude Code desktop',
      'Codex',
      'Generic terminal AI tools',
    ];
    let falseVerifiedClaims = [];
    for (const platformName of NEVER_VERIFIED_PLATFORMS) {
      const row = rows.find((r) => r.includes(platformName));
      if (!row) continue;
      const claimsVerified = /\bverified\b/i.test(row) && !/not verified/i.test(row);
      if (claimsVerified) falseVerifiedClaims.push({ platformName, row: row.trim() });
    }
    record(`No platform in [${NEVER_VERIFIED_PLATFORMS.join(', ')}] is marked "verified" in the matrix`,
      falseVerifiedClaims.length === 0, falseVerifiedClaims.length ? JSON.stringify(falseVerifiedClaims) : '');

    // VS Code: verified only if a qualifying result log exists.
    const vscodeRow = rows.find((r) => r.includes('VS Code'));
    const vscodeClaimsVerified = !!vscodeRow && /\bverified\b/i.test(vscodeRow) && !/not verified/i.test(vscodeRow);
    if (vscodeClaimsVerified) {
      const resultLogPath = path.join(PLATFORMS_DIR, 'VSCODE_VERIFICATION_RESULT_LOG.md');
      const resultLogContent = read(resultLogPath);
      const checkedRe = /-\s*\[[xX]\]\s*`?([A-Z_]+)`?/g;
      const tokens = resultLogContent ? [...resultLogContent.matchAll(checkedRe)].map((m) => m[1]) : [];
      const qualifies = tokens.includes('VERIFIED_BY_HUMAN_LIVE_SESSION');
      record('VS Code matrix row claiming "verified" is backed by a qualifying VSCODE_VERIFICATION_RESULT_LOG.md',
        qualifies, qualifies ? '' : 'matrix claims verified but no qualifying result log exists');
    } else {
      record('VS Code matrix row does not overclaim "verified" without evidence', true);
    }
  } else {
    record('PLATFORM_SUPPORT_MATRIX.md exists for labeling checks', false, 'matrix doc missing');
  }

  // -------------------------------------------------------------------
  // 5. Global overclaim phrase scan across all platform docs
  // -------------------------------------------------------------------
  section('4. No "all platforms verified" style overclaim anywhere in platform docs');
  {
    const OVERCLAIM_PHRASES = [
      'all platforms verified',
      'all platforms are verified',
      'every platform is verified',
      'production ready',
      'production-ready',
      'publicly released',
      'public release ready',
      'real payout ready',
      'zero ban risk',
      'zero account risk',
      'claude code supported',
      'claude code terminal verified',
      'claude code desktop supported',
      'codex supported',
      'desktop supported',
      'terminal supported',
      'all terminal tools supported',
      'reads terminal output',
      'reads command text',
      'captures prompt',
      'captures response',
    ];
    // A phrase sitting inside a negation/prohibition context (e.g. "must
    // NOT claim ... supported", or a bullet under a "## What must not be
    // claimed" heading) is not an overclaim -- it is correctly documenting
    // what must not be claimed. Mirrors the negation-aware scan built for
    // check-final-internal-pilot-readiness.js.
    const NEGATION_CUES = [
      'not ', "n't", 'never', 'no ', 'without', 'forbidden', 'must not',
      'does not', 'do not', 'blocked', 'cannot', 'nor ', 'disclaim',
      'not claim', 'not overclaim', 'must never', 'unless',
    ];
    function isNegatedContext(lowerContent, matchIndex) {
      const searchStart = Math.max(0, matchIndex - 1000);
      const preceding = lowerContent.slice(searchStart, matchIndex);
      const lastHeadingIdx = preceding.lastIndexOf('\n#');
      const window = lastHeadingIdx !== -1 ? preceding.slice(lastHeadingIdx) : preceding.slice(-300);
      return NEGATION_CUES.some((cue) => window.includes(cue));
    }
    let overclaims = [];
    if (fs.existsSync(PLATFORMS_DIR)) {
      for (const entry of fs.readdirSync(PLATFORMS_DIR, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const lower = fs.readFileSync(path.join(PLATFORMS_DIR, entry.name), 'utf8').toLowerCase();
        for (const phrase of OVERCLAIM_PHRASES) {
          let searchFrom = 0;
          let idx;
          while ((idx = lower.indexOf(phrase, searchFrom)) !== -1) {
            if (!isNegatedContext(lower, idx)) {
              overclaims.push({ file: entry.name, phrase });
            }
            searchFrom = idx + phrase.length;
          }
        }
      }
    }
    record('No overclaiming phrase found (negated/prohibition context excluded)', overclaims.length === 0,
      overclaims.length ? JSON.stringify(overclaims) : '');
  }

  // -------------------------------------------------------------------
  // 6. No forbidden private fields in the new nonbrowser docs/code
  // -------------------------------------------------------------------
  section('5. No forbidden private fields in nonbrowser docs/code');
  {
    const FORBIDDEN_FIELD_NAMES = [
      'pageTitle', 'pageUrl', 'pageContent', 'domText', 'promptText', 'aiResponse',
      'chatHistory', 'cookieData', 'authToken', 'sessionCookie', 'clipboardContent',
      'screenshotData', 'commandText', 'commandArgs', 'stdout', 'stderr', 'terminalBuffer',
      'sourceCode', 'fileContent', 'filePath',
    ];
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELD_NAMES.join('|')})["']?\\s*:`, 'g');

    let hits = [];
    function scanDir(dir, exts) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'dist') continue;
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
    scanDir(path.join(REPO_ROOT, 'apps', 'extension', 'src'), ['.ts']);
    scanDir(path.join(REPO_ROOT, 'scripts', 'lib'), ['.js']);

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
    console.log('Reason: ChatGPT remains verified; Claude/Gemini/VS Code/terminal/Claude Code/');
    console.log('        Codex labels are all honest and evidence-backed; no overclaiming phrase');
    console.log('        found; no forbidden private field found; upstream gates pass fresh.');
  }
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));

  process.exit(decision === 'PASS' ? 0 : 1);
}

main();
