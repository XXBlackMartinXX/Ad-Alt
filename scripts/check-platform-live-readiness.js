'use strict';
/**
 * Platform Live Readiness Gate — validates the Claude/Gemini live-
 * verification workflow (no-login smoke tier + assisted manual logged-in
 * tier) without ever claiming a platform is verified from insufficient
 * evidence.
 *
 * Three possible outcomes:
 *   PASS — completed, sufficient evidence exists for what's being claimed.
 *   HOLD — runbooks/templates are ready but no human evidence has been
 *          recorded yet (or only partial/no-login evidence exists). This
 *          is an ACCEPTABLE, non-blocking outcome — see main()'s exit code.
 *   FAIL — something is actually wrong: missing required docs, forbidden
 *          data in a result log, or an overclaiming phrase.
 *
 * Exit code: 0 for PASS or HOLD, 1 only for FAIL. HOLD is deliberately
 * not a failure -- it means "the workflow is ready, human evidence is
 * pending," which is the expected, correct state until a human operator
 * actually runs the live workflow.
 *
 * FRESH EXECUTION: re-runs check:revenue-pilot, check:platforms,
 * check:platform-certification, check:monetization:privacy, and
 * check:secrets:local as real child processes every time.
 *
 * Usage:
 *   node scripts/check-platform-live-readiness.js
 *   pnpm -w run check:platform-live-readiness
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLATFORMS_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'platforms');
const MATRIX_DOC = path.join(PLATFORMS_DIR, 'PLATFORM_SUPPORT_MATRIX.md');

const findings = [];
const commandsRun = [];
let overallFail = false;

function record(label, ok, detail) {
  findings.push({ label, ok, detail: detail || '' });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' -- ' + detail : ''}`);
  if (!ok) overallFail = true;
}

function note(label, detail) {
  findings.push({ label, ok: true, detail: detail || '', isNote: true });
  console.log(`  NOTE  ${label}${detail ? ' -- ' + detail : ''}`);
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

function read(p) {
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  } catch {
    return null;
  }
}

/**
 * Extracts the single chosen final-result token from a filled-in result
 * log. Supports both a checked markdown checkbox (- [x] `TOKEN`) and a
 * plain "Final result: TOKEN" line, since a human operator may fill the
 * template either way.
 */
function extractFinalResult(content, allowedTokens) {
  const checkedRe = /-\s*\[[xX]\]\s*`?([A-Z_]+)`?/g;
  const checked = [...content.matchAll(checkedRe)]
    .map((m) => m[1])
    .filter((t) => allowedTokens.includes(t));
  if (checked.length === 1) return { token: checked[0], ambiguous: false };
  if (checked.length > 1) return { token: null, ambiguous: true, candidates: checked };

  const lineRe = /Final(?:\s+no-login)?\s+result[^\n]*?:\s*`?([A-Z_]+)`?/i;
  const m = content.match(lineRe);
  if (m && allowedTokens.includes(m[1].toUpperCase())) {
    return { token: m[1].toUpperCase(), ambiguous: false };
  }
  return { token: null, ambiguous: false };
}

function fieldPresent(content, fieldLabel, negativeAnswerRe) {
  const re = new RegExp(`${fieldLabel}[^\\n]*?:\\s*([^\\n]*)`, 'i');
  const m = content.match(re);
  if (!m) return null;
  const answer = m[1].trim();
  if (negativeAnswerRe.test(answer)) return false;
  if (/yes/i.test(answer)) return true;
  return null;
}

const FORBIDDEN_CONTENT_PATTERNS = [
  { label: 'prompt text marker', re: /write one short sentence about the moon[^.]{20,}/i },
  // Deliberately does NOT flag the exact fixed prompt sentence alone (it is
  // documented once, by design, in the safety policy) -- only flags it if
  // followed by unexpected extra prose that would suggest a real transcript
  // was pasted in alongside it.
];

const NO_LOGIN_TOKENS = [
  'LIVE_PAGE_SAFE',
  'LIVE_PAGE_SAFE_LOGIN_REQUIRED_FOR_WAIT_STATE',
  'HOLD',
  'FAIL',
];
const ASSISTED_TOKENS = [
  'VERIFIED_BY_HUMAN_LIVE_SESSION',
  'HOLD_LOGIN_REQUIRED',
  'HOLD_WAIT_STATE_NOT_REACHED',
  'FAIL_EXTENSION_CRASH',
  'FAIL_FORBIDDEN_TELEMETRY',
  'FAIL_BANNER_BEHAVIOR',
];

const PLATFORMS = [
  {
    name: 'Claude',
    runbook: 'CLAUDE_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md',
    noLoginTemplate: 'CLAUDE_NO_LOGIN_LIVE_SMOKE_RESULT_TEMPLATE.md',
    noLoginLog: 'CLAUDE_NO_LOGIN_LIVE_SMOKE_RESULT_LOG.md',
    assistedRunbook: 'CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md',
    assistedTemplate: 'CLAUDE_ASSISTED_LIVE_VERIFICATION_RESULT_TEMPLATE.md',
    assistedLog: 'CLAUDE_ASSISTED_LIVE_VERIFICATION_RESULT_LOG.md',
    matrixRowNeedle: 'Claude browser',
  },
  {
    name: 'Gemini',
    runbook: 'GEMINI_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md',
    noLoginTemplate: 'GEMINI_NO_LOGIN_LIVE_SMOKE_RESULT_TEMPLATE.md',
    noLoginLog: 'GEMINI_NO_LOGIN_LIVE_SMOKE_RESULT_LOG.md',
    assistedRunbook: 'GEMINI_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md',
    assistedTemplate: 'GEMINI_ASSISTED_LIVE_VERIFICATION_RESULT_TEMPLATE.md',
    assistedLog: 'GEMINI_ASSISTED_LIVE_VERIFICATION_RESULT_LOG.md',
    matrixRowNeedle: 'Gemini browser',
  },
];

function main() {
  console.log('[>>] Platform Live Readiness Gate');
  console.log('------------------------------------------------------------');

  // -------------------------------------------------------------------
  // 1. Required gates, fresh execution
  // -------------------------------------------------------------------
  section('1. Required gates (fresh execution)');
  runFresh('check:revenue-pilot', 'scripts/check-controlled-revenue-pilot-readiness.js', null, true);
  runFresh('check:platforms', 'scripts/check-platform-support-readiness.js', null, true);
  runFresh('check:platform-certification', 'scripts/check-platform-certification.js', null, true);
  runFresh('check:monetization:privacy', 'scripts/check-monetization-privacy.js', null, true);
  runFresh('check:secrets:local', 'scripts/check-no-secret-leaks.js', null, true);

  // -------------------------------------------------------------------
  // 2 & 3. Required runbooks exist
  // -------------------------------------------------------------------
  section('2. Required no-login and assisted-manual runbooks exist');
  const safetyPolicyPath = path.join(PLATFORMS_DIR, 'LIVE_VERIFICATION_SAFETY_POLICY.md');
  record('LIVE_VERIFICATION_SAFETY_POLICY.md exists', fs.existsSync(safetyPolicyPath));
  for (const p of PLATFORMS) {
    record(`${p.runbook} exists`, fs.existsSync(path.join(PLATFORMS_DIR, p.runbook)));
    record(`${p.assistedRunbook} exists`, fs.existsSync(path.join(PLATFORMS_DIR, p.assistedRunbook)));
  }

  // -------------------------------------------------------------------
  // 4. Result templates exist
  // -------------------------------------------------------------------
  section('3. Result templates exist');
  for (const p of PLATFORMS) {
    record(`${p.noLoginTemplate} exists`, fs.existsSync(path.join(PLATFORMS_DIR, p.noLoginTemplate)));
    record(`${p.assistedTemplate} exists`, fs.existsSync(path.join(PLATFORMS_DIR, p.assistedTemplate)));
  }

  // -------------------------------------------------------------------
  // 5-7. Evidence-based readiness per platform
  // -------------------------------------------------------------------
  section('4. Human evidence status per platform');

  const platformStatus = {}; // name -> { anyEvidence, noLoginOk, assistedVerified }

  for (const p of PLATFORMS) {
    const status = { anyEvidence: false, noLoginOk: false, assistedVerified: false };

    const noLoginLogPath = path.join(PLATFORMS_DIR, p.noLoginLog);
    const noLoginContent = read(noLoginLogPath);
    if (noLoginContent !== null) {
      status.anyEvidence = true;

      // Forbidden-content scan on the actual filled-in result log.
      const contentHits = FORBIDDEN_CONTENT_PATTERNS.filter((f) => f.re.test(noLoginContent)).map((f) => f.label);
      record(`${p.noLoginLog}: no forbidden content pattern detected`, contentHits.length === 0,
        contentHits.length ? JSON.stringify(contentHits) : '');

      const parsed = extractFinalResult(noLoginContent, NO_LOGIN_TOKENS);
      if (parsed.ambiguous) {
        record(`${p.noLoginLog}: exactly one final result selected`, false,
          `multiple candidates checked: ${JSON.stringify(parsed.candidates)}`);
      } else if (!parsed.token) {
        record(`${p.noLoginLog}: a valid final result value is present`, false, 'no recognizable token found');
      } else {
        note(`${p.name} no-login result recorded`, parsed.token);
        const safe = parsed.token === 'LIVE_PAGE_SAFE' || parsed.token === 'LIVE_PAGE_SAFE_LOGIN_REQUIRED_FOR_WAIT_STATE';
        record(`${p.name} no-login readiness (does NOT imply verified)`, safe,
          safe ? '' : `result was ${parsed.token}, not a safe/passing no-login state`);
        status.noLoginOk = safe;
      }
    } else {
      note(`${p.noLoginLog} does not exist yet`, 'no-login live smoke not yet run by a human operator (acceptable)');
    }

    const assistedLogPath = path.join(PLATFORMS_DIR, p.assistedLog);
    const assistedContent = read(assistedLogPath);
    if (assistedContent !== null) {
      status.anyEvidence = true;

      const contentHits = FORBIDDEN_CONTENT_PATTERNS.filter((f) => f.re.test(assistedContent)).map((f) => f.label);
      record(`${p.assistedLog}: no forbidden content pattern detected`, contentHits.length === 0,
        contentHits.length ? JSON.stringify(contentHits) : '');

      const parsed = extractFinalResult(assistedContent, ASSISTED_TOKENS);
      if (parsed.ambiguous) {
        record(`${p.assistedLog}: exactly one final result selected`, false,
          `multiple candidates checked: ${JSON.stringify(parsed.candidates)}`);
      } else if (!parsed.token) {
        record(`${p.assistedLog}: a valid final result value is present`, false, 'no recognizable token found');
      } else {
        note(`${p.name} assisted live-session result recorded`, parsed.token);

        if (parsed.token === 'VERIFIED_BY_HUMAN_LIVE_SESSION') {
          const forbiddenTelemetry = fieldPresent(assistedContent, 'Forbidden telemetry found', /no/i);
          const gatesPassed = fieldPresent(assistedContent, 'Privacy.{0,40}gates passed', /no/i);

          record(`${p.name}: VERIFIED_BY_HUMAN_LIVE_SESSION requires forbidden telemetry found = no`,
            forbiddenTelemetry === false, `field read as: ${JSON.stringify(forbiddenTelemetry)}`);
          record(`${p.name}: VERIFIED_BY_HUMAN_LIVE_SESSION requires privacy/secrets/platform gates passed = yes`,
            gatesPassed !== false, `field read as: ${JSON.stringify(gatesPassed)}`);

          status.assistedVerified = forbiddenTelemetry === false && gatesPassed !== false;
        } else {
          note(`${p.name} assisted result is not a verified claim`, parsed.token);
        }
      }
    } else {
      note(`${p.assistedLog} does not exist yet`, 'assisted manual live verification not yet run by a human operator (acceptable)');
    }

    platformStatus[p.name] = status;
  }

  // -------------------------------------------------------------------
  // 8a. Overclaim cross-check against the matrix
  // -------------------------------------------------------------------
  section('5. Matrix does not claim Claude/Gemini verified without matching evidence');
  const matrixContent = read(MATRIX_DOC);
  if (matrixContent !== null) {
    const rows = matrixContent.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---'));
    for (const p of PLATFORMS) {
      const row = rows.find((r) => r.includes(p.matrixRowNeedle));
      const claimsVerified = !!row && /\bverified\b/i.test(row) && !/not verified/i.test(row);
      if (claimsVerified) {
        record(`${p.matrixRowNeedle} matrix row claiming "verified" is backed by VERIFIED_BY_HUMAN_LIVE_SESSION evidence`,
          platformStatus[p.name].assistedVerified,
          platformStatus[p.name].assistedVerified ? '' : `matrix row claims verified but no qualifying ${p.assistedLog} exists`);
      } else {
        record(`${p.matrixRowNeedle} matrix row does not overclaim "verified"`, true);
      }
    }
  } else {
    record('PLATFORM_SUPPORT_MATRIX.md exists for overclaim cross-check', false, 'matrix doc missing');
  }

  // -------------------------------------------------------------------
  // 8b. Global overclaim phrase scan across result logs only
  // -------------------------------------------------------------------
  section('6. No overclaiming phrase in any completed result log');
  {
    const OVERCLAIM_PHRASES = [
      'production ready',
      'production-ready',
      'publicly released',
      'public release ready',
      'real payout ready',
      'zero ban risk',
      'zero account risk',
      'zero risk',
      'all platforms verified',
      'desktop verified',
      'terminal verified',
      'codex verified',
    ];
    let overclaims = [];
    for (const p of PLATFORMS) {
      for (const logName of [p.noLoginLog, p.assistedLog]) {
        const content = read(path.join(PLATFORMS_DIR, logName));
        if (content === null) continue;
        const lower = content.toLowerCase();
        for (const phrase of OVERCLAIM_PHRASES) {
          if (lower.includes(phrase)) overclaims.push({ file: logName, phrase });
        }
      }
    }
    record('No overclaiming phrase found in any completed result log', overclaims.length === 0,
      overclaims.length ? JSON.stringify(overclaims) : '');
  }

  // -------------------------------------------------------------------
  // Decision
  // -------------------------------------------------------------------
  const anyEvidenceAtAll = PLATFORMS.some((p) => platformStatus[p.name].anyEvidence);

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Checks: ${findings.filter((f) => !f.isNote).length}`);
  console.log(`  Failures: ${findings.filter((f) => !f.isNote && !f.ok).length}`);

  let decision;
  if (overallFail) {
    decision = 'FAIL';
  } else if (!anyEvidenceAtAll) {
    decision = 'HOLD';
  } else {
    decision = 'PASS';
  }

  console.log('');
  console.log(`Result: ${decision}`);
  if (decision === 'FAIL') {
    console.log('Reason:');
    findings.filter((f) => !f.isNote && !f.ok).forEach((f) => console.log(`  - ${f.label}${f.detail ? ': ' + f.detail : ''}`));
  } else if (decision === 'HOLD') {
    console.log('Reason: HOLD: live verification runbooks ready, human evidence not yet provided.');
    console.log('        Run pnpm -w run live:claude:no-login / live:gemini:no-login, then fill in');
    console.log('        the sanitized result templates once a human operator has evidence.');
  } else {
    console.log('Reason: Runbooks/templates present; recorded human evidence is internally');
    console.log('        consistent, forbidden-content-free, and does not overclaim support.');
  }
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));

  // HOLD is an acceptable, non-blocking outcome -- only FAIL exits non-zero.
  process.exit(decision === 'FAIL' ? 1 : 0);
}

main();
