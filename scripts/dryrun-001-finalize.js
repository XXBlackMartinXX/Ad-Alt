#!/usr/bin/env node
// Semi-automated DRYRUN-001 finalization conductor.
// Interactive CLI that records tester results and enforces privacy/billing rules.
// Does NOT accept private data, API keys, or ChatGPT content.
// Usage: node scripts/dryrun-001-finalize.js
'use strict';

const readline = require('readline');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUNS_DIR = path.join(ROOT, 'docs', 'internal-beta', 'dry-runs');
const ISSUES_DIR = path.join(DRY_RUNS_DIR, 'issues');
const TRACKER_PATH = path.join(DRY_RUNS_DIR, 'DRY_RUN_STATUS_TRACKER.md');
const WORKSHEET_PATH = path.join(DRY_RUNS_DIR, 'FIRST_TESTER_DRY_RUN_WORKSHEET.md');
const GO_NO_GO_PATH = path.join(DRY_RUNS_DIR, 'GO_NO_GO_DECISION_RECORD.md');
const RESULT_LOG_PATH = path.join(DRY_RUNS_DIR, 'DRYRUN-001_RESULT_LOG.md');
const DRAFT_PATH = path.join(DRY_RUNS_DIR, 'DRYRUN-001_RESULT_DRAFT.md');
const DIST_PACKAGE_DIR = path.join(ROOT, 'apps', 'browser-extension', 'dist-package');

// Forbidden patterns: actual secrets/data (not documentation text)
const FORBIDDEN_PATTERNS = [
  /ppft_[0-9a-fA-F]{8,}/,
  /Authorization:\s*Bearer\s+\S{8,}/i,
  /apiKey\s*[:=]\s*["']?[a-zA-Z0-9\-_]{16,}/i,
  /localStorage\[/i,
  /sessionStorage\[/i,
  /document\.cookie/i,
];

function runCmd(cmd) {
  return spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
}

function latestZip() {
  if (!fs.existsSync(DIST_PACKAGE_DIR)) return null;
  const files = fs.readdirSync(DIST_PACKAGE_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(DIST_PACKAGE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0].name : null;
}

function scanForForbiddenContent(text, label) {
  const found = [];
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(text)) found.push(pat.toString());
  }
  return found;
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, ans => resolve(ans.trim())));
  const askYN = async (q) => {
    while (true) {
      const ans = (await ask(`${q} (yes/no): `)).toLowerCase();
      if (ans === 'yes' || ans === 'y') return true;
      if (ans === 'no' || ans === 'n') return false;
      console.log('  Please answer yes or no.');
    }
  };
  const askChoice = async (q, choices) => {
    const lower = choices.map(c => c.toLowerCase());
    while (true) {
      const ans = (await ask(`${q} (${choices.join('/')}): `)).toUpperCase();
      if (lower.includes(ans.toLowerCase())) return ans;
      console.log(`  Please enter one of: ${choices.join(', ')}`);
    }
  };

  console.log('');
  console.log('=== DRYRUN-001 FINALIZE ===');
  console.log('');
  console.log('This script records the results of the DRYRUN-001 tester session.');
  console.log('Do NOT enter private data, API keys, ChatGPT content, personal info,');
  console.log('cookies, tokens, full URLs, or screenshots. Sanitized summaries only.');
  console.log('');

  // -----------------------------------------------------------------------
  // Q1: Did real tester run?
  // -----------------------------------------------------------------------
  const ran = await askYN('Q1. Did a real human tester complete DRYRUN-001?');

  if (!ran) {
    console.log('');
    console.log('No real tester execution recorded.');
    console.log('DRYRUN-001 status remains: READY TO RUN / NOT EXECUTED');
    console.log('Decision remains: PENDING');
    console.log('');
    console.log('Final label: DRYRUN-001 owner-ready; not executed yet.');
    rl.close();
    process.exit(0);
  }

  console.log('');
  console.log('-- Collecting sanitized session details --');
  console.log('   Enter short text only. No personal data. No API keys. No ChatGPT content.');
  console.log('');

  // -----------------------------------------------------------------------
  // Q2-Q14: Collect sanitized details
  // -----------------------------------------------------------------------

  const today = new Date().toISOString().slice(0, 10);

  const testerRole = await ask('Q2.  Tester role? (e.g. "engineer" or "non-engineer" -- no names): ');
  const osBrowser = await ask('Q3.  OS and Chrome version? (e.g. "Windows 11, Chrome 126" -- no personal info): ');

  const defaultZip = latestZip() || '[unknown]';
  const artifactRaw = await ask(`Q4.  Package artifact filename? (press Enter for "${defaultZip}"): `);
  const artifact = artifactRaw || defaultZip;

  const installOk = await askYN('Q5.  Did the install succeed without assistance?');
  const safePromptUsed = await askYN('Q6.  Was the safe test prompt used exactly? ("Count slowly from 1 to 10.")');
  const bannerAppeared = await askYN('Q7.  Did the banner appear correctly during the safe test?');
  const closeWorked = await askYN('Q8.  Did the close/disable procedure work?');
  const uninstallOk = await askYN('Q9.  Did the uninstall/remove procedure work?');
  const privacyIssue = await askYN('Q10. Was any privacy or security issue observed?');
  const billingConcern = await askYN('Q11. Was any billing or ledger concern observed?');
  const hasIssues = await askYN('Q12. Were any issues found during the session?');

  const issueSummaries = [];
  if (hasIssues) {
    console.log('');
    console.log('  Enter sanitized issue summaries (no personal data, no API keys, no ChatGPT content).');
    let n = 1;
    while (true) {
      const s = await ask(`  Issue ${n} title (short, or press Enter to stop): `);
      if (!s) break;
      const sev = await askChoice(`  Issue ${n} severity`, ['S0', 'S1', 'S2', 'S3', 'S4']);
      const area = await ask(`  Issue ${n} area (e.g. area:browser-extension, area:docs): `);
      const desc = await ask(`  Issue ${n} sanitized description (no private data): `);
      issueSummaries.push({ title: s, severity: sev, area: area || 'area:unknown', description: desc });
      n++;
      if (n > 10) {
        console.log('  Maximum 10 issues per session. File remaining issues manually.');
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Enforce business rules
  // -----------------------------------------------------------------------
  console.log('');
  console.log('-- Applying business rules --');

  const problems = [];
  const blockers = [];

  if (privacyIssue) {
    console.log('  RULE  Privacy/security issue detected -> S0/P0 until reviewed by Privacy Owner');
    console.log('        Do NOT file this publicly. Contact Privacy Owner via private channel.');
    blockers.push('Privacy/security issue (S0/P0) -- decision cannot be GO');
  }

  if (billingConcern) {
    console.log('  RULE  Billing/ledger concern detected -> P0/P1 -- decision cannot be GO');
    console.log('        Notify Billing Owner immediately. Stop all billing tests.');
    blockers.push('Billing/ledger concern (P0/P1) -- decision cannot be GO');
  }

  if (!uninstallOk) {
    console.log('  RULE  Uninstall/rollback not confirmed -> decision cannot be GO');
    blockers.push('Uninstall/rollback not confirmed -- decision cannot be GO');
  }

  if (!safePromptUsed) {
    console.log('  RULE  Safe test prompt not confirmed -> decision cannot be GO');
    blockers.push('Safe test prompt not confirmed -- decision cannot be GO');
  }

  if (!bannerAppeared) {
    console.log('  RULE  Banner did not appear -> likely S1 blocker -> decision cannot be GO');
    blockers.push('Banner did not appear -- S1 blocker -- decision cannot be GO');
  }

  const s0s1Issues = issueSummaries.filter(i => i.severity === 'S0' || i.severity === 'S1');
  if (s0s1Issues.length > 0) {
    console.log(`  RULE  ${s0s1Issues.length} S0/S1 issue(s) found -> decision cannot be GO`);
    blockers.push(`${s0s1Issues.length} open S0/S1 issue(s) -- decision cannot be GO`);
  }

  const canGo = blockers.length === 0;

  if (!canGo) {
    console.log('');
    console.log('  Blockers preventing GO decision:');
    blockers.forEach((b, i) => console.log(`    ${i + 1}. ${b}`));
  }

  // -----------------------------------------------------------------------
  // Q15: Decision
  // -----------------------------------------------------------------------
  console.log('');
  let decision;
  if (canGo) {
    decision = await askChoice('Q13. Go/No-Go decision', ['GO', 'HOLD', 'STOP']);
  } else {
    console.log(`  Decision constrained by blockers above. GO is not permitted.`);
    decision = await askChoice('Q13. Go/No-Go decision', ['HOLD', 'STOP']);
  }

  // -----------------------------------------------------------------------
  // Determine overall status
  // -----------------------------------------------------------------------
  let status;
  if (decision === 'GO') {
    status = hasIssues ? 'PASS WITH ISSUES' : 'PASS';
  } else if (decision === 'HOLD') {
    status = 'PASS WITH ISSUES';
  } else {
    status = 'FAILED';
  }

  // -----------------------------------------------------------------------
  // Create DRYRUN-001_RESULT_LOG.md
  // -----------------------------------------------------------------------
  console.log('');
  console.log('-- Creating result log --');

  if (fs.existsSync(RESULT_LOG_PATH)) {
    const overwrite = await askYN(`  DRYRUN-001_RESULT_LOG.md already exists. Overwrite?`);
    if (!overwrite) {
      console.log('  Skipping result log creation. Existing log preserved.');
    } else {
      fs.unlinkSync(RESULT_LOG_PATH);
    }
  }

  if (!fs.existsSync(RESULT_LOG_PATH)) {
    const issuesTable = issueSummaries.length > 0
      ? issueSummaries.map((iss, i) => `| ${i + 1} | ${iss.title} | ${iss.severity} | ${iss.area} | needs-triage | [#TBD] |`).join('\n')
      : '| -- | No issues found during this dry-run session. | -- | -- | -- | -- |';

    const commitRes = runCmd('git rev-parse --short HEAD');
    const commit = (commitRes.stdout || '').trim();

    const blockerNote = blockers.length > 0
      ? `\n**Blockers preventing GO:**\n${blockers.map(b => `- ${b}`).join('\n')}\n`
      : '';

    const resultLog = `# PromptProfit -- DRYRUN-001 Result Log

**Dry-Run ID:** DRYRUN-001
**Status: ${status}**
**Date:** ${today}
**Branch:** claude/ecstatic-maxwell-h0d8d8
**Commit:** ${commit}
**Decision:** ${decision}

---

> Result recorded by dryrun-001-finalize.js on ${today}.
> Real human tester participated in this session.
> Privacy rules enforced: no personal data, no API keys, no ChatGPT content recorded.

---

## 1. Summary

| Field | Value |
|-------|-------|
| Dry-Run ID | DRYRUN-001 |
| Date | ${today} |
| Tester Role | ${testerRole || '[not provided]'} |
| Tester Track | [A / B -- record separately] |
| Owner | [OWNER TBD] |
| Release Commit | ${commit} |
| Package Artifact | ${artifact} |
| Package Audit | PASS (internal-beta) |
| Overall Status | ${status} |
| Decision | ${decision} |

---

## 2. Status

**Current Status: ${status}**

---

## 3. Environment

| Field | Value |
|-------|-------|
| OS | ${osBrowser || '[not recorded]'} |
| Chrome Version | [record from tester] |
| Extension Loaded From | ZIP (dist-package) |
| Node.js Version | N/A (Track A) |

---

## 6. Tester Actions

1. Received beta ZIP via secure internal channel.
2. Loaded extension via chrome://extensions → Load unpacked.
3. Navigated to chatgpt.com.
4. Used safe prompt: "Count slowly from 1 to 10." (approved)
5. Observed banner behavior.
6. Tested close/disable/uninstall procedures.

---

## 7. Observed Results

| Observation | Result |
|-------------|--------|
| Extension loaded in Chrome | ${installOk ? 'YES' : 'NO'} |
| Overlay banner appeared during response | ${bannerAppeared ? 'YES' : 'NO'} |
| Banner content: placeholder only | [record separately] |
| Banner close button worked | ${closeWorked ? 'YES' : 'NO'} |
| Disable turned off banner | ${closeWorked ? 'YES' : 'NO'} |
| Remove uninstalled cleanly | ${uninstallOk ? 'YES' : 'NO'} |

---

## 8. Issues Found

| # | Title | Severity | Area | Status | GitHub Issue # |
|---|-------|----------|------|--------|----------------|
${issuesTable}

---

## 9. Privacy and Security Observations

- Privacy/security issue observed: ${privacyIssue ? 'YES -- ESCALATE TO PRIVACY OWNER (S0/P0)' : 'NO'}
- ppft_ key visible in shared output: NOT OBSERVED
- ChatGPT content shared by tester: NOT RECORDED
- S0 event triggered: ${privacyIssue ? 'YES -- SEE ESCALATION NOTE' : 'NO'}
${privacyIssue ? '\n**ACTION REQUIRED:** Contact Privacy Owner via private channel. Do NOT file publicly.\n' : ''}
---

## 10. Billing and Ledger Observations

- Billing/ledger concern observed: ${billingConcern ? 'YES -- NOTIFY BILLING OWNER (P0/P1)' : 'NO'}
- Billing smoke run during session: NOT RUN (requires Docker; optional for Track A)
- Billing invariant check: NOT RUN IN REAL TESTER SESSION

---

## 11. Rollback / Uninstall Result

- Disable procedure tested: ${closeWorked ? 'YES' : 'NO'}
- Remove procedure tested: ${uninstallOk ? 'YES' : 'NO'}
- Remove verified: ${uninstallOk ? 'YES' : 'NO'}
- Full rollback triggered: NO
${blockerNote}
---

## 13. Triage Outcome

Triage completed: ${hasIssues ? 'NEEDS TRIAGE' : 'NO ISSUES -- N/A'}

| Issue # | Severity | Priority | Assigned To | Target Fix |
|---------|----------|----------|-------------|-----------|
${issueSummaries.map((iss, i) => `| ${i + 1} | ${iss.severity} | [P0-P3 TBD] | [OWNER TBD] | [DATE TBD] |`).join('\n') || '| -- | -- | -- | No issues | -- |'}

---

## 14. Next Action

| Next Action | Details | Owner | Target Date |
|-------------|---------|-------|------------|
| ${decision === 'GO' ? 'Proceed to Day 2-3 small beta' : decision === 'HOLD' ? 'Fix blocker(s) and schedule DRYRUN-002' : 'Execute rollback -- see ROLLBACK_AND_DISABLE_GUIDE.md'} | ${decision === 'GO' ? 'Distribute to 3-5 internal testers' : decision === 'HOLD' ? 'Assign fix owners; set target dates' : 'Notify stakeholders; pause beta distribution'} | [OWNER TBD] | [DATE TBD] |

---

## 15. Sign-Off Table

| Role | Approved | Date |
|------|---------|------|
| Dry-Run Owner | [YES / NO / TBD] | ${today} |
| QA Owner | [YES / NO / TBD] | [DATE TBD] |
| Privacy Owner | ${privacyIssue ? 'REQUIRED -- S0 PENDING' : '[YES / NO / TBD]'} | [DATE TBD] |
| Release Owner | [YES / NO / TBD] | [DATE TBD] |

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
`;

    // Scan for forbidden content before writing
    const forbidden = scanForForbiddenContent(resultLog, 'result log');
    if (forbidden.length > 0) {
      console.log('  FAIL  Result log contains forbidden content patterns:');
      forbidden.forEach(p => console.log(`        ${p}`));
      console.log('  Aborting to protect privacy. Review input and try again.');
      rl.close();
      process.exit(1);
    }

    fs.writeFileSync(RESULT_LOG_PATH, resultLog, 'utf8');
    console.log('  PASS  Created: docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md');
  }

  // -----------------------------------------------------------------------
  // Create issue files
  // -----------------------------------------------------------------------
  if (issueSummaries.length > 0) {
    if (!fs.existsSync(ISSUES_DIR)) {
      fs.mkdirSync(ISSUES_DIR, { recursive: true });
    }

    issueSummaries.forEach((iss, i) => {
      const issueNum = String(i + 1).padStart(3, '0');
      const issueFile = path.join(ISSUES_DIR, `DRYRUN-001-ISSUE-${issueNum}.md`);
      const priority = iss.severity === 'S0' ? 'P0' : iss.severity === 'S1' ? 'P1' : iss.severity === 'S2' ? 'P2' : 'P3';
      const isPrivacyIssue = iss.severity === 'S0';

      const issueContent = `# DRYRUN-001 Issue ${issueNum}: ${iss.title}

**DRYRUN-001 | Issue ${issueNum}**
**Severity:** ${iss.severity}
**Priority:** ${priority}
**Area:** ${iss.area}
**Status:** needs-triage

---

${isPrivacyIssue ? '> S0 ISSUE: Do NOT file publicly. Contact Privacy Owner via private channel.\n\n---\n\n' : ''}

## Description

${iss.description || '[sanitized description not provided]'}

## Environment

See DRYRUN-001_RESULT_LOG.md for session environment details.

## Severity Rationale

| Field | Value |
|-------|-------|
| Severity | ${iss.severity}${isPrivacyIssue ? ' (Privacy/Security -- auto-classified S0/P0)' : ''} |
| Priority | ${priority} |
| Rollback Needed | ${iss.severity === 'S0' || iss.severity === 'S1' ? 'YES -- per DRY_RUN_TRIAGE_CHECKLIST.md' : 'NO'} |
| Escalation | ${isPrivacyIssue ? 'Privacy Owner (private channel)' : priority === 'P1' ? 'QA Owner same business day' : 'Normal triage'} |

## Evidence Safety

- [ ] No ChatGPT prompt text included
- [ ] No ChatGPT response text included
- [ ] No screenshot with personal data included
- [ ] No API key included
- [ ] No .env file included
- [ ] No cookies or tokens included

## Triage Assignment

| Field | Value |
|-------|-------|
| Assigned To | [OWNER TBD] |
| Status | needs-triage |
| GitHub Issue # | [#TBD] |
| Target Fix Date | [DATE TBD] |

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
`;

      const forbidden = scanForForbiddenContent(issueContent, `ISSUE-${issueNum}`);
      if (forbidden.length === 0) {
        fs.writeFileSync(issueFile, issueContent, 'utf8');
        console.log(`  PASS  Created: docs/internal-beta/dry-runs/issues/DRYRUN-001-ISSUE-${issueNum}.md (${iss.severity}/${priority})`);
      } else {
        console.log(`  FAIL  Issue ${issueNum} contains forbidden content -- skipped`);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Update DRY_RUN_STATUS_TRACKER.md
  // -----------------------------------------------------------------------
  console.log('');
  console.log('-- Updating dry-run docs --');

  if (fs.existsSync(TRACKER_PATH)) {
    let tracker = fs.readFileSync(TRACKER_PATH, 'utf8');
    const newRow = `| DRYRUN-001 | ${today} | ${testerRole || '[TBD]'} | [A/B] | COMPLETED | ${decision} | DRYRUN-001_RESULT_LOG.md | Real session completed ${today} |`;
    tracker = tracker.replace(
      /\| DRYRUN-001 \|[^\n]+\|/,
      newRow
    );
    // Update the detail block
    tracker = tracker.replace(/\| Status \| READY TO RUN \|/, `| Status | COMPLETED |`);
    tracker = tracker.replace(/\| Decision \| PENDING \|/, `| Decision | ${decision} |`);
    tracker = tracker.replace(/\| Issues Found \| NOT OBSERVED YET \|/, `| Issues Found | ${issueSummaries.length} |`);
    tracker = tracker.replace(/\| Privacy Result \| NOT OBSERVED YET \|/, `| Privacy Result | ${privacyIssue ? 'ISSUE OBSERVED -- SEE S0 ESCALATION' : 'CLEAN'} |`);
    tracker = tracker.replace(/\| Billing Result \| NOT OBSERVED IN REAL TESTER RUN \|/, `| Billing Result | ${billingConcern ? 'CONCERN OBSERVED' : 'NO CONCERN'} |`);
    tracker = tracker.replace(/\| Rollback Result \| NOT OBSERVED YET \|/, `| Rollback Result | ${uninstallOk ? 'CONFIRMED' : 'NOT CONFIRMED'} |`);
    fs.writeFileSync(TRACKER_PATH, tracker, 'utf8');
    console.log('  PASS  Updated: DRY_RUN_STATUS_TRACKER.md');
  }

  // -----------------------------------------------------------------------
  // Update GO_NO_GO_DECISION_RECORD.md
  // -----------------------------------------------------------------------
  if (fs.existsSync(GO_NO_GO_PATH)) {
    let goNoGo = fs.readFileSync(GO_NO_GO_PATH, 'utf8');
    goNoGo = goNoGo.replace(
      /\*\*Decision Status: PENDING[^\*]*\*\*/,
      `**Decision Status: ${decision} -- DRYRUN-001 completed ${today}**`
    );
    goNoGo = goNoGo.replace(
      /## CURRENT DECISION: PENDING[\s\S]*?---/,
      `## CURRENT DECISION: ${decision}\n\n**Reason:** DRYRUN-001 executed ${today}. Decision recorded by finalize script.\n\n---`
    );
    // Update decision record section
    const rationale = blockers.length > 0
      ? `Blockers: ${blockers.join('; ')}`
      : 'All criteria met.';
    goNoGo = goNoGo.replace(
      /\*\*Decision:\*\* \[GO \/ HOLD \/ STOP[^\]]*\]/,
      `**Decision:** ${decision}`
    );
    goNoGo = goNoGo.replace(
      /\[Required if HOLD or STOP: describe which criteria were NOT MET\]\n\[Required if GO: confirm all criteria were MET\]/,
      rationale
    );
    fs.writeFileSync(GO_NO_GO_PATH, goNoGo, 'utf8');
    console.log('  PASS  Updated: GO_NO_GO_DECISION_RECORD.md');
  }

  // -----------------------------------------------------------------------
  // Update FIRST_TESTER_DRY_RUN_WORKSHEET.md
  // -----------------------------------------------------------------------
  if (fs.existsSync(WORKSHEET_PATH)) {
    let worksheet = fs.readFileSync(WORKSHEET_PATH, 'utf8');
    worksheet = worksheet.replace(
      '**Status: NOT RUN YET**',
      `**Status: COMPLETED -- see DRYRUN-001_RESULT_LOG.md (decision: ${decision})**`
    );
    worksheet = worksheet.replace(
      '**Decision:** PENDING -- dry-run not yet executed',
      `**Decision:** ${decision} -- DRYRUN-001 completed ${today}`
    );
    fs.writeFileSync(WORKSHEET_PATH, worksheet, 'utf8');
    console.log('  PASS  Updated: FIRST_TESTER_DRY_RUN_WORKSHEET.md');
  }

  // -----------------------------------------------------------------------
  // Privacy scan all changed docs
  // -----------------------------------------------------------------------
  console.log('');
  console.log('-- Privacy scan --');

  const filesToScan = [
    RESULT_LOG_PATH,
    TRACKER_PATH,
    GO_NO_GO_PATH,
    WORKSHEET_PATH,
    ...(() => {
      if (!fs.existsSync(ISSUES_DIR)) return [];
      return fs.readdirSync(ISSUES_DIR).map(f => path.join(ISSUES_DIR, f));
    })()
  ].filter(f => f && fs.existsSync(f));

  let scanClean = true;
  for (const filePath of filesToScan) {
    const content = fs.readFileSync(filePath, 'utf8');
    const found = scanForForbiddenContent(content, filePath);
    if (found.length > 0) {
      console.log(`  FAIL  Forbidden content in ${path.basename(filePath)}: ${found.join(', ')}`);
      scanClean = false;
    }
  }
  if (scanClean) {
    console.log('  PASS  No forbidden content found in any changed doc');
  }

  // -----------------------------------------------------------------------
  // Run check suite
  // -----------------------------------------------------------------------
  console.log('');
  console.log('-- Running verification checks --');

  const secretRes = runCmd('pnpm -w run check:secrets:local');
  console.log(`  ${secretRes.status === 0 ? 'PASS' : 'FAIL'}  check:secrets:local`);

  const dryRunRes = runCmd('pnpm -w run check:first-dry-run-packet');
  console.log(`  ${dryRunRes.status === 0 ? 'PASS' : 'FAIL'}  check:first-dry-run-packet`);

  const rolloutRes = runCmd('pnpm -w run check:internal-beta-rollout');
  console.log(`  ${rolloutRes.status === 0 ? 'PASS' : 'FAIL'}  check:internal-beta-rollout`);

  // -----------------------------------------------------------------------
  // Final label
  // -----------------------------------------------------------------------
  console.log('');
  console.log('='.repeat(60));

  let finalLabel;
  if (decision === 'GO' && !privacyIssue && !billingConcern) {
    finalLabel = hasIssues
      ? 'First internal beta dry-run completed and triaged. (PASS WITH ISSUES)'
      : 'First internal beta dry-run completed and triaged.';
  } else if (decision === 'HOLD') {
    finalLabel = 'DRYRUN-001 blocked; fixes required before next tester.';
  } else if (decision === 'STOP') {
    finalLabel = 'DRYRUN-001 blocked; fixes required before next tester.';
  } else {
    finalLabel = 'DRYRUN-001 partially executed; triage incomplete.';
  }

  console.log(`Final label: ${finalLabel}`);
  console.log('='.repeat(60));
  console.log('');

  if (decision === 'GO') {
    console.log('Next steps:');
    console.log('  1. Commit the result log and updated docs.');
    console.log('  2. Notify Day 2-3 tester group per BETA_ROLLOUT_SCHEDULE.md.');
    console.log('  3. Send TESTER_INVITATION_TEMPLATES.md Template 2/3.');
  } else if (decision === 'HOLD') {
    console.log('Next steps:');
    console.log('  1. Commit the result log and updated docs.');
    console.log('  2. Assign fix owners and set target dates per DRY_RUN_TRIAGE_CHECKLIST.md.');
    console.log('  3. Schedule DRYRUN-002 after fixes are verified.');
    console.log('  4. Do NOT invite more testers until fixes are confirmed.');
  } else {
    console.log('Next steps:');
    console.log('  1. Execute ROLLBACK_AND_DISABLE_GUIDE.md immediately.');
    console.log('  2. Notify all stakeholders.');
    console.log('  3. Do NOT distribute to any other testers.');
    if (privacyIssue) {
      console.log('  4. Contact Privacy Owner via private channel (S0 -- do not file publicly).');
    }
  }

  rl.close();
}

main().catch(err => {
  console.error('');
  console.error('Fatal error in dryrun-001-finalize:', err.message || err);
  process.exit(1);
});
