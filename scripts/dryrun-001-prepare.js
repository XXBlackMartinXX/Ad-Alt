#!/usr/bin/env node
// Semi-automated DRYRUN-001 preparation conductor.
// Runs all safe owner-side pre-run checks and creates the result draft.
// Does NOT automate ChatGPT login, prompt entry, or tester interaction.
// Usage: node scripts/dryrun-001-prepare.js
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUNS_DIR = path.join(ROOT, 'docs', 'internal-beta', 'dry-runs');
const DIST_PACKAGE_DIR = path.join(ROOT, 'apps', 'browser-extension', 'dist-package');
const TEMPLATE_PATH = path.join(DRY_RUNS_DIR, 'DRY_RUN_RESULT_LOG_TEMPLATE.md');
const DRAFT_PATH = path.join(DRY_RUNS_DIR, 'DRYRUN-001_RESULT_DRAFT.md');
const RESULT_LOG_PATH = path.join(DRY_RUNS_DIR, 'DRYRUN-001_RESULT_LOG.md');
const EXPECTED_BRANCH = 'claude/ecstatic-maxwell-h0d8d8';

let checks = [];

function runCmd(cmd) {
  return spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

function lastLine(out) {
  return (out || '').trim().split('\n').filter(Boolean).pop() || '';
}

function check(label, cmd, opts = {}) {
  const res = runCmd(cmd);
  const ok = res.status === 0;
  const out = (res.stdout || '') + (res.stderr || '');
  const summary = lastLine(out);

  if (opts.expectFail) {
    if (!ok) {
      console.log(`  PASS  ${label} (correctly blocking -- exit ${res.status})`);
      checks.push({ label, result: 'GATE-OK', expectFail: true });
    } else {
      console.log(`  FAIL  ${label} -- PUBLIC-RELEASE GATE IS NOT BLOCKING (this is wrong)`);
      checks.push({ label, result: 'GATE-BROKEN', expectFail: true });
    }
    return { ok: !ok, out };
  }

  if (ok) {
    console.log(`  PASS  ${label}`);
    checks.push({ label, result: 'PASS' });
  } else {
    console.log(`  FAIL  ${label}`);
    if (summary) console.log(`        ${summary}`);
    checks.push({ label, result: 'FAIL' });
  }
  return { ok, out };
}

// -----------------------------------------------------------------------
console.log('');
console.log('=== DRYRUN-001 PREPARE ===');
console.log('');

// -----------------------------------------------------------------------
// Branch check
// -----------------------------------------------------------------------
console.log('-- Environment --');

const branchRes = runCmd('git rev-parse --abbrev-ref HEAD');
const branch = (branchRes.stdout || '').trim();

if (branch !== EXPECTED_BRANCH) {
  console.log(`  FAIL  Branch: ${branch} (expected ${EXPECTED_BRANCH})`);
  console.log('');
  console.log('Switch to the correct branch before running this script.');
  process.exit(1);
}
console.log(`  PASS  Branch: ${branch}`);

const commitRes = runCmd('git rev-parse --short HEAD');
const commit = (commitRes.stdout || '').trim();
console.log(`        Commit: ${commit}`);

const statusRes = runCmd('git status --porcelain');
const dirty = (statusRes.stdout || '').trim();
if (dirty) {
  console.log(`  WARN  Working tree has uncommitted changes:`);
  dirty.split('\n').slice(0, 5).forEach(l => console.log(`        ${l}`));
  console.log('        Consider committing or stashing before running the dry-run session.');
} else {
  console.log('  PASS  Working tree: clean');
}

// Check result log doesn't already exist
if (fs.existsSync(RESULT_LOG_PATH)) {
  console.log('  WARN  DRYRUN-001_RESULT_LOG.md already exists -- dry-run may have been finalized');
  console.log('        Run check:dryrun:001 to verify the current state.');
}

console.log('');

// -----------------------------------------------------------------------
// Internal-beta checks
// -----------------------------------------------------------------------
console.log('-- Internal-beta checks --');

const psCheck = check('check:ps1', 'pnpm -w run check:ps1');
const secretCheck = check('check:secrets:local', 'pnpm -w run check:secrets:local');
const packetCheck = check('check:internal-beta-packet', 'pnpm -w run check:internal-beta-packet');
const rolloutCheck = check('check:internal-beta-rollout', 'pnpm -w run check:internal-beta-rollout');
const dryRunCheck = check('check:first-dry-run-packet', 'pnpm -w run check:first-dry-run-packet');

console.log('');
console.log('-- Package and audit --');

const packageCheck = check('package:browser:beta', 'pnpm -w run package:browser:beta');
const zipAuditCheck = check('package:browser:zip:audit (internal-beta)', 'pnpm -w run package:browser:zip:audit -- --mode internal-beta');
const vsixAuditCheck = check('package:vscode:vsix:audit (internal-beta)', 'pnpm -w run package:vscode:vsix:audit -- --mode internal-beta');

console.log('');
console.log('-- Public-release gate confirmation (expected: FAIL/blocking) --');

check('check:license (public-release)', 'pnpm -w run check:license -- --mode public-release', { expectFail: true });
check('package:browser:zip:audit (public-release)', 'pnpm -w run package:browser:zip:audit -- --mode public-release', { expectFail: true });
check('check:billing:reconciliation (public-release)', 'pnpm -w run check:billing:reconciliation -- --mode public-release', { expectFail: true });

// -----------------------------------------------------------------------
// Locate latest ZIP
// -----------------------------------------------------------------------
console.log('');
console.log('-- Artifact --');

let zipPath = null;
let zipSize = 0;
let zipFilename = null;

if (fs.existsSync(DIST_PACKAGE_DIR)) {
  const files = fs.readdirSync(DIST_PACKAGE_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => ({
      name: f,
      abs: path.join(DIST_PACKAGE_DIR, f),
      mtime: fs.statSync(path.join(DIST_PACKAGE_DIR, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length > 0) {
    zipFilename = files[0].name;
    zipPath = path.relative(ROOT, files[0].abs);
    zipSize = fs.statSync(files[0].abs).size;
    console.log(`  PASS  ZIP: ${zipPath}`);
    console.log(`        Size: ${zipSize} bytes`);
  } else {
    console.log('  WARN  No beta ZIP found in dist-package/');
    console.log('        package:browser:beta may have failed or not been run yet');
  }
} else {
  console.log('  WARN  dist-package/ directory does not exist');
}

// -----------------------------------------------------------------------
// Create result draft
// -----------------------------------------------------------------------
console.log('');
console.log('-- Result draft --');

const today = new Date().toISOString().slice(0, 10);

if (fs.existsSync(DRAFT_PATH)) {
  console.log('  INFO  DRYRUN-001_RESULT_DRAFT.md already exists -- skipping creation');
  console.log('        Delete it and re-run prepare to regenerate.');
} else {
  let templateContent = '';
  if (fs.existsSync(TEMPLATE_PATH)) {
    templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  }

  const draftContent = `# PromptProfit -- DRYRUN-001 Result Log (DRAFT)

**Status: READY FOR HUMAN EXECUTION**
**Dry-Run ID:** DRYRUN-001
**Branch:** claude/ecstatic-maxwell-h0d8d8
**Commit:** ${commit}
**Generated:** ${today}
**Artifact:** ${zipPath || '[not found -- run package:browser:beta]'}
**Artifact Size:** ${zipSize || '[unknown]'} bytes

---

> DRAFT -- generated by dryrun-001-prepare.js.
> Human execution has NOT occurred yet.
> Run dryrun-001-finalize.js after the real tester session to create the final result log.
> Do NOT manually change the status to PASS/FAIL/COMPLETED.

---

## Pre-Run Verification Results

| Check | Result |
|-------|--------|
| Branch | ${branch} |
| Commit | ${commit} |
| check:ps1 | ${psCheck.ok ? 'PASS' : 'FAIL'} |
| check:secrets:local | ${secretCheck.ok ? 'PASS' : 'FAIL'} |
| check:internal-beta-packet | ${packetCheck.ok ? 'PASS' : 'FAIL'} |
| check:internal-beta-rollout | ${rolloutCheck.ok ? 'PASS' : 'FAIL'} |
| check:first-dry-run-packet | ${dryRunCheck.ok ? 'PASS' : 'FAIL'} |
| package:browser:beta | ${packageCheck.ok ? 'PASS' : 'FAIL'} |
| ZIP audit (internal-beta) | ${zipAuditCheck.ok ? 'PASS' : 'FAIL'} |
| VSIX audit (internal-beta) | ${vsixAuditCheck.ok ? 'PASS' : 'FAIL'} |

## Public-Release Gate Status (must remain FAIL/blocking)

| Gate | Status |
|------|--------|
| LICENSE (public-release) | FAIL -- correctly blocking |
| ZIP (public-release) | FAIL -- correctly blocking (placeholder icons) |
| Billing (public-release) | FAIL -- correctly blocking (staging not run) |

## Package Artifact

| Field | Value |
|-------|-------|
| Artifact | ${zipPath || '[not found]'} |
| Size | ${zipSize || '[unknown]'} bytes |
| Commit | ${commit} |
| Date Generated | ${today} |

---

## Human Execution Fields (fill in after real tester session)

> These fields must be filled by a human owner during and after the real dry-run session.
> Do NOT fill these in without real tester execution evidence.

| Field | Value |
|-------|-------|
| Date | [DATE TBD] |
| Tester Role | [Non-engineer / Engineer -- no personal names] |
| OS | [e.g. Windows 11 22H2 / macOS 14.5] |
| Chrome Version | [e.g. 126.0.0.6478.127] |
| Extension Loaded From | [ZIP / dist/] |
| Install Succeeded | [YES / NO] |
| Safe Test Prompt Used Exactly | [YES / NO] |
| Banner Appeared | [YES / NO] |
| Banner Content Correct (placeholder only) | [YES / NO] |
| Close Button Worked | [YES / NO] |
| Disable Worked | [YES / NO] |
| Uninstall/Remove Worked | [YES / NO] |
| Privacy/Security Issue | [YES / NO] |
| Billing/Ledger Concern | [YES / NO] |
| Issues Found | [YES / NO -- if YES: use finalize script] |
| Go/No-Go Decision | [GO / HOLD / STOP -- PENDING] |

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
`;

  fs.writeFileSync(DRAFT_PATH, draftContent, 'utf8');
  console.log(`  PASS  Created: docs/internal-beta/dry-runs/DRYRUN-001_RESULT_DRAFT.md`);
}

// -----------------------------------------------------------------------
// Human-only steps
// -----------------------------------------------------------------------
const divider = '='.repeat(60);

console.log('');
console.log(divider);
console.log('HUMAN-ONLY STEPS (owner must complete manually)');
console.log(divider);
console.log('');
console.log('The following steps cannot be automated.');
console.log('Do NOT script ChatGPT interaction. Do NOT automate login or prompt entry.');
console.log('');

if (zipPath) {
  console.log(`1. Send the beta ZIP to the tester via a secure internal channel.`);
  console.log(`   ZIP: ${zipPath}`);
  console.log(`   Size: ${zipSize} bytes`);
  console.log(`   Do NOT send via unencrypted email or public link.`);
} else {
  console.log(`1. Build the beta ZIP (package:browser:beta failed -- check output above).`);
  console.log(`   Then send to tester via secure internal channel.`);
}
console.log('');
console.log('2. Tester: Open Chrome and navigate to chrome://extensions');
console.log('   Tester: Enable Developer Mode (toggle, top right)');
console.log('   Tester: Click "Load unpacked" and select the dist/ folder from the ZIP');
console.log('   Tester: Confirm "PromptProfit" appears in the list with no error badge');
console.log('');
console.log('3. Tester: Navigate to https://chatgpt.com (manual login -- do not automate)');
console.log('   Tester: Open a NEW chat (not an existing conversation)');
console.log('   Tester: Type EXACTLY the following prompt:');
console.log('');
console.log('     Count slowly from 1 to 10.');
console.log('');
console.log('   Tester: Send the prompt and watch the bottom-right viewport area');
console.log('');
console.log('4. While ChatGPT generates the response, observe the banner:');
console.log('   [ ] Banner appeared in bottom-right corner');
console.log('   [ ] Banner shows placeholder headline text only');
console.log('   [ ] Banner shows placeholder body text and display URL');
console.log('   [ ] No ChatGPT content or personal data visible in the banner');
console.log('   [ ] No ppft_ key visible anywhere in the browser UI');
console.log('');
console.log('5. Tester: Click the X button on the banner');
console.log('   [ ] Banner disappears immediately');
console.log('');
console.log('6. Tester: Open chrome://extensions');
console.log('   Tester: Toggle PromptProfit to OFF (gray/disabled)');
console.log('   Tester: Navigate to chatgpt.com and send any prompt');
console.log('   [ ] NO banner appears when extension is disabled');
console.log('   Tester: Click Remove on PromptProfit in chrome://extensions');
console.log('   [ ] Extension is gone from the list');
console.log('   [ ] chatgpt.com still loads and works normally');
console.log('');
console.log('7. PRIVACY RULES (tester must follow throughout):');
console.log('   - Do NOT share ChatGPT prompts, responses, or screenshots with ChatGPT content');
console.log('   - Do NOT share screenshots containing personal or private data');
console.log('   - Do NOT share API keys, .env files, ppft_ patterns, or tokens');
console.log('   - Do NOT share full browser URLs containing session IDs');
console.log('   - Do NOT share cookies or raw logs containing secrets');
console.log('   - Only use the approved safe prompt: "Count slowly from 1 to 10."');
console.log('');
console.log('8. After the session:');
console.log('   Run: pnpm -w run dryrun:001:finalize');
console.log('   This records the results and creates the official result log.');
console.log('');

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------
console.log(divider);
console.log('SUMMARY');
console.log(divider);
console.log('');

const internalPassed = checks.filter(c => !c.expectFail && c.result === 'PASS').length;
const internalTotal = checks.filter(c => !c.expectFail).length;
const gatePassed = checks.filter(c => c.expectFail && c.result === 'GATE-OK').length;
const gateBroken = checks.filter(c => c.expectFail && c.result === 'GATE-BROKEN').length;
const anyFail = checks.some(c => (!c.expectFail && c.result === 'FAIL') || (c.expectFail && c.result === 'GATE-BROKEN'));

console.log(`  Internal-beta checks: ${internalPassed}/${internalTotal} PASS`);
console.log(`  Public-release gates: ${gatePassed}/${gatePassed + gateBroken} correctly blocking`);
console.log(`  ZIP artifact: ${zipPath ? zipPath : 'NOT FOUND'}`);
console.log(`  Draft created: ${fs.existsSync(DRAFT_PATH) ? 'YES' : 'NO'}`);
console.log('');

if (anyFail) {
  console.log('Result: FAIL -- resolve the above issues before scheduling the tester session');
  console.log('');
  process.exit(1);
} else if (gateBroken > 0) {
  console.log('Result: FAIL -- public-release gates are not blocking (this should not happen)');
  console.log('');
  process.exit(1);
} else {
  console.log('Status: READY FOR HUMAN EXECUTION');
  console.log('');
  console.log('Next step: schedule the tester session and follow the human-only steps above.');
  console.log('After the session: pnpm -w run dryrun:001:finalize');
  console.log('');
}
