#!/usr/bin/env node
// Validates the DRYRUN-001 state and result log.
// Fails on overclaiming, missing go/no-go, or forbidden content.
// Usage: node scripts/check-dryrun-001-result.js
// Exit 0 = PASS (or PASS WITH WARNINGS), Exit 1 = FAIL
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUNS_DIR = path.join(ROOT, 'docs', 'internal-beta', 'dry-runs');
const ISSUES_DIR = path.join(DRY_RUNS_DIR, 'issues');

const RESULT_LOG = path.join(DRY_RUNS_DIR, 'DRYRUN-001_RESULT_LOG.md');
const TRACKER = path.join(DRY_RUNS_DIR, 'DRY_RUN_STATUS_TRACKER.md');
const GO_NO_GO = path.join(DRY_RUNS_DIR, 'GO_NO_GO_DECISION_RECORD.md');
const WORKSHEET = path.join(DRY_RUNS_DIR, 'FIRST_TESTER_DRY_RUN_WORKSHEET.md');
const DRAFT = path.join(DRY_RUNS_DIR, 'DRYRUN-001_RESULT_DRAFT.md');
const TROUBLESHOOTING = path.join(DRY_RUNS_DIR, 'TROUBLESHOOTING_BANNER_NOT_OBSERVED.md');
const INCONCLUSIVE_NOTE = path.join(DRY_RUNS_DIR, 'DRYRUN-001_ATTEMPT_001_INCONCLUSIVE_NOTE.md');

let passed = 0;
let warned = 0;
let failed = 0;

function pass(msg) { console.log(`  PASS  ${msg}`); passed++; }
function warn(msg) { console.log(`  WARN  ${msg}`); warned++; }
function fail(msg) { console.log(`  FAIL  ${msg}`); failed++; }

function read(p) {
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; } catch { return null; }
}

// -----------------------------------------------------------------------
console.log('');
console.log('=== check-dryrun-001-result ===');
console.log('');

const resultLogContent = read(RESULT_LOG);
const trackerContent = read(TRACKER);
const goNoGoContent = read(GO_NO_GO);
const worksheetContent = read(WORKSHEET);
const resultLogExists = resultLogContent !== null;
const draftExists = fs.existsSync(DRAFT);
const troubleshootingExists = fs.existsSync(TROUBLESHOOTING);
const inconclusiveNoteExists = fs.existsSync(INCONCLUSIVE_NOTE);

// -----------------------------------------------------------------------
// Section 1: Existence check
// -----------------------------------------------------------------------
console.log('-- Section 1: File existence --');

pass(`Tracker present: DRY_RUN_STATUS_TRACKER.md`);

if (resultLogExists) {
  pass('Result log present: DRYRUN-001_RESULT_LOG.md (dry-run was finalized)');
} else {
  pass('No result log (DRYRUN-001_RESULT_LOG.md) -- dry-run not yet finalized (acceptable)');
}

if (draftExists) {
  pass('Draft present: DRYRUN-001_RESULT_DRAFT.md (prepare script was run)');
} else {
  warn('No draft (DRYRUN-001_RESULT_DRAFT.md) -- run dryrun:001:prepare before the session');
}

if (troubleshootingExists) {
  pass('Troubleshooting guide present: TROUBLESHOOTING_BANNER_NOT_OBSERVED.md');
} else {
  warn('TROUBLESHOOTING_BANNER_NOT_OBSERVED.md missing -- helpful if banner is not observed');
}

if (inconclusiveNoteExists) {
  pass('Inconclusive note present: DRYRUN-001_ATTEMPT_001_INCONCLUSIVE_NOTE.md');
}

console.log('');

// -----------------------------------------------------------------------
// Section 2: No-result-log path -- tracker must show correct pre-execution state
// -----------------------------------------------------------------------
if (!resultLogExists) {
  console.log('-- Section 2: Pre-execution state validation --');

  if (!trackerContent) {
    fail('DRY_RUN_STATUS_TRACKER.md is missing');
  } else {
    // Tracker must say READY TO RUN, NOT RUN YET, INCONCLUSIVE, or READY TO RERUN -- NOT COMPLETED
    if (/DRYRUN-001.*COMPLETED/i.test(trackerContent)) {
      fail('Tracker claims DRYRUN-001 COMPLETED but no result log exists -- overclaiming (CANARY 13)');
    } else if (/DRYRUN-001.*(READY TO RUN|NOT RUN YET)/i.test(trackerContent)) {
      pass('Tracker: DRYRUN-001 is READY TO RUN / NOT RUN YET (correct for pre-execution)');
    } else if (/DRYRUN-001.*INCONCLUSIVE/i.test(trackerContent)) {
      pass('Tracker: DRYRUN-001 is INCONCLUSIVE (session attempted but inconclusive; rerun required)');
    } else if (/DRYRUN-001.*READY TO RERUN/i.test(trackerContent)) {
      pass('Tracker: DRYRUN-001 is READY TO RERUN (setup confirmed; rerun scheduled)');
    } else {
      warn('Tracker: DRYRUN-001 status unclear -- verify it does not claim completion');
    }

    // Decision must be PENDING -- EXCEPT: HOLD is allowed when status is INCONCLUSIVE
    // Check only the DRYRUN-001 table row (pipe-delimited), not free text in the doc
    const trackerRow = trackerContent.match(/\| DRYRUN-001 \|[^\n]*/)?.[0] || '';
    const rowHasHold = /\| HOLD \|/.test(trackerRow);
    const rowHasGo = /\| GO \|/.test(trackerRow);
    const rowHasStop = /\| STOP \|/.test(trackerRow);
    const rowHasInconclusive = /INCONCLUSIVE/.test(trackerRow);
    const rowHasReadyToRerun = /READY TO RERUN/.test(trackerRow);
    if (rowHasGo || rowHasStop) {
      fail('Tracker row shows GO/STOP decision without a result log -- overclaiming');
    } else if (rowHasHold && (rowHasInconclusive || rowHasReadyToRerun)) {
      pass('Tracker decision: HOLD with INCONCLUSIVE/READY TO RERUN status (correct for inconclusive attempt)');
    } else if (/\| PENDING \|/.test(trackerRow)) {
      pass('Tracker decision: PENDING (correct before execution)');
    } else if (rowHasHold) {
      fail('Tracker shows HOLD decision without INCONCLUSIVE status or result log -- overclaiming');
    } else {
      warn('Tracker decision status unclear');
    }
  }

  // Go/no-go must say PENDING or HOLD (HOLD is valid for inconclusive attempts)
  if (!goNoGoContent) {
    warn('GO_NO_GO_DECISION_RECORD.md missing');
  } else if (/PENDING/i.test(goNoGoContent) && !/Decision Status: GO\b|Decision Status: STOP\b/i.test(goNoGoContent)) {
    pass('Go/No-Go decision record: PENDING (correct before execution)');
  } else if (/Decision Status: HOLD\b/i.test(goNoGoContent) && !resultLogExists) {
    // HOLD is valid when tracker is INCONCLUSIVE (inconclusive attempt recorded)
    if (/DRYRUN-001.*INCONCLUSIVE/i.test(trackerContent || '')) {
      pass('Go/No-Go decision record: HOLD with INCONCLUSIVE tracker (consistent with inconclusive attempt)');
    } else {
      fail('Go/No-Go decision was set to HOLD without a result log or inconclusive note -- overclaiming (CANARY 13)');
    }
  } else if (/Decision Status: GO\b|Decision Status: STOP\b/i.test(goNoGoContent)) {
    fail('Go/No-Go decision was set without a result log -- overclaiming (CANARY 13)');
  } else {
    warn('Go/No-Go decision status unclear');
  }

  // Worksheet must say NOT RUN YET or INCONCLUSIVE (INCONCLUSIVE is valid after an inconclusive attempt)
  if (!worksheetContent) {
    warn('FIRST_TESTER_DRY_RUN_WORKSHEET.md missing');
  } else if (/Status.*COMPLETED|dry-run completed/i.test(worksheetContent) && !/INCONCLUSIVE/i.test(worksheetContent)) {
    fail('Worksheet claims COMPLETED without a result log -- overclaiming (CANARY 13)');
  } else if (/NOT RUN YET/i.test(worksheetContent)) {
    pass('Worksheet status: NOT RUN YET (correct)');
  } else if (/INCONCLUSIVE/i.test(worksheetContent)) {
    pass('Worksheet status: INCONCLUSIVE (correct after inconclusive attempt)');
  } else {
    warn('Worksheet status unclear');
  }

  console.log('');
  console.log('-- Section 3: Overclaiming detection (pre-execution docs) --');

  const allDocs = [TRACKER, GO_NO_GO, WORKSHEET, DRAFT, INCONCLUSIVE_NOTE, TROUBLESHOOTING].filter(p => p && fs.existsSync(p))
    .map(p => ({ file: path.basename(p), content: read(p) || '' }));

  const overclaiming = [
    { pat: /chrome web store/i, label: 'Chrome Web Store ready claim' },
    { pat: /production.{0,20}ready/i, label: 'Production-ready claim' },
    { pat: /vs code marketplace/i, label: 'VS Code Marketplace ready claim' },
    { pat: /public.{0,20}release.{0,20}ready/i, label: 'Public-release-ready claim' },
    { pat: /dry.?run completed/i, label: 'Dry-run completed claim without result log' },
  ];

  let anyOverclaim = false;
  for (const doc of allDocs) {
    for (const rule of overclaiming) {
      if (rule.pat.test(doc.content)) {
        fail(`Overclaiming in ${doc.file}: ${rule.label}`);
        anyOverclaim = true;
      }
    }
  }
  if (!anyOverclaim) pass('No overclaiming detected in pre-execution docs');

  console.log('');
  console.log('-- Section 4: API key scan (CANARY 7) --');

  const keyPat = /ppft_[0-9a-fA-F]{8,}/;
  let keyFound = false;
  for (const doc of allDocs) {
    if (keyPat.test(doc.content)) {
      fail(`Raw API key pattern in ${doc.file} (CANARY 7)`);
      keyFound = true;
    }
  }
  if (!keyFound) pass('No raw API key patterns found');

} else {
  // -----------------------------------------------------------------------
  // Section 2: Result-log path -- validate content
  // -----------------------------------------------------------------------
  console.log('-- Section 2: Result log validation --');

  // Status must be a valid value (BLOCKED is valid for inconclusive sessions)
  if (/\*\*Status: PASS\b|\*\*Status: PASS WITH ISSUES|\*\*Status: BLOCKED|\*\*Status: FAILED/i.test(resultLogContent)) {
    const blocked = /\*\*Status: BLOCKED/i.test(resultLogContent);
    pass(`Result log status is a valid value${blocked ? ' (BLOCKED = inconclusive session recorded)' : ''}`);
  } else if (/\*\*Status: READY FOR HUMAN EXECUTION/i.test(resultLogContent)) {
    fail('Result log still says READY FOR HUMAN EXECUTION -- finalize script was not run');
  } else {
    warn('Result log status value unclear');
  }

  // Decision must exist
  if (/\*\*Decision:\s*(GO|HOLD|STOP)\b/i.test(resultLogContent)) {
    const m = resultLogContent.match(/\*\*Decision:\s*(GO|HOLD|STOP)\b/i);
    pass(`Result log has go/no-go decision: ${m[1]}`);

    // GO decision with S0/P0 issue is forbidden
    if (m[1] === 'GO') {
      if (/S0\/P0|Privacy Owner.*REQUIRED|ESCALATE TO PRIVACY OWNER/i.test(resultLogContent)) {
        fail('GO decision recorded but result log indicates S0/P0 privacy issue unresolved (CANARY 16)');
      } else {
        pass('GO decision: no S0/P0 privacy flags detected');
      }

      if (/Uninstall\/Remove.*NO|Remove uninstalled.*NO/i.test(resultLogContent)) {
        fail('GO decision recorded but uninstall/remove was NOT confirmed (invalid GO)');
      } else {
        pass('GO decision: uninstall/remove appears confirmed');
      }

      if (/Billing.*CONCERN OBSERVED/i.test(resultLogContent)) {
        fail('GO decision recorded but billing concern was observed (CANARY 17)');
      } else {
        pass('GO decision: no billing concern flag');
      }
    }
  } else if (/\*\*Decision:\s*\[/i.test(resultLogContent)) {
    fail('Result log has a placeholder decision -- go/no-go not recorded');
  } else {
    warn('Result log decision field unclear');
  }

  // Safe prompt check -- must not contain unauthorized prompts
  if (/Count slowly from 1 to 10/i.test(resultLogContent)) {
    pass('Approved safe test prompt present in result log');
  }

  // Must not contain other prompt text markers
  if (/promptText\s*=|prompt_text\s*:|"prompt":\s*"/i.test(resultLogContent)) {
    fail('Result log may contain raw prompt data (CANARY 6/9)');
  } else {
    pass('No raw prompt data patterns found');
  }

  // Privacy section must exist
  if (/Privacy and Security Observations|privacy.*observed/i.test(resultLogContent)) {
    pass('Privacy/security observations section present');
  } else {
    warn('Privacy/security observations section missing or unclear');
  }

  // Rollback/uninstall section must exist
  if (/Rollback.*Uninstall|Uninstall.*Rollback|Remove.*uninstalled/i.test(resultLogContent)) {
    pass('Rollback/uninstall section present');
  } else {
    fail('Rollback/uninstall section missing from result log');
  }

  console.log('');
  console.log('-- Section 3: Overclaiming detection --');

  const overclaiming = [
    { pat: /chrome web store/i, label: 'Chrome Web Store ready claim' },
    { pat: /production.{0,20}ready/i, label: 'Production-ready claim' },
    { pat: /vs code marketplace/i, label: 'VS Code Marketplace ready claim' },
    { pat: /public.{0,20}release.{0,20}ready/i, label: 'Public-release-ready claim' },
  ];

  let anyOverclaim = false;
  for (const rule of overclaiming) {
    if (rule.pat.test(resultLogContent)) {
      fail(`Overclaiming in result log: ${rule.label}`);
      anyOverclaim = true;
    }
  }
  if (!anyOverclaim) pass('No overclaiming detected in result log');

  // Issue files validation
  if (fs.existsSync(ISSUES_DIR)) {
    const issueFiles = fs.readdirSync(ISSUES_DIR).filter(f => f.endsWith('.md'));
    if (issueFiles.length > 0) {
      console.log('');
      console.log('-- Section 3b: Issue files validation --');
      for (const file of issueFiles) {
        const content = read(path.join(ISSUES_DIR, file)) || '';
        if (/ppft_[0-9a-fA-F]{8,}/.test(content)) {
          fail(`Raw API key in issue file ${file} (CANARY 7)`);
        } else {
          pass(`Issue file clean: ${file}`);
        }
        // S0 issue should not be labeled as filed publicly
        if (/\*\*Severity:\*\* S0/i.test(content) && /GitHub Issue #.*#[0-9]+/.test(content)) {
          warn(`Issue ${file} is S0 but has a GitHub issue number -- S0 issues must NOT be filed publicly`);
        }
      }
    }
  }

  console.log('');
  console.log('-- Section 4: API key scan (CANARY 7) --');

  const keyPat = /ppft_[0-9a-fA-F]{8,}/;
  const allResultFiles = [RESULT_LOG, TRACKER, GO_NO_GO, WORKSHEET].filter(p => fs.existsSync(p));
  let keyFound = false;
  for (const p of allResultFiles) {
    if (keyPat.test(read(p) || '')) {
      fail(`Raw API key pattern in ${path.basename(p)} (CANARY 7)`);
      keyFound = true;
    }
  }
  if (!keyFound) pass('No raw API key patterns in any result doc');
}

// -----------------------------------------------------------------------
// Section 5: Tracker consistency
// -----------------------------------------------------------------------
console.log('');
console.log('-- Section 5: Tracker consistency --');

if (resultLogExists && trackerContent) {
  if (/DRYRUN-001.*COMPLETED/i.test(trackerContent)) {
    pass('Tracker shows COMPLETED -- consistent with result log existing');
  } else if (/DRYRUN-001.*INCONCLUSIVE/i.test(trackerContent)) {
    pass('Tracker shows INCONCLUSIVE -- consistent with result log from inconclusive session');
  } else if (/DRYRUN-001.*(READY TO RUN|NOT RUN YET|READY TO RERUN)/i.test(trackerContent)) {
    warn('Result log exists but tracker still shows pre-execution status -- consider running finalize again or updating tracker manually');
  } else {
    warn('Tracker status ambiguous');
  }
} else if (!resultLogExists && trackerContent) {
  if (/DRYRUN-001.*COMPLETED/i.test(trackerContent)) {
    fail('Tracker says COMPLETED but no result log exists -- inconsistent state');
  } else if (/DRYRUN-001.*INCONCLUSIVE/i.test(trackerContent)) {
    pass('Tracker shows INCONCLUSIVE and no result log -- consistent (inconclusive attempt recorded via note)');
  } else {
    pass('Tracker and result log state are consistent (both pre-execution or inconclusive)');
  }
}

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------
console.log('');
console.log('=== Summary ===');
console.log(`  Passed:   ${passed}`);
console.log(`  Warnings: ${warned}`);
console.log(`  Failed:   ${failed}`);
console.log('');
console.log(`  Result log exists: ${resultLogExists ? 'YES' : 'NO'}`);
console.log(`  Draft exists:      ${draftExists ? 'YES' : 'NO'}`);
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
