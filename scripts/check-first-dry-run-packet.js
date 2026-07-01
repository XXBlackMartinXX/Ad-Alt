#!/usr/bin/env node
// Verifies the first tester dry-run packet is present and meets quality gates.
// Run: node scripts/check-first-dry-run-packet.js
// Exit 0 = PASS (or PASS WITH WARNINGS), Exit 1 = FAIL

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUNS_DIR = path.join(ROOT, 'docs', 'internal-beta', 'dry-runs');
const INDEX_PATH = path.join(ROOT, 'docs', 'internal-beta', 'INDEX.md');

let passed = 0;
let warned = 0;
let failed = 0;

function pass(msg) {
  console.log(`  PASS  ${msg}`);
  passed++;
}

function warn(msg) {
  console.log(`  WARN  ${msg}`);
  warned++;
}

function fail(msg) {
  console.log(`  FAIL  ${msg}`);
  failed++;
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

console.log('');
console.log('=== check-first-dry-run-packet ===');
console.log('');

// -----------------------------------------------------------------------
// Section 1: Required dry-run docs exist
// -----------------------------------------------------------------------
console.log('-- Section 1: Required dry-run documents --');

const requiredDocs = [
  { file: 'FIRST_TESTER_DRY_RUN_WORKSHEET.md', label: 'First Tester Dry-Run Worksheet' },
  { file: 'DRY_RUN_RESULT_LOG_TEMPLATE.md', label: 'Dry-Run Result Log Template' },
  { file: 'PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md', label: 'Privacy-Safe Issue Capture Form' },
  { file: 'GO_NO_GO_DECISION_RECORD.md', label: 'Go/No-Go Decision Record' },
  { file: 'DRY_RUN_TRIAGE_CHECKLIST.md', label: 'Dry-Run Triage Checklist' },
  { file: 'ONE_TESTER_EXECUTION_RUNBOOK.md', label: 'One-Tester Execution Runbook' },
  { file: 'DRY_RUN_STATUS_TRACKER.md', label: 'Dry-Run Status Tracker' },
];

const docContents = {};

for (const doc of requiredDocs) {
  const filePath = path.join(DRY_RUNS_DIR, doc.file);
  const content = readFile(filePath);
  if (!content) {
    fail(`Missing: docs/internal-beta/dry-runs/${doc.file} (${doc.label})`);
  } else {
    docContents[doc.file] = content;
    pass(`Present: docs/internal-beta/dry-runs/${doc.file}`);
  }
}

console.log('');

// -----------------------------------------------------------------------
// Section 2: Status integrity -- must not claim completion without evidence
// -----------------------------------------------------------------------
console.log('-- Section 2: Status integrity (CANARY 12/13) --');

const worksheetContent = docContents['FIRST_TESTER_DRY_RUN_WORKSHEET.md'] || '';
const resultLogContent = docContents['DRY_RUN_RESULT_LOG_TEMPLATE.md'] || '';
const goNoGoContent = docContents['GO_NO_GO_DECISION_RECORD.md'] || '';
const trackerContent = docContents['DRY_RUN_STATUS_TRACKER.md'] || '';

// Worksheet must say NOT RUN YET or similar
if (/NOT RUN YET|NOT YET EXECUTED|not yet executed/i.test(worksheetContent)) {
  pass('Worksheet status: NOT RUN YET (correct for unprepared dry-run)');
} else if (/Status.*PASS|Status.*COMPLETED|dry-run completed/i.test(worksheetContent)) {
  fail('Worksheet incorrectly claims dry-run completed without execution evidence (CANARY 13)');
} else {
  warn('Worksheet status unclear -- verify it does not claim completion');
}

// Result log template must say NOT RUN
if (/NOT RUN|Status.*NOT RUN/i.test(resultLogContent)) {
  pass('Result log template status: NOT RUN (correct for template)');
} else if (/Status.*PASS|dry-run completed/i.test(resultLogContent)) {
  fail('Result log template incorrectly claims completion (CANARY 13)');
} else {
  warn('Result log template status unclear');
}

// Go/No-Go must say PENDING
if (/PENDING|not yet executed/i.test(goNoGoContent)) {
  pass('Go/No-Go decision: PENDING (correct before execution)');
} else if (/Decision.*GO\b|Decision.*HOLD|Decision.*STOP/i.test(goNoGoContent)) {
  fail('Go/No-Go decision was set without dry-run execution evidence (CANARY 13)');
} else {
  warn('Go/No-Go decision status unclear');
}

// Tracker must say NOT RUN YET for DRYRUN-001
if (/DRYRUN-001.*NOT RUN YET|NOT RUN YET.*DRYRUN-001/i.test(trackerContent)) {
  pass('Status tracker: DRYRUN-001 is NOT RUN YET (correct)');
} else if (/DRYRUN-001.*COMPLETED/i.test(trackerContent)) {
  fail('Status tracker claims DRYRUN-001 COMPLETED without execution evidence (CANARY 13)');
} else {
  warn('Status tracker DRYRUN-001 status unclear');
}

console.log('');

// -----------------------------------------------------------------------
// Section 3: Overclaiming forbidden phrases
// -----------------------------------------------------------------------
console.log('-- Section 3: Overclaiming detection --');

const overclaiming = [
  { pattern: /chrome web store/i, label: 'Chrome Web Store ready claim' },
  { pattern: /production.{0,20}ready/i, label: 'Production-ready claim' },
  { pattern: /vs code marketplace/i, label: 'VS Code Marketplace ready claim' },
  { pattern: /public.{0,20}release.{0,20}ready/i, label: 'Public-release-ready claim' },
  { pattern: /staging.*reconciliation.*pass/i, label: 'Staging reconciliation passes claim' },
];

let overclaiming_issues = 0;

for (const [filename, content] of Object.entries(docContents)) {
  for (const rule of overclaiming) {
    if (rule.pattern.test(content)) {
      fail(`Overclaiming detected in ${filename}: ${rule.label}`);
      overclaiming_issues++;
    }
  }
}

if (overclaiming_issues === 0) {
  pass('No overclaiming patterns found in any dry-run doc');
}

console.log('');

// -----------------------------------------------------------------------
// Section 4: Privacy warnings present (CANARY 8)
// -----------------------------------------------------------------------
console.log('-- Section 4: Privacy warnings (CANARY 8) --');

const privacyPhrases = [
  'ChatGPT prompt',
  'personal data',
  'API key',
  '.env',
  'ppft_',
];

let docsWithPrivacyWarnings = 0;

for (const [filename, content] of Object.entries(docContents)) {
  const found = privacyPhrases.filter(phrase => content.includes(phrase));
  if (found.length >= 2) {
    docsWithPrivacyWarnings++;
  }
}

if (docsWithPrivacyWarnings >= 4) {
  pass(`Privacy warnings present in ${docsWithPrivacyWarnings}/7 dry-run docs`);
} else if (docsWithPrivacyWarnings >= 2) {
  warn(`Privacy warnings found in only ${docsWithPrivacyWarnings}/7 docs -- consider adding more`);
} else {
  fail(`Privacy warnings missing from most dry-run docs -- required by CANARY 8 (found in ${docsWithPrivacyWarnings}/7)`);
}

// Check PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md specifically
const captureForm = docContents['PRIVACY_SAFE_ISSUE_CAPTURE_FORM.md'] || '';
if (captureForm.includes('No ChatGPT prompt text') || captureForm.includes('API key')) {
  pass('Privacy-Safe Issue Capture Form contains evidence safety checklist');
} else {
  fail('Privacy-Safe Issue Capture Form missing evidence safety checklist');
}

console.log('');

// -----------------------------------------------------------------------
// Section 5: Escalation paths present
// -----------------------------------------------------------------------
console.log('-- Section 5: Escalation paths --');

const triageContent = docContents['DRY_RUN_TRIAGE_CHECKLIST.md'] || '';

if (/S0|P0|escalat/i.test(triageContent)) {
  pass('Triage checklist contains S0/P0 escalation path');
} else {
  fail('Triage checklist missing S0/P0 escalation path');
}

if (/billing invariant/i.test(triageContent)) {
  pass('Triage checklist contains billing invariant failure handling');
} else {
  fail('Triage checklist missing billing invariant failure handling (CANARY 15)');
}

if (/rollback/i.test(triageContent)) {
  pass('Triage checklist references rollback procedure');
} else {
  warn('Triage checklist does not reference rollback procedure');
}

const runbookContent = docContents['ONE_TESTER_EXECUTION_RUNBOOK.md'] || '';

if (/check:secrets:local|check:internal-beta-packet|check:internal-beta-rollout/i.test(runbookContent)) {
  pass('Execution runbook contains required pre-run check commands');
} else {
  fail('Execution runbook missing required pre-run check commands');
}

if (/Count slowly from 1 to 10/i.test(runbookContent)) {
  pass('Execution runbook contains approved safe test prompt');
} else {
  fail('Execution runbook missing approved safe test prompt');
}

if (/smoke:billing:local|smoke:billing:click:local/i.test(runbookContent)) {
  pass('Execution runbook references optional billing smoke commands');
} else {
  warn('Execution runbook does not reference billing smoke commands');
}

console.log('');

// -----------------------------------------------------------------------
// Section 6: API key scan (CANARY 7)
// -----------------------------------------------------------------------
console.log('-- Section 6: API key scan (CANARY 7) --');

const apiKeyPattern = /ppft_[0-9a-fA-F]{8,}/;
let keyFound = false;

for (const [filename, content] of Object.entries(docContents)) {
  if (apiKeyPattern.test(content)) {
    fail(`Raw API key pattern found in: docs/internal-beta/dry-runs/${filename} (CANARY 7)`);
    keyFound = true;
  }
}

if (!keyFound) {
  pass('No raw API key patterns found in any dry-run doc');
}

console.log('');

// -----------------------------------------------------------------------
// Section 7: INDEX.md coverage
// -----------------------------------------------------------------------
console.log('-- Section 7: INDEX.md coverage --');

const indexContent = readFile(INDEX_PATH) || '';

const indexLinks = [
  'FIRST_TESTER_DRY_RUN_WORKSHEET',
  'DRY_RUN_RESULT_LOG',
  'GO_NO_GO_DECISION_RECORD',
  'DRY_RUN_STATUS_TRACKER',
];

let indexMissing = 0;

for (const link of indexLinks) {
  if (indexContent.includes(link)) {
    pass(`INDEX.md links to ${link}`);
  } else {
    warn(`INDEX.md does not link to ${link} -- update INDEX.md`);
    indexMissing++;
  }
}

if (indexMissing > 0) {
  warn(`INDEX.md is missing ${indexMissing} dry-run doc links`);
}

console.log('');

// -----------------------------------------------------------------------
// Section 8: ASCII compliance (WARN only for docs)
// -----------------------------------------------------------------------
console.log('-- Section 8: ASCII compliance (docs -- WARN only) --');

let nonAsciiDocs = 0;

for (const [filename, content] of Object.entries(docContents)) {
  // eslint-disable-next-line no-control-regex
  const nonAscii = content.match(/[^\x00-\x7F]/g);
  if (nonAscii && nonAscii.length > 0) {
    warn(`Non-ASCII characters in ${filename} (${nonAscii.length} occurrences) -- acceptable in Markdown docs`);
    nonAsciiDocs++;
  }
}

if (nonAsciiDocs === 0) {
  pass('All dry-run docs are ASCII-clean');
}

console.log('');

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------
console.log('=== Summary ===');
console.log(`  Passed:   ${passed}`);
console.log(`  Warnings: ${warned}`);
console.log(`  Failed:   ${failed}`);
console.log('');

if (failed > 0) {
  console.log('Result: FAIL');
  console.log('');
  process.exit(1);
} else if (warned > 0) {
  console.log('Result: PASS WITH WARNINGS');
  console.log('');
  process.exit(0);
} else {
  console.log('Result: PASS');
  console.log('');
  process.exit(0);
}
