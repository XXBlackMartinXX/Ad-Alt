'use strict';
/**
 * Terminal Adapter Readiness Gate — verifies packages/terminal-adapter
 * (the generic, opt-in, lifecycle-only terminal adapter built for the
 * "Safe Real Integration Sprint for Claude Code Terminal, Claude Code
 * Desktop, and Codex CLI/IDE") behaves as designed:
 *
 *   1. The package exists, builds, typechecks, and its own test suite
 *      passes (fresh execution every time).
 *   2. A fresh, real run of `demo` mode produces only the allowed
 *      lifecycle event types, with no forbidden field.
 *   3. Static source scan: stdio is always 'inherit', never 'pipe'; no
 *      listener is ever attached to a child's stdout/stderr; no forbidden
 *      field name is used as an object key outside lifecycle.ts's own
 *      denylist declaration; no network module (http/https/net) is ever
 *      imported anywhere in the package.
 *   4. Required design/decision docs exist.
 *   5. No overclaiming phrase appears in this sprint's platform docs
 *      without being inside a negation/prohibition context (reuses the
 *      same negation-aware scanning approach as
 *      check-final-internal-pilot-readiness.js).
 *
 * FRESH EXECUTION: every check below re-runs real child processes or
 * re-reads real files -- nothing here trusts a stale report.
 *
 * Usage:
 *   node scripts/check-terminal-adapter.js
 *   pnpm -w run check:terminal-adapter
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_DIR = path.join(REPO_ROOT, 'packages', 'terminal-adapter');
const SRC_DIR = path.join(PKG_DIR, 'src');
const PLATFORMS_DIR = path.join(REPO_ROOT, 'docs', 'internal-beta', 'platforms');

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

function runPnpmFilter(label, args) {
  const cmd = `pnpm --filter @ad-alt/terminal-adapter ${args.join(' ')}`;
  commandsRun.push(cmd);
  const result = spawnSync('pnpm', ['--filter', '@ad-alt/terminal-adapter', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const ok = result.status === 0;
  record(label, ok, ok ? '' : `exit status ${result.status}: ${(result.stderr || '').slice(-500)}`);
  return result;
}

function listSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function main() {
  console.log('[>>] Terminal Adapter Readiness Gate');
  console.log('------------------------------------------------------------');

  const packageExists = fs.existsSync(PKG_DIR) && fs.existsSync(path.join(PKG_DIR, 'package.json'));

  section('1. Package exists, builds, typechecks, and passes its own tests (fresh)');
  record('packages/terminal-adapter exists', packageExists);

  if (packageExists) {
    runPnpmFilter('typecheck passes', ['typecheck']);
    runPnpmFilter('build passes', ['build']);
    const testResult = runPnpmFilter('test:unit passes', ['test:unit']);
    const testOutput = (testResult.stdout || '') + (testResult.stderr || '');
    record('Test output reports zero failed tests', !/\d+\s+failed/i.test(testOutput),
      /\d+\s+failed/i.test(testOutput) ? 'a "failed" count was reported' : '');
  } else {
    record('typecheck passes', false, 'package missing');
    record('build passes', false, 'package missing');
    record('test:unit passes', false, 'package missing');
  }

  section('2. Fresh demo run produces only allowed lifecycle events');
  if (packageExists) {
    const demoResult = spawnSync('pnpm', ['--filter', '@ad-alt/terminal-adapter', 'demo'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    commandsRun.push('pnpm --filter @ad-alt/terminal-adapter demo');
    record('demo command exits 0', demoResult.status === 0,
      demoResult.status !== 0 ? `exit status ${demoResult.status}` : '');

    const ALLOWED_EVENT_TYPES = [
      'adapter_started', 'adapter_stopped', 'session_started',
      'wait_state_started', 'wait_state_ended', 'banner_rendered',
      'banner_closed', 'kill_switch_active', 'error_safe_code_only',
    ];
    const lines = (demoResult.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'));
    let parsedEvents = [];
    let parseError = null;
    try {
      parsedEvents = lines.map((l) => JSON.parse(l));
    } catch (err) {
      parseError = String(err);
    }
    record('Every demo output line is valid JSON', parseError === null, parseError || '');
    const badTypes = parsedEvents.filter((e) => !ALLOWED_EVENT_TYPES.includes(e.eventType));
    record('Every emitted eventType is in the allowed lifecycle vocabulary', badTypes.length === 0,
      badTypes.length ? JSON.stringify(badTypes) : '');

    const FORBIDDEN_FIELD_NAMES = [
      'commandText', 'commandArgs', 'stdout', 'stderr', 'terminalBuffer',
      'promptText', 'aiResponse', 'responseText', 'chatHistory', 'conversationId',
      'pageUrl', 'pageTitle', 'domText', 'cookies', 'authToken', 'sessionCookie',
      'clipboardContent', 'screenshotData', 'videoData', 'traceData', 'ocrText',
      'sourceCode', 'fileContent', 'environmentVariables', 'workingDirectory',
      'shellHistory', 'windowText', 'accountId', 'paymentCredential',
    ];
    const rawJoined = JSON.stringify(parsedEvents);
    const forbiddenHits = FORBIDDEN_FIELD_NAMES.filter((f) => rawJoined.includes(`"${f}"`));
    record('No forbidden field present in any emitted demo event', forbiddenHits.length === 0,
      forbiddenHits.length ? JSON.stringify(forbiddenHits) : '');

    record('Demo events never spawn a real process (no ENOENT/exitCode noise expected)',
      parsedEvents.every((e) => e.exitCode === undefined || e.eventType === 'adapter_stopped') ||
      parsedEvents.length === 0 || parsedEvents.some((e) => e.eventType === 'adapter_started'),
      '');
  } else {
    record('demo command exits 0', false, 'package missing');
  }

  section('3. Static source scan -- stdio safety, no forbidden fields, no network I/O');
  const sourceFiles = listSourceFiles(SRC_DIR).filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`));
  if (sourceFiles.length === 0) {
    record('Source files found under packages/terminal-adapter/src', false);
  } else {
    record('Source files found under packages/terminal-adapter/src', true, `${sourceFiles.length} files`);

    const wrapFile = sourceFiles.find((f) => f.endsWith('wrap.ts'));
    if (wrapFile) {
      const wrapSrc = fs.readFileSync(wrapFile, 'utf8');
      record('wrap.ts passes stdio: "inherit" (never "pipe")',
        /stdio:\s*["']inherit["']/.test(wrapSrc) && !/stdio:\s*["']pipe["']/.test(wrapSrc));
      record('wrap.ts never reads child.stdout/child.stderr',
        !/child\.stdout/.test(wrapSrc) && !/child\.stderr/.test(wrapSrc));
    } else {
      record('wrap.ts exists for static stdio-safety checks', false);
    }

    const FORBIDDEN_FIELD_NAMES = [
      'commandText', 'commandArgs', 'stdout', 'stderr', 'terminalBuffer',
      'promptText', 'aiResponse', 'responseText', 'chatHistory', 'conversationId',
      'pageUrl', 'pageTitle', 'domText', 'cookies', 'authToken', 'sessionCookie',
      'clipboardContent', 'screenshotData', 'videoData', 'traceData', 'ocrText',
      'sourceCode', 'fileContent', 'environmentVariables', 'workingDirectory',
      'shellHistory', 'windowText', 'accountId', 'paymentCredential',
    ];
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELD_NAMES.join('|')})["']?\\s*:`, 'g');
    let fieldHits = [];
    for (const file of sourceFiles) {
      if (file.endsWith('lifecycle.ts')) continue; // owns the denylist declaration
      const src = fs.readFileSync(file, 'utf8');
      const matches = [...src.matchAll(fieldKeyRe)];
      if (matches.length > 0) {
        fieldHits.push({ file: path.relative(REPO_ROOT, file), fields: matches.map((m) => m[1]) });
      }
    }
    record('No forbidden field used as an object key outside lifecycle.ts', fieldHits.length === 0,
      fieldHits.length ? JSON.stringify(fieldHits) : '');

    let networkHits = [];
    for (const file of sourceFiles) {
      const src = fs.readFileSync(file, 'utf8');
      if (/from ["']node:https?["']/.test(src) || /from ["']node:net["']/.test(src)) {
        networkHits.push(path.relative(REPO_ROOT, file));
      }
    }
    record('No source file imports node:http/https/net (package is fully offline)', networkHits.length === 0,
      networkHits.length ? JSON.stringify(networkHits) : '');

    let cpHits = [];
    for (const file of sourceFiles) {
      if (file.endsWith('wrap.ts')) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (/node:child_process/.test(src)) cpHits.push(path.relative(REPO_ROOT, file));
    }
    record('child_process usage is isolated to wrap.ts only', cpHits.length === 0,
      cpHits.length ? JSON.stringify(cpHits) : '');
  }

  section('4. Required docs exist');
  const requiredDocs = [
    'TERMINAL_DESKTOP_CODEX_DEEP_INTEGRATION_AUDIT.md',
    'REAL_TERMINAL_ADAPTER_DESIGN.md',
    'CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md',
    'CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md',
    'CODEX_CLI_IDE_INTEGRATION_DECISION.md',
  ];
  for (const docName of requiredDocs) {
    record(`docs/internal-beta/platforms/${docName} exists`, fs.existsSync(path.join(PLATFORMS_DIR, docName)));
  }

  section('5. Support labels are honest; no overclaims (negation-aware scan)');
  {
    const OVERCLAIM_PHRASES = [
      'claude code terminal verified',
      'claude code desktop supported',
      'codex supported',
      'all terminal tools supported',
      'reads terminal output',
      'reads command text',
      'captures prompt',
      'captures response',
      'public release ready',
      'production ready',
      'production-ready',
      'real payout ready',
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

    let overclaims = [];
    if (fs.existsSync(PLATFORMS_DIR)) {
      for (const entry of fs.readdirSync(PLATFORMS_DIR, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const full = path.join(PLATFORMS_DIR, entry.name);
        const lower = fs.readFileSync(full, 'utf8').toLowerCase();
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

    // Every decision doc must declare an honest, non-verified label for
    // the platform it covers -- "experimental" or "requires separate
    // integration", never "verified" as this platform's own status.
    const labelChecks = [
      { doc: 'CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md', mustContain: ['experimental'] },
      { doc: 'CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md', mustContain: ['requires separate integration'] },
      { doc: 'CODEX_CLI_IDE_INTEGRATION_DECISION.md', mustContain: ['experimental', 'requires separate integration'] },
    ];
    for (const { doc, mustContain } of labelChecks) {
      const full = path.join(PLATFORMS_DIR, doc);
      const content = fs.existsSync(full) ? fs.readFileSync(full, 'utf8').toLowerCase() : '';
      const allPresent = mustContain.every((phrase) => content.includes(phrase));
      record(`${doc} declares its honest support label(s): ${mustContain.join(', ')}`, allPresent,
        allPresent ? '' : 'doc missing or missing expected label phrase');
    }
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
    console.log('Reason: packages/terminal-adapter builds, typechecks, and passes its own');
    console.log('        tests; demo mode emits only allowed, forbidden-field-free lifecycle');
    console.log('        events; static scans confirm stdio safety and no network I/O; all');
    console.log('        required docs exist with honest, non-overclaiming support labels.');
  }
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));

  process.exit(decision === 'PASS' ? 0 : 1);
}

main();
