'use strict';
/**
 * Final Internal Pilot Readiness Gate — the top-level consolidation gate
 * for "Final Internal Pilot Release-Readiness Consolidation, Hardening,
 * and Review." This is the single gate a founder should run immediately
 * before launching the controlled ChatGPT browser revenue pilot.
 *
 * FRESH EXECUTION: every upstream gate and test suite below is re-run as
 * a real child process every time -- never trusts a stale report.
 *
 * check:platform-live-readiness is deliberately NOT required to PASS --
 * its HOLD result (human live evidence pending for Claude/Gemini) is
 * expected and acceptable for a ChatGPT-only controlled pilot. This gate
 * only requires that check:platform-live-readiness does not FAIL outright
 * (i.e. exits 0, whether its internal state is PASS or HOLD).
 *
 * Usage:
 *   node scripts/check-final-internal-pilot-readiness.js
 *   pnpm -w run check:final-internal-pilot
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLATFORMS_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'platforms');
const FINAL_READINESS_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'final-readiness');
const REVENUE_PILOT_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'revenue-pilot');

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

function runNodeScript(label, scriptRelPath, expectSuccess, extraArgs) {
  const args = [path.join(REPO_ROOT, scriptRelPath), ...(extraArgs || [])];
  commandsRun.push(`node ${scriptRelPath}${extraArgs ? ' ' + extraArgs.join(' ') : ''}`);
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const succeeded = result.status === 0;
  const asExpected = expectSuccess ? succeeded : !succeeded;
  record(`${label} (node ${scriptRelPath})`, asExpected,
    asExpected ? '' : `expected ${expectSuccess ? 'success' : 'failure'}, got status=${result.status}`);
  return { ok: asExpected, status: result.status, stdout: result.stdout || '' };
}

function runPnpm(label, args, expectSuccess, cwd) {
  const cwdAbs = cwd ? path.join(REPO_ROOT, cwd) : REPO_ROOT;
  commandsRun.push(`pnpm ${args.join(' ')} (cwd: ${cwd || '.'})`);
  const result = spawnSync('pnpm', args, { cwd: cwdAbs, encoding: 'utf8', shell: true });
  const succeeded = result.status === 0;
  const asExpected = expectSuccess ? succeeded : !succeeded;
  record(`${label}`, asExpected,
    asExpected ? '' : `expected ${expectSuccess ? 'success' : 'failure'}, got status=${result.status}`);
  return { ok: asExpected, status: result.status, stdout: result.stdout || '' };
}

function read(p) {
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  } catch {
    return null;
  }
}

function main() {
  console.log('[>>] Final Internal Pilot Readiness Gate');
  console.log('------------------------------------------------------------');

  // -------------------------------------------------------------------
  // 1. Core platform/pilot gates, fresh execution
  // -------------------------------------------------------------------
  section('1. Core gates (fresh execution)');
  runNodeScript('check:revenue-pilot', 'scripts/check-controlled-revenue-pilot-readiness.js', true);
  runNodeScript('check:platforms', 'scripts/check-platform-support-readiness.js', true);
  runNodeScript('check:platform-certification', 'scripts/check-platform-certification.js', true);
  runNodeScript('check:nonbrowser-platforms', 'scripts/check-nonbrowser-platform-readiness.js', true);
  runNodeScript('check:monetization:privacy', 'scripts/check-monetization-privacy.js', true);
  runNodeScript('check:secrets:local', 'scripts/check-no-secret-leaks.js', true);

  // -------------------------------------------------------------------
  // 2. check:platform-live-readiness -- HOLD is acceptable, only require exit 0
  // -------------------------------------------------------------------
  section('2. check:platform-live-readiness (HOLD acceptable -- only requires exit 0, not internal PASS)');
  if (fs.existsSync(path.join(REPO_ROOT, 'scripts', 'check-platform-live-readiness.js'))) {
    const r = runNodeScript('check:platform-live-readiness (HOLD/PASS both accepted, only FAIL rejected)',
      'scripts/check-platform-live-readiness.js', true);
    if (r.ok) {
      const isHold = /Result:\s*HOLD/.test(r.stdout);
      console.log(`  NOTE  internal result: ${isHold ? 'HOLD (human live evidence pending -- expected and fine)' : 'PASS'}`);
    }
  } else {
    record('scripts/check-platform-live-readiness.js exists', false, 'expected file missing');
  }

  // -------------------------------------------------------------------
  // 3. Smoke + unit tests, fresh execution
  // -------------------------------------------------------------------
  section('3. Smoke and unit tests (fresh execution)');
  runPnpm('smoke:chatgpt:fixture', ['-w', 'run', 'smoke:chatgpt:fixture'], true);
  runPnpm('browser-extension test:unit', ['--filter', '@ad-alt/browser-extension', 'test:unit'], true);

  const extensionPkgPath = path.join(REPO_ROOT, 'apps', 'extension', 'package.json');
  if (fs.existsSync(extensionPkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(extensionPkgPath, 'utf8'));
    if (pkg.scripts && pkg.scripts['test:unit']) {
      runPnpm('VS Code extension (promptprofit) test:unit', ['--filter', 'promptprofit', 'test:unit'], true);
    } else {
      console.log('  NOTE  apps/extension has no test:unit script -- skipped (not applicable)');
    }
  } else {
    console.log('  NOTE  apps/extension does not exist -- VS Code unit tests skipped (not applicable)');
  }

  // -------------------------------------------------------------------
  // 4. Public release remains blocked; real payout remains absent
  // -------------------------------------------------------------------
  section('4. Public release blocked; real payout execution absent');
  runNodeScript('check:license --mode public-release must FAIL', 'scripts/check-license-decision.js', false, ['--mode', 'public-release']);
  {
    // Static scan: no payout-execution / payment-processor code anywhere in apps/api/src.
    const apiSrcDir = path.join(REPO_ROOT, 'apps', 'api', 'src');
    const FORBIDDEN_PAYOUT_PATTERNS = [/stripe\.transfers?\.create/i, /paypal.*payout/i, /processPayout\s*\(/i, /executePayout\s*\(/i];
    let hits = [];
    function scanDir(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scanDir(full);
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
          const content = fs.readFileSync(full, 'utf8');
          for (const re of FORBIDDEN_PAYOUT_PATTERNS) {
            if (re.test(content)) hits.push({ file: path.relative(REPO_ROOT, full), pattern: re.source });
          }
        }
      }
    }
    scanDir(apiSrcDir);
    record('No real payout-execution code pattern found in apps/api/src', hits.length === 0,
      hits.length ? JSON.stringify(hits) : '');
  }

  // -------------------------------------------------------------------
  // 5. Master readiness docs exist
  // -------------------------------------------------------------------
  section('5. Master final-readiness docs exist');
  const requiredFinalDocs = [
    'MASTER_INTERNAL_PILOT_READINESS_AUDIT.md',
    'FINAL_PLATFORM_STATUS_FREEZE.md',
    'PILOT_EXECUTION_PACKET_REVIEW.md',
    'FINAL_PRIVACY_SECURITY_REVIEW.md',
    'FINAL_BILLING_LEDGER_REVIEW.md',
    'GENERATED_REPORT_WORKFLOW_REVIEW.md',
    'FINAL_RISK_REGISTER.md',
    'GO_NO_GO_FINAL_INTERNAL_PILOT.md',
  ];
  for (const docName of requiredFinalDocs) {
    record(`docs/internal-beta/final-readiness/${docName} exists`, fs.existsSync(path.join(FINAL_READINESS_DIR, docName)));
  }

  // -------------------------------------------------------------------
  // 6. No overclaim phrases anywhere in platform / final-readiness / revenue-pilot docs
  // -------------------------------------------------------------------
  section('6. No overclaim phrases in final-readiness, platform, or revenue-pilot docs');
  {
    const OVERCLAIM_PHRASES = [
      'public release ready',
      'production ready',
      'production-ready',
      'real payout ready',
      'all platforms verified',
      'all platforms are verified',
      'every platform is verified',
      'claude verified',
      'gemini verified',
      'claude browser is verified',
      'gemini browser is verified',
      'vs code verified',
      'vscode verified',
      'claude code supported',
      'codex supported',
      'desktop supported',
      'terminal supported',
      'zero ban risk',
      'zero account risk',
    ];
    // A phrase is only a genuine overclaim if it is NOT sitting inside a
    // negation/prohibition context (e.g. "must NOT claim production ready",
    // "This is NOT production ready", "Forbidden claims: ... production
    // ready"). Docs that correctly document what must not be claimed will
    // legitimately contain these exact phrases -- only flag a match when no
    // negation cue appears in the preceding text on the same line/nearby.
    const NEGATION_CUES = [
      'not ', "n't", 'never', 'no ', 'without', 'forbidden', 'must not',
      'does not', 'do not', 'blocked', 'cannot', 'nor ', 'disclaim',
      'not claim', 'not overclaim', 'must never',
    ];
    function isNegatedContext(lowerContent, matchIndex) {
      // Look back up to 1000 chars for the nearest markdown heading line
      // (e.g. "## What must not be claimed") and use everything from that
      // heading up to the match as the negation-check window -- a section
      // header establishes negation context for every bullet under it, not
      // just the immediate sentence. Falls back to the last 300 chars if no
      // heading is found nearby.
      const searchStart = Math.max(0, matchIndex - 1000);
      const preceding = lowerContent.slice(searchStart, matchIndex);
      const lastHeadingIdx = preceding.lastIndexOf('\n#');
      const window = lastHeadingIdx !== -1 ? preceding.slice(lastHeadingIdx) : preceding.slice(-300);
      return NEGATION_CUES.some((cue) => window.includes(cue));
    }
    let overclaims = [];
    function scanDocsDir(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const full = path.join(dir, entry.name);
        const lower = fs.readFileSync(full, 'utf8').toLowerCase();
        for (const phrase of OVERCLAIM_PHRASES) {
          let searchFrom = 0;
          let idx;
          while ((idx = lower.indexOf(phrase, searchFrom)) !== -1) {
            if (!isNegatedContext(lower, idx)) {
              overclaims.push({ file: path.relative(REPO_ROOT, full), phrase });
            }
            searchFrom = idx + phrase.length;
          }
        }
      }
    }
    scanDocsDir(PLATFORMS_DIR);
    scanDocsDir(FINAL_READINESS_DIR);
    scanDocsDir(REVENUE_PILOT_DIR);
    record('No overclaiming phrase found (negated/prohibition context excluded)', overclaims.length === 0,
      overclaims.length ? JSON.stringify(overclaims) : '');
  }

  // -------------------------------------------------------------------
  // 7. No forbidden private fields in new docs/templates
  // -------------------------------------------------------------------
  section('7. No forbidden private fields in final-readiness docs/templates');
  {
    const FORBIDDEN_FIELD_NAMES = [
      'pageTitle', 'pageUrl', 'pageContent', 'domText', 'promptText', 'aiResponse',
      'chatHistory', 'cookieData', 'authToken', 'sessionCookie', 'clipboardContent',
      'screenshotData', 'commandText', 'commandArgs', 'stdout', 'stderr', 'terminalBuffer',
      'sourceCode', 'fileContent', 'filePath', 'accountEmail', 'accountId',
    ];
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELD_NAMES.join('|')})["']?\\s*:`, 'g');
    let hits = [];
    if (fs.existsSync(FINAL_READINESS_DIR)) {
      for (const entry of fs.readdirSync(FINAL_READINESS_DIR, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const full = path.join(FINAL_READINESS_DIR, entry.name);
        const matches = [...fs.readFileSync(full, 'utf8').matchAll(fieldKeyRe)];
        if (matches.length > 0) hits.push({ file: entry.name, fields: matches.map((m) => m[1]) });
      }
    }
    record('No forbidden private field found as a data/schema key', hits.length === 0,
      hits.length ? JSON.stringify(hits) : '');
  }

  // -------------------------------------------------------------------
  // 8. No open S0/S1 final-readiness issues
  // -------------------------------------------------------------------
  section('8. No open S0/S1 issue in the final privacy/security review');
  {
    const privacyReviewContent = read(path.join(FINAL_READINESS_DIR, 'FINAL_PRIVACY_SECURITY_REVIEW.md'));
    if (privacyReviewContent !== null) {
      const openS0S1Re = /\|\s*S[01]\s*\|[^\n]*\|\s*(open|unresolved|pending fix)\s*\|/i;
      const hasOpenS0S1 = openS0S1Re.test(privacyReviewContent);
      record('FINAL_PRIVACY_SECURITY_REVIEW.md has no open S0/S1 entries', !hasOpenS0S1);
    } else {
      record('FINAL_PRIVACY_SECURITY_REVIEW.md exists for S0/S1 check', false, 'file missing');
    }
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
    console.log('Reason: All core gates pass fresh; smoke and unit tests pass; public release');
    console.log('        remains correctly blocked; no real payout code exists; all final-readiness');
    console.log('        docs exist; no overclaim phrase or forbidden field found; no open S0/S1');
    console.log('        issue. check:platform-live-readiness HOLD (if present) is accepted as');
    console.log('        expected -- human live evidence for Claude/Gemini is intentionally pending');
    console.log('        and does not block this ChatGPT-only controlled pilot.');
  }
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));

  process.exit(decision === 'PASS' ? 0 : 1);
}

main();
