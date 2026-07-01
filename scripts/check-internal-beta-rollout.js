'use strict';
/**
 * Verify that the internal beta ROLLOUT execution packet is complete,
 * not overclaiming, privacy-safe, and contains required rollout procedures.
 *
 * Extends check-internal-beta-packet.js by checking the rollout-specific docs
 * added in the internal beta rollout execution phase.
 *
 * Usage:
 *   node scripts/check-internal-beta-rollout.js
 *   pnpm -w run check:internal-beta-rollout
 *
 * Exit codes:
 *   0 -- all checks pass (WARNs are acceptable)
 *   1 -- at least one FAIL (missing doc, overclaiming, raw key, missing privacy warning,
 *        missing rollback instructions, or missing triage workflow)
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const BETA_DIR  = path.join(REPO_ROOT, 'docs', 'internal-beta');

let exitCode = 0;

function pass(msg)  { process.stdout.write('[PASS] ' + msg + '\n'); }
function fail(msg)  { process.stderr.write('[FAIL] ' + msg + '\n'); exitCode = 1; }
function warn(msg)  { process.stdout.write('[WARN] ' + msg + '\n'); }
function info(msg)  { process.stdout.write('[--]   ' + msg + '\n'); }
function section(t) { process.stdout.write('\n== ' + t + ' ==\n'); }

process.stdout.write('\n');
process.stdout.write('[>>] Internal Beta Rollout Packet Check\n');
process.stdout.write('-'.repeat(60) + '\n');

// ---------------------------------------------------------------------------
// 1. Required Rollout Documents
// ---------------------------------------------------------------------------

section('1. Required Rollout Documents');

const REQUIRED_ROLLOUT_DOCS = [
  'TESTER_INVITATION_TEMPLATES.md',
  'TESTER_QUICK_START_CHECKLIST.md',
  'FEEDBACK_INTAKE.md',
  'ISSUE_TEMPLATES.md',
  'TRIAGE_LABELS.md',
  'FIRST_TESTER_DRY_RUN.md',
  'BETA_ROLLOUT_SCHEDULE.md',
  'BETA_OWNER_CHECKLIST.md',
  'ROLLBACK_AND_DISABLE_GUIDE.md',
  'STAKEHOLDER_STATUS_UPDATE_TEMPLATE.md',
];

const existingRolloutDocs = [];
for (const doc of REQUIRED_ROLLOUT_DOCS) {
  const fp = path.join(BETA_DIR, doc);
  if (fs.existsSync(fp)) {
    pass(doc + ' exists');
    existingRolloutDocs.push(fp);
  } else {
    fail(doc + ' MISSING from docs/internal-beta/');
  }
}

// ---------------------------------------------------------------------------
// 2. Overclaiming Detection
// ---------------------------------------------------------------------------

section('2. Overclaiming Detection');

const FORBIDDEN_CLAIMS = [
  { pattern: /production.?ready/i,            label: 'production-ready claim' },
  { pattern: /chrome web store ready/i,       label: 'CWS-ready claim' },
  { pattern: /marketplace ready/i,            label: 'Marketplace-ready claim' },
  { pattern: /verified in production/i,       label: 'production-verified claim' },
  { pattern: /staging.*reconciliation.*pass/i, label: 'staging-reconciliation-pass claim (unverified)' },
];

let overclaimed = false;
for (const fp of existingRolloutDocs) {
  const text = fs.readFileSync(fp, 'utf8');
  for (const { pattern, label } of FORBIDDEN_CLAIMS) {
    if (pattern.test(text)) {
      fail(path.basename(fp) + ': contains forbidden claim: ' + label);
      overclaimed = true;
    }
  }
}
if (!overclaimed) {
  pass('No overclaiming detected in any rollout doc');
}

// ---------------------------------------------------------------------------
// 3. Privacy Warning Presence
// ---------------------------------------------------------------------------

section('3. Privacy Warning Presence');

const PRIVACY_PHRASES = [
  'do not share chatgpt prompt',
  'privacy warning',
  'privacy-safe',
];

let privacyDocCount = 0;
for (const fp of existingRolloutDocs) {
  const lower = fs.readFileSync(fp, 'utf8').toLowerCase();
  const hasPrivacy = PRIVACY_PHRASES.some(p => lower.includes(p)) ||
    (lower.includes('do not share') && (lower.includes('api key') || lower.includes('personal data')));
  if (hasPrivacy) {
    privacyDocCount++;
    info(path.basename(fp) + ': contains privacy warning');
  } else {
    warn(path.basename(fp) + ': no privacy warning phrase found (may be acceptable for this doc type)');
  }
}

if (privacyDocCount === 0) {
  fail('NONE of the rollout docs contain any privacy warning phrase -- at least one required');
} else if (privacyDocCount < 3) {
  fail('Only ' + privacyDocCount + ' rollout doc(s) contain a privacy warning -- at least 3 required');
} else {
  pass(privacyDocCount + ' rollout docs contain privacy warning phrases');
}

// ---------------------------------------------------------------------------
// 4. Rollback Instructions Presence
// ---------------------------------------------------------------------------

section('4. Rollback Instructions Presence');

const rollbackPath = path.join(BETA_DIR, 'ROLLBACK_AND_DISABLE_GUIDE.md');
if (!fs.existsSync(rollbackPath)) {
  fail('ROLLBACK_AND_DISABLE_GUIDE.md does not exist');
} else {
  const lower = fs.readFileSync(rollbackPath, 'utf8').toLowerCase();
  const hasDisable  = lower.includes('disable');
  const hasRemove   = lower.includes('remove');
  const hasRollback = lower.includes('rollback');
  if (hasDisable && hasRemove && hasRollback) {
    pass('ROLLBACK_AND_DISABLE_GUIDE.md contains disable, remove, and rollback instructions');
  } else {
    if (!hasDisable)  fail('ROLLBACK_AND_DISABLE_GUIDE.md missing "disable" instructions');
    if (!hasRemove)   fail('ROLLBACK_AND_DISABLE_GUIDE.md missing "remove" instructions');
    if (!hasRollback) fail('ROLLBACK_AND_DISABLE_GUIDE.md missing "rollback" instructions');
  }
}

// ---------------------------------------------------------------------------
// 5. Issue/Triage Workflow Presence
// ---------------------------------------------------------------------------

section('5. Issue/Triage Workflow Presence');

const triagePath = path.join(BETA_DIR, 'TRIAGE_LABELS.md');
if (!fs.existsSync(triagePath)) {
  fail('TRIAGE_LABELS.md does not exist');
} else {
  const lower = fs.readFileSync(triagePath, 'utf8').toLowerCase();
  const hasS0    = lower.includes('beta:s0');
  const hasS1    = lower.includes('beta:s1');
  const hasTriage = lower.includes('triage');
  if (hasS0 && hasS1 && hasTriage) {
    pass('TRIAGE_LABELS.md contains S0, S1 labels and triage rules');
  } else {
    if (!hasS0)     fail('TRIAGE_LABELS.md missing beta:s0 label');
    if (!hasS1)     fail('TRIAGE_LABELS.md missing beta:s1 label');
    if (!hasTriage) fail('TRIAGE_LABELS.md missing triage section');
  }
}

const issueTemplatesPath = path.join(BETA_DIR, 'ISSUE_TEMPLATES.md');
if (!fs.existsSync(issueTemplatesPath)) {
  fail('ISSUE_TEMPLATES.md does not exist');
} else {
  const lower = fs.readFileSync(issueTemplatesPath, 'utf8').toLowerCase();
  const hasBug     = lower.includes('bug report') || lower.includes('[bug]');
  const hasPrivacy = lower.includes('privacy');
  const hasBilling = lower.includes('billing');
  if (hasBug && hasPrivacy && hasBilling) {
    pass('ISSUE_TEMPLATES.md contains bug, privacy, and billing templates');
  } else {
    if (!hasBug)     fail('ISSUE_TEMPLATES.md missing bug report template');
    if (!hasPrivacy) fail('ISSUE_TEMPLATES.md missing privacy template');
    if (!hasBilling) fail('ISSUE_TEMPLATES.md missing billing template');
  }
}

// ---------------------------------------------------------------------------
// 6. API Key Scan
// ---------------------------------------------------------------------------

section('6. API Key Scan');

const API_KEY_PATTERN = /ppft_[0-9a-fA-F]{8,}/;
let secretFound = false;
for (const fp of existingRolloutDocs) {
  const text = fs.readFileSync(fp, 'utf8');
  if (API_KEY_PATTERN.test(text)) {
    fail(path.basename(fp) + ': contains raw ppft_ API key pattern');
    secretFound = true;
  }
}
if (!secretFound) {
  pass('No raw ppft_ API keys found in rollout docs');
}

// ---------------------------------------------------------------------------
// 7. INDEX.md Coverage
// ---------------------------------------------------------------------------

section('7. INDEX.md Coverage');

const indexPath = path.join(BETA_DIR, 'INDEX.md');
if (!fs.existsSync(indexPath)) {
  warn('INDEX.md not found -- cannot check link coverage');
} else {
  const indexText = fs.readFileSync(indexPath, 'utf8');
  let linked = 0;
  for (const doc of REQUIRED_ROLLOUT_DOCS) {
    if (indexText.includes(doc)) {
      info('INDEX.md links to ' + doc);
      linked++;
    } else {
      warn('INDEX.md may be missing link to ' + doc + ' (update INDEX.md in Phase 9)');
    }
  }
  if (linked === REQUIRED_ROLLOUT_DOCS.length) {
    pass('INDEX.md links to all ' + linked + ' rollout docs');
  } else {
    info(linked + '/' + REQUIRED_ROLLOUT_DOCS.length + ' rollout docs linked in INDEX.md');
  }
}

// ---------------------------------------------------------------------------
// 8. ASCII Compliance
// ---------------------------------------------------------------------------

section('8. ASCII Compliance');

let nonAsciiFound = false;
for (const fp of existingRolloutDocs) {
  const text = fs.readFileSync(fp, 'utf8');
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) {
      warn(path.basename(fp) + ': contains non-ASCII character at position ' + i +
        ' (char: ' + text[i] + ') -- acceptable for human-readable docs');
      nonAsciiFound = true;
      break;
    }
  }
}
if (!nonAsciiFound) {
  pass('All rollout docs are ASCII-clean');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('='.repeat(60) + '\n');
if (exitCode === 0) {
  process.stdout.write('[PASS] Internal beta rollout packet is complete and not overclaiming.\n');
  process.stdout.write('       Privacy warnings present. Rollback instructions present.\n');
  process.stdout.write('       Triage workflow present. No raw ppft_ keys.\n');
  process.stdout.write('       Distribute to internal testers only.\n');
  process.stdout.write('       Public release requires resolving documented blockers.\n');
} else {
  process.stderr.write('[FAIL] Internal beta rollout packet has issues. Resolve FAIL items.\n');
}
process.stdout.write('='.repeat(60) + '\n');

process.exit(exitCode);
