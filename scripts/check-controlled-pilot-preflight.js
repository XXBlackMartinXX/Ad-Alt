'use strict';
/**
 * Controlled ChatGPT Pilot Preflight Gate.
 *
 * Validates one pilot instance (created by scripts/setup-controlled-
 * pilot.js) end to end and produces a final GO/HOLD decision. This is
 * the last gate an operator runs immediately before launching a
 * controlled ChatGPT-browser-only pilot.
 *
 * FRESH EXECUTION: re-runs check:final-internal-pilot, check:revenue-
 * pilot, check:monetization:privacy, and check:secrets:local as real
 * child processes every time -- never trusts a stale report.
 *
 * Usage:
 *   node scripts/check-controlled-pilot-preflight.js --pilot-id <id>
 *   pnpm -w run pilot:preflight -- --pilot-id <id>
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { validatePilotSetup, FORBIDDEN_PATTERNS, UNSUPPORTED_PLATFORM_LABELS } = require('./lib/pilot-setup.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const INSTANCES_DIR = process.env.PROMPTPROFIT_PILOT_INSTANCES_DIR
  || path.join(REPO_ROOT, 'docs', 'internal-beta', 'revenue-pilot', 'instances');

const REQUIRED_INSTANCE_FILES = [
  'PILOT_SETUP.md', 'MANUAL_REVENUE_RECORD.md', 'PRE_LAUNCH_CHECKLIST.md', 'ROLLBACK_CONFIRMATION.md',
];

const OVERCLAIM_PHRASES = [
  'public release ready', 'production ready', 'production-ready',
  'real payout ready', 'automatic billing ready', 'all platforms verified',
  'ready for real payout', 'payout execution ready',
];
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

function parseArgs(argv) {
  const idIdx = argv.indexOf('--pilot-id');
  return { pilotId: idIdx === -1 ? undefined : argv[idIdx + 1] };
}

function runFresh(label, scriptRelPath, expectSuccess, extraArgs) {
  const scriptAbsPath = path.join(REPO_ROOT, scriptRelPath);
  const args = [scriptAbsPath, ...(extraArgs || [])];
  commandsRun.push(`node ${scriptRelPath}${extraArgs ? ' ' + extraArgs.join(' ') : ''}`);
  const result = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  const succeeded = result.status === 0;
  const asExpected = expectSuccess ? succeeded : !succeeded;
  record(`${label} (node ${scriptRelPath})`, asExpected,
    asExpected ? '' : `expected ${expectSuccess ? 'success' : 'failure'}, got status=${result.status}`);
  return { ok: asExpected, stdout: result.stdout || '' };
}

function scanPayoutCode() {
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
  return hits;
}

function main() {
  console.log('[>>] Controlled ChatGPT Pilot Preflight Gate');
  console.log('------------------------------------------------------------');

  const { pilotId } = parseArgs(process.argv.slice(2));
  if (!pilotId) {
    console.log('');
    console.log('Result: HOLD');
    console.log('Reason: --pilot-id <id> is required.');
    process.exit(1);
  }

  const instanceDir = path.join(INSTANCES_DIR, pilotId);

  section('1. Pilot instance folder and required files');
  record(`Instance folder exists (${path.relative(REPO_ROOT, instanceDir)})`, fs.existsSync(instanceDir));
  for (const fileName of REQUIRED_INSTANCE_FILES) {
    record(`${fileName} exists`, fs.existsSync(path.join(instanceDir, fileName)));
  }

  const setupJsonPath = path.join(instanceDir, 'PILOT_SETUP.json');
  record('PILOT_SETUP.json (machine-readable sidecar) exists', fs.existsSync(setupJsonPath));

  section('2. Pilot setup field validation');
  let setup = null;
  let validation = { valid: false, errors: ['PILOT_SETUP.json missing or unparsable'], warnings: [] };
  if (fs.existsSync(setupJsonPath)) {
    try {
      setup = JSON.parse(fs.readFileSync(setupJsonPath, 'utf8'));
      validation = validatePilotSetup(setup);
    } catch (err) {
      validation = { valid: false, errors: [`PILOT_SETUP.json is not valid JSON: ${String(err)}`], warnings: [] };
    }
  }
  record('Pilot setup has no validation errors', validation.valid,
    validation.valid ? '' : JSON.stringify(validation.errors));
  if (validation.warnings.length > 0) {
    console.log(`  NOTE  warnings: ${JSON.stringify(validation.warnings)}`);
  }

  section('3. ChatGPT-only scope confirmed');
  record('platform is exactly "ChatGPT browser"', !!setup && setup.platform === 'ChatGPT browser');
  record('chatgptOnly is true', !!setup && setup.chatgptOnly === true);
  record('noPublicRelease is true', !!setup && setup.noPublicRelease === true);
  record('noRealPayouts is true', !!setup && setup.noRealPayouts === true);
  record('manualRevenueRecordRequired is true', !!setup && setup.manualRevenueRecordRequired === true);

  section('4. Forbidden private data / unsupported platform scan across instance docs');
  {
    // Full generated documents legitimately contain cautionary boilerplate
    // like "never a card/account number" (MANUAL_REVENUE_RECORD.md's own
    // warnings). Unlike scanForPrivateData() (used for raw, short,
    // single-answer validation during the wizard, where that ambiguity
    // doesn't arise), this document-level scan must be negation-aware --
    // the same technique used for the overclaim scan below.
    let privacyHits = [];
    let platformHits = [];
    for (const fileName of [...REQUIRED_INSTANCE_FILES, 'PILOT_SETUP.json']) {
      const filePath = path.join(instanceDir, fileName);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const lower = content.toLowerCase();
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        let match;
        while ((match = globalRe.exec(content)) !== null) {
          if (!isNegatedContext(lower, match.index)) {
            privacyHits.push({ file: fileName, hit: name });
          }
          if (match.index === globalRe.lastIndex) globalRe.lastIndex += 1; // avoid infinite loop on zero-width matches
        }
      }
      for (const label of UNSUPPORTED_PLATFORM_LABELS) {
        // Ignore mentions inside the standard "non-negotiable scope"
        // disclaimer section, which correctly lists these platforms as
        // explicitly NOT part of this pilot.
        let searchFrom = 0;
        let idx;
        while ((idx = lower.indexOf(label, searchFrom)) !== -1) {
          const windowStart = Math.max(0, idx - 300);
          const window = lower.slice(windowStart, idx);
          const isDisclaimer = /non-negotiable scope|no claude|no gemini|is part of this pilot/.test(window) ||
            /no\s*$|—\s*no\s*$/.test(lower.slice(Math.max(0, idx - 10), idx));
          if (!isDisclaimer) platformHits.push({ file: fileName, label });
          searchFrom = idx + label.length;
        }
      }
    }
    record('No forbidden private data found in instance docs', privacyHits.length === 0,
      privacyHits.length ? JSON.stringify(privacyHits) : '');
    record('No unsupported-platform overclaim found in instance docs', platformHits.length === 0,
      platformHits.length ? JSON.stringify(platformHits) : '');
  }

  section('5. No forbidden overclaim phrases in instance docs (negation-aware)');
  {
    let overclaims = [];
    for (const fileName of REQUIRED_INSTANCE_FILES) {
      const filePath = path.join(instanceDir, fileName);
      if (!fs.existsSync(filePath)) continue;
      const lower = fs.readFileSync(filePath, 'utf8').toLowerCase();
      for (const phrase of OVERCLAIM_PHRASES) {
        let searchFrom = 0;
        let idx;
        while ((idx = lower.indexOf(phrase, searchFrom)) !== -1) {
          if (!isNegatedContext(lower, idx)) overclaims.push({ file: fileName, phrase });
          searchFrom = idx + phrase.length;
        }
      }
    }
    record('No overclaiming phrase found (negated/prohibition context excluded)', overclaims.length === 0,
      overclaims.length ? JSON.stringify(overclaims) : '');
  }

  // Fail fast: only pay for the expensive fresh-execution gates below
  // (which fresh-run the full platform/pilot/privacy suite and take
  // minutes) once every cheap, local, instance-specific check above has
  // already passed. This gives the operator immediate HOLD feedback for
  // obvious problems (missing budget cap, private data, etc.) instead of
  // waiting minutes to be told something that was already known.
  const cheapFailures = findings.filter((f) => !f.ok);
  if (cheapFailures.length > 0) {
    console.log('');
    console.log('(Skipping expensive fresh-execution gates -- fix the failures above first.)');
    printResultAndExit(findings, commandsRun);
    return;
  }

  section('6. Final readiness gates (fresh execution)');
  runFresh('check:final-internal-pilot', 'scripts/check-final-internal-pilot-readiness.js', true);
  runFresh('check:revenue-pilot', 'scripts/check-controlled-revenue-pilot-readiness.js', true);
  runFresh('check:monetization:privacy', 'scripts/check-monetization-privacy.js', true);
  runFresh('check:secrets:local', 'scripts/check-no-secret-leaks.js', true);

  section('7. Public release must remain blocked; real payout execution must remain absent');
  runFresh('check:license --mode public-release must FAIL', 'scripts/check-license-decision.js', false, ['--mode', 'public-release']);
  const payoutHits = scanPayoutCode();
  record('No real payout-execution code pattern found in apps/api/src', payoutHits.length === 0,
    payoutHits.length ? JSON.stringify(payoutHits) : '');

  printResultAndExit(findings, commandsRun);
}

function printResultAndExit(findings, commandsRun) {
  const failures = findings.filter((f) => !f.ok);
  console.log('');
  console.log('=== Summary ===');
  console.log(`  Checks: ${findings.length}`);
  console.log(`  Failures: ${failures.length}`);

  const decision = failures.length === 0 ? 'GO' : 'HOLD';
  console.log('');
  console.log(`Result: ${decision}`);
  if (decision === 'GO') {
    console.log('Reason: GO for controlled ChatGPT browser pilot setup only.');
  } else {
    console.log('Reason:');
    failures.forEach((f) => console.log(`  - ${f.label}${f.detail ? ': ' + f.detail : ''}`));
  }
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));

  process.exit(decision === 'GO' ? 0 : 1);
}

main();
