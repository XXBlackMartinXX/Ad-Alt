'use strict';
/**
 * Native Hooks Shared Core Gate -- verifies packages/native-hook-adapter
 * (the shared, allowlist-based, no-content normalizer used by both the
 * Claude Code and Codex native hook integrations) builds, typechecks,
 * and passes its own tests, and that the required design/audit docs
 * exist with no overclaiming language.
 *
 * FRESH EXECUTION: rebuilds and re-tests the package as real child
 * processes every time.
 *
 * Usage:
 *   node scripts/check-native-hooks.js
 *   pnpm -w run check:native-hooks
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_DIR = path.join(REPO_ROOT, 'packages', 'native-hook-adapter');
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
  commandsRun.push(`pnpm --filter @ad-alt/native-hook-adapter ${args.join(' ')}`);
  const result = spawnSync('pnpm', ['--filter', '@ad-alt/native-hook-adapter', ...args], {
    cwd: REPO_ROOT, encoding: 'utf8',
  });
  const ok = result.status === 0;
  record(label, ok, ok ? '' : `exit status ${result.status}: ${(result.stderr || '').slice(-500)}`);
  return result;
}

function listSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return listSourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function main() {
  console.log('[>>] Native Hooks Shared Core Gate');
  console.log('------------------------------------------------------------');

  const packageExists = fs.existsSync(PKG_DIR) && fs.existsSync(path.join(PKG_DIR, 'package.json'));
  section('1. Package exists, builds, typechecks, and passes its own tests (fresh)');
  record('packages/native-hook-adapter exists', packageExists);
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

  section('2. Static source scan -- no forbidden fields, no network I/O, no raw payload logging');
  const sourceFiles = listSourceFiles(SRC_DIR);
  if (sourceFiles.length === 0) {
    record('Source files found under packages/native-hook-adapter/src', false);
  } else {
    record('Source files found under packages/native-hook-adapter/src', true, `${sourceFiles.length} files`);

    const FORBIDDEN_FIELD_NAMES = [
      'commandText', 'commandArgs', 'stdout', 'stderr', 'terminalBuffer',
      'promptText', 'aiResponse', 'responseText', 'chatHistory', 'conversationId',
      'pageUrl', 'pageTitle', 'domText', 'cookies', 'authToken', 'sessionCookie',
      'clipboardContent', 'screenshotData', 'videoData', 'traceData', 'ocrText',
      'sourceCode', 'fileContent', 'environmentVariables', 'workingDirectory',
      'shellHistory', 'windowText', 'accountId', 'paymentCredential',
      'toolInput', 'toolOutput',
    ];
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELD_NAMES.join('|')})["']?\\s*:`, 'g');
    let fieldHits = [];
    let networkHits = [];
    let consoleHits = [];
    for (const file of sourceFiles) {
      const src = fs.readFileSync(file, 'utf8');
      if (!file.endsWith('forbidden-fields.ts')) {
        const matches = [...src.matchAll(fieldKeyRe)];
        if (matches.length > 0) fieldHits.push({ file: path.relative(REPO_ROOT, file), fields: matches.map((m) => m[1]) });
      }
      if (/from ["']node:https?["']/.test(src) || /from ["']node:net["']/.test(src)) {
        networkHits.push(path.relative(REPO_ROOT, file));
      }
      if (/console\.\w+\(\s*(input\.)?rawText/.test(src) || /console\.\w+\(\s*raw\b/.test(src)) {
        consoleHits.push(path.relative(REPO_ROOT, file));
      }
    }
    record('No forbidden field used as an object key outside forbidden-fields.ts', fieldHits.length === 0,
      fieldHits.length ? JSON.stringify(fieldHits) : '');
    record('No source file imports node:http/https/net (package is fully offline)', networkHits.length === 0,
      networkHits.length ? JSON.stringify(networkHits) : '');
    record('No source file logs a raw payload variable', consoleHits.length === 0,
      consoleHits.length ? JSON.stringify(consoleHits) : '');
  }

  section('3. Required docs exist');
  const requiredDocs = ['NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md', 'NATIVE_HOOK_PRIVACY_CONTRACT.md'];
  for (const docName of requiredDocs) {
    record(`docs/internal-beta/platforms/${docName} exists`, fs.existsSync(path.join(PLATFORMS_DIR, docName)));
  }

  section('4. No overclaim in the new native-hook docs (negation-aware scan)');
  {
    const OVERCLAIM_PHRASES = [
      'claude code desktop supported', 'codex ide supported', 'codex desktop supported',
      'claude code native verified', 'codex native verified', 'all platforms verified',
      'reads terminal output', 'reads command text', 'captures prompt', 'captures response',
      'public release ready', 'production ready', 'production-ready', 'real payout ready',
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
    const NATIVE_HOOK_DOCS = [
      'NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md', 'NATIVE_HOOK_PRIVACY_CONTRACT.md',
      'CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md', 'CODEX_CLI_NATIVE_HOOK_INTEGRATION.md',
      'CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md', 'CLAUDE_CODE_DESKTOP_NATIVE_INTEGRATION_DECISION.md',
      'CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md', 'CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md',
      'CLAUDE_CODE_NATIVE_HOOK_RESULT_TEMPLATE.md', 'CODEX_CLI_NATIVE_HOOK_RESULT_TEMPLATE.md',
    ];
    let overclaims = [];
    for (const docName of NATIVE_HOOK_DOCS) {
      const full = path.join(PLATFORMS_DIR, docName);
      if (!fs.existsSync(full)) continue;
      const lower = fs.readFileSync(full, 'utf8').toLowerCase();
      for (const phrase of OVERCLAIM_PHRASES) {
        let searchFrom = 0;
        let idx;
        while ((idx = lower.indexOf(phrase, searchFrom)) !== -1) {
          if (!isNegatedContext(lower, idx)) overclaims.push({ file: docName, phrase });
          searchFrom = idx + phrase.length;
        }
      }
    }
    record('No overclaiming phrase found (negated/prohibition context excluded)', overclaims.length === 0,
      overclaims.length ? JSON.stringify(overclaims) : '');
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
  console.log('');
  console.log('Commands run this session:');
  commandsRun.forEach((c) => console.log(`  - ${c}`));
  process.exit(decision === 'PASS' ? 0 : 1);
}

main();
