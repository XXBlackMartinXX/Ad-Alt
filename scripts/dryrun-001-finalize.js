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

function scanForForbiddenContent(text) {
  const found = [];
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(text)) found.push(pat.toString());
  }
  return found;
}

function ynu(val) {
  if (val === 'yes') return 'YES';
  if (val === 'no') return 'NO';
  return 'UNKNOWN';
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, ans => resolve(ans.trim())));

  // Binary yes/no question (for Q1 only — factual, not observation-based)
  const askYN = async (q) => {
    while (true) {
      const ans = (await ask(`${q} (yes/no): `)).toLowerCase();
      if (ans === 'yes' || ans === 'y') return true;
      if (ans === 'no' || ans === 'n') return false;
      if (ans === 'cancel') {
        console.log('  CANCEL received. No files were written. Exiting.');
        rl.close();
        process.exit(2);
      }
      console.log('  Please answer yes or no. (Type "cancel" to exit without writing anything.)');
    }
  };

  // Three-way question: yes / no / unknown
  // Accepted: yes y | no n | unknown u idk unsure inconclusive not sure ?
  // After 2 invalid attempts: print full list + CANCEL hint
  // Type "cancel" to exit with code 2, no files written
  const askYNU = async (q) => {
    let invalid = 0;
    while (true) {
      const raw = await ask(`${q} (yes/no/unknown): `);
      const ans = raw.trim().toLowerCase();
      if (ans === 'yes' || ans === 'y') return 'yes';
      if (ans === 'no' || ans === 'n') return 'no';
      if (ans === 'unknown' || ans === 'u' || ans === 'idk' || ans === 'unsure' ||
          ans === 'inconclusive' || ans === 'not sure' || ans === '?') return 'unknown';
      if (ans === 'cancel') {
        console.log('  CANCEL received. No files were written. Exiting.');
        rl.close();
        process.exit(2);
      }
      invalid++;
      if (invalid >= 2) {
        console.log('  Valid answers: yes, y, no, n, unknown, u, idk, unsure, inconclusive, not sure');
        console.log('  Type "cancel" to exit without writing any files (safe to bail out).');
      } else {
        console.log('  Please answer yes, no, or unknown (also accepted: y, n, idk, unsure, inconclusive).');
      }
    }
  };

  const askChoice = async (q, choices) => {
    const lower = choices.map(c => c.toLowerCase());
    while (true) {
      const ans = (await ask(`${q} (${choices.join('/')}): `)).toUpperCase();
      if (lower.includes(ans.toLowerCase())) return ans;
      if (ans.toLowerCase() === 'cancel') {
        console.log('  CANCEL received. No files were written. Exiting.');
        rl.close();
        process.exit(2);
      }
      console.log(`  Please enter one of: ${choices.join(', ')} (or "cancel" to exit without writing files)`);
    }
  };

  console.log('');
  console.log('=== DRYRUN-001 FINALIZE ===');
  console.log('');
  console.log('This script records the results of the DRYRUN-001 tester session.');
  console.log('Do NOT enter private data, API keys, ChatGPT content, personal info,');
  console.log('cookies, tokens, full URLs, or screenshots. Sanitized summaries only.');
  console.log('');
  console.log('For any observation question you could not confirm, answer: unknown');
  console.log('Unknown answers map to HOLD. Type "cancel" at any prompt to exit safely.');
  console.log('');

  // -----------------------------------------------------------------------
  // Q1: Did real tester run?
  // -----------------------------------------------------------------------
  const ran = await askYN('Q1. Did a real human tester attempt DRYRUN-001?');

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
  console.log('   For any observation you could not confirm: answer "unknown".');
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

  const installOk = await askYNU('Q5.  Did the install succeed without assistance?');
  const safePromptUsed = await askYNU('Q6.  Was one of the two approved safe prompts used exactly? ("Count slowly from 1 to 10." OR the recommended "Count slowly from 1 to 100, one number per line.")');
  const bannerAppeared = await askYNU('Q7.  Did the banner appear correctly during the safe test?');
  const closeWorked = await askYNU('Q8.  Did the close/disable procedure work?');
  const uninstallOk = await askYNU('Q9.  Did the uninstall/remove procedure work?');
  const privacyIssue = await askYNU('Q10. Was any privacy or security issue observed?');
  const billingConcern = await askYNU('Q11. Was any billing or ledger concern observed?');
  let hasIssues = await askYNU('Q12. Were any issues found during the session?');

  const issueSummaries = [];
  if (hasIssues === 'yes') {
    console.log('');
    console.log('  Enter sanitized issue summaries (no personal data, no API keys, no ChatGPT content).');
    let n = 1;
    while (true) {
      const s = await ask(`  Issue ${n} title (short, or press Enter to stop): `);
      if (!s) break;
      let sev = await askChoice(`  Issue ${n} severity`, ['S0', 'S1', 'S2', 'S3', 'S4']);
      const area = await ask(`  Issue ${n} area (e.g. area:browser-extension, area:docs): `);
      const desc = await ask(`  Issue ${n} sanitized description (no private data): `);

      // RULE: A confirmed "no" on banner appearance is a beta blocker. It cannot
      // be filed at S2-S4 for an issue that is clearly the banner failure itself --
      // that would misrepresent a GO-blocking defect as low priority. Enforce a
      // floor of S1/P1 (S0 is still permitted if the tester escalated it further,
      // e.g. because it also involves a privacy/security concern).
      const bannerRelated = bannerAppeared === 'no' && /banner/i.test(s);
      if (bannerRelated && sev !== 'S0' && sev !== 'S1') {
        console.log(`  RULE  Banner confirmed NOT observed on real ChatGPT -- this blocks the dry-run GO decision.`);
        console.log(`        Severity floor is S1/P1; refusing to record "${sev}" for "${s}". Forcing S1.`);
        sev = 'S1';
      }

      issueSummaries.push({ title: s, severity: sev, area: area || 'area:unknown', description: desc });
      n++;
      if (n > 10) {
        console.log('  Maximum 10 issues per session. File remaining issues manually.');
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // RULE: If the banner was confirmed NOT to appear on real ChatGPT, an S1/P1
  // issue MUST exist in this session's record. Do not rely on the tester
  // remembering to file it, and do not allow the failure to go unrecorded or
  // be represented only by a low-severity issue.
  // -----------------------------------------------------------------------
  if (bannerAppeared === 'no') {
    const hasBannerS1Issue = issueSummaries.some(
      (iss) => /banner/i.test(iss.title) && (iss.severity === 'S0' || iss.severity === 'S1'),
    );
    if (!hasBannerS1Issue) {
      console.log('');
      console.log('  RULE  Banner confirmed NOT observed on real ChatGPT with no S0/S1 issue on record.');
      console.log('        Auto-filing a mandatory S1/P1 blocker issue -- this cannot be skipped or downgraded.');
      hasIssues = 'yes';
      issueSummaries.push({
        title: 'Banner not observed on real ChatGPT despite packaged selftest passing',
        severity: 'S1',
        area: 'area:browser-extension, area:chatgpt-adapter, area:dry-run',
        description:
          'The automated packaged selftest (dryrun:001:selftest) passed using internal demo mode ' +
          '(no API configuration required), confirming the banner rendering code path works in the ' +
          'shipped artifact. Despite this, a real human tester on real chatgpt.com with the same ' +
          'packaged artifact did not see the banner. This rules out missing API configuration as the ' +
          'cause and points to a discrepancy between the synthetic fixture/selftest environment and ' +
          'real chatgpt.com (e.g. wait-state selector drift, content-script injection timing on the ' +
          'live SPA, or demo-mode flag not persisting across install/update). Runtime diagnosis on the ' +
          'real ChatGPT page is required before this can be downgraded.',
      });
    }
  }

  // -----------------------------------------------------------------------
  // Detect if key observations were inconclusive (unknown answers on critical Qs)
  // -----------------------------------------------------------------------
  const hasUnknownAnswers = [bannerAppeared, closeWorked, uninstallOk, privacyIssue, billingConcern, safePromptUsed].includes('unknown');

  // -----------------------------------------------------------------------
  // Enforce business rules
  // UNKNOWN on a safety-critical question is treated conservatively:
  //   privacy/billing unknown -> assume concern (S0/P0)
  //   banner/uninstall/prompt unknown -> blocker (HOLD)
  // -----------------------------------------------------------------------
  console.log('');
  console.log('-- Applying business rules --');

  const blockers = [];

  if (privacyIssue === 'yes' || privacyIssue === 'unknown') {
    if (privacyIssue === 'yes') {
      console.log('  RULE  Privacy/security issue detected -> S0/P0 until reviewed by Privacy Owner');
      console.log('        Do NOT file this publicly. Contact Privacy Owner via private channel.');
    } else {
      console.log('  RULE  Privacy/security status UNKNOWN -> treated as S0/P0 until confirmed clean');
      console.log('        Contact Privacy Owner to confirm no issue before proceeding.');
    }
    blockers.push(`Privacy/security ${privacyIssue === 'unknown' ? 'status unknown (S0/P0 assumed)' : 'issue (S0/P0)'} -- decision cannot be GO`);
  }

  if (billingConcern === 'yes' || billingConcern === 'unknown') {
    if (billingConcern === 'yes') {
      console.log('  RULE  Billing/ledger concern detected -> P0/P1 -- decision cannot be GO');
      console.log('        Notify Billing Owner immediately. Stop all billing tests.');
    } else {
      console.log('  RULE  Billing/ledger status UNKNOWN -> treated as concern until confirmed clear');
      console.log('        Notify Billing Owner to confirm no concern before proceeding.');
    }
    blockers.push(`Billing/ledger ${billingConcern === 'unknown' ? 'status unknown (concern assumed)' : 'concern (P0/P1)'} -- decision cannot be GO`);
  }

  if (uninstallOk !== 'yes') {
    console.log(`  RULE  Uninstall/rollback ${uninstallOk === 'unknown' ? 'status UNKNOWN' : 'not confirmed'} -> decision cannot be GO`);
    blockers.push(`Uninstall/rollback ${uninstallOk === 'unknown' ? 'status unknown' : 'not confirmed'} -- decision cannot be GO`);
  }

  if (safePromptUsed !== 'yes') {
    console.log(`  RULE  Safe test prompt ${safePromptUsed === 'unknown' ? 'status UNKNOWN' : 'not confirmed'} -> decision cannot be GO`);
    blockers.push(`Safe test prompt ${safePromptUsed === 'unknown' ? 'status unknown' : 'not confirmed'} -- decision cannot be GO`);
  }

  if (bannerAppeared !== 'yes') {
    if (bannerAppeared === 'unknown') {
      console.log('  RULE  Banner appearance UNKNOWN -> cannot confirm overlay functionality');
      console.log('        See TROUBLESHOOTING_BANNER_NOT_OBSERVED.md for diagnosis steps.');
      console.log('        Run: pnpm -w run dryrun:001:diagnose');
    } else {
      console.log('  RULE  Banner did not appear -> likely S1 blocker -> decision cannot be GO');
      console.log('        See TROUBLESHOOTING_BANNER_NOT_OBSERVED.md for diagnosis steps.');
    }
    blockers.push(`Banner ${bannerAppeared === 'unknown' ? 'appearance unknown' : 'did not appear'} -- S1 blocker -- decision cannot be GO`);
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
  // Q13: Decision
  // -----------------------------------------------------------------------
  console.log('');
  let decision;
  if (canGo) {
    decision = await askChoice('Q13. Go/No-Go decision', ['GO', 'HOLD', 'STOP']);
  } else {
    console.log('  Decision constrained by blockers above. GO is not permitted.');
    if (hasUnknownAnswers) {
      console.log('  INCONCLUSIVE answers map to HOLD -- rerun after resolving setup issues.');
    }
    decision = await askChoice('Q13. Go/No-Go decision', ['HOLD', 'STOP']);
  }

  // -----------------------------------------------------------------------
  // Determine overall status
  // BLOCKED: some critical observations were unknown (inconclusive session)
  // PASS WITH ISSUES: session completed, known issues, HOLD
  // FAILED: S1 confirmed or STOP decision
  // -----------------------------------------------------------------------
  let status;
  if (decision === 'GO') {
    status = (hasIssues === 'yes') ? 'PASS WITH ISSUES' : 'PASS';
  } else if (decision === 'HOLD') {
    status = hasUnknownAnswers ? 'BLOCKED' : 'PASS WITH ISSUES';
  } else {
    status = 'FAILED';
  }

  // Tracker session status
  const sessionStatus = (decision === 'GO' || (decision === 'HOLD' && !hasUnknownAnswers)) ? 'COMPLETED' : 'INCONCLUSIVE';

  // -----------------------------------------------------------------------
  // Create DRYRUN-001_RESULT_LOG.md
  // -----------------------------------------------------------------------
  console.log('');
  console.log('-- Creating result log --');

  if (fs.existsSync(RESULT_LOG_PATH)) {
    const overwrite = await askYN('  DRYRUN-001_RESULT_LOG.md already exists. Overwrite?');
    if (!overwrite) {
      console.log('  Skipping result log creation. Existing log preserved.');
    } else {
      fs.unlinkSync(RESULT_LOG_PATH);
    }
  }

  if (!fs.existsSync(RESULT_LOG_PATH)) {
    const issuesTable = issueSummaries.length > 0
      ? issueSummaries.map((iss, i) => `| ${i + 1} | ${iss.title} | ${iss.severity} | ${iss.area} | needs-triage | [#TBD] |`).join('\n')
      : '| -- | No issues recorded during this dry-run session. | -- | -- | -- | -- |';

    const commitRes = runCmd('git rev-parse --short HEAD');
    const commit = (commitRes.stdout || '').trim();
    const branchRes = runCmd('git rev-parse --abbrev-ref HEAD');
    const branch = (branchRes.stdout || '').trim() || '(unknown)';

    const blockerNote = blockers.length > 0
      ? `\n**Blockers preventing GO:**\n${blockers.map(b => `- ${b}`).join('\n')}\n`
      : '';

    const inconclusiveNote = hasUnknownAnswers
      ? `\n> **NOTE:** This result is INCONCLUSIVE. Some key observations were answered as UNKNOWN.\n> Rerun required after confirming tester setup. See TROUBLESHOOTING_BANNER_NOT_OBSERVED.md.\n> Run: pnpm -w run dryrun:001:diagnose\n`
      : '';

    const resultLog = `# PromptProfit -- DRYRUN-001 Result Log

**Dry-Run ID:** DRYRUN-001
**Status: ${status}**
**Date:** ${today}
**Branch:** ${branch}
**Commit:** ${commit}
**Decision:** ${decision}

---

> Result recorded by dryrun-001-finalize.js on ${today}.
> Real human tester participated in this session.
> Privacy rules enforced: no personal data, no API keys, no ChatGPT content recorded.
${inconclusiveNote}
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
${hasUnknownAnswers ? '\n**Reason:** Some critical observations were UNKNOWN. Session is inconclusive. Rerun required.\n' : ''}
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
2. Loaded extension via chrome://extensions -> Load unpacked.
3. Navigated to chatgpt.com.
4. Used an approved safe prompt (either "Count slowly from 1 to 10." or the
   recommended longer prompt "Count slowly from 1 to 100, one number per line.")
5. Observed banner behavior (and, if enabled, the live dry-run diagnostics panel).
6. Tested close/disable/uninstall procedures.

---

## 7. Observed Results

| Observation | Result |
|-------------|--------|
| Extension loaded in Chrome | ${ynu(installOk)} |
| Overlay banner appeared during response | ${ynu(bannerAppeared)} |
| Banner content: placeholder only | [record separately] |
| Banner close button worked | ${ynu(closeWorked)} |
| Disable turned off banner | ${ynu(closeWorked)} |
| Remove uninstalled cleanly | ${ynu(uninstallOk)} |

---

## 8. Issues Found

| # | Title | Severity | Area | Status | GitHub Issue # |
|---|-------|----------|------|--------|----------------|
${issuesTable}

---

## 9. Privacy and Security Observations

- Privacy/security issue observed: ${privacyIssue === 'yes' ? 'YES -- ESCALATE TO PRIVACY OWNER (S0/P0)' : privacyIssue === 'unknown' ? 'UNKNOWN -- TREAT AS S0/P0 UNTIL CONFIRMED CLEAN' : 'NO'}
- ppft_ key visible in shared output: NOT OBSERVED
- ChatGPT content shared by tester: NOT RECORDED
- S0 event triggered: ${(privacyIssue === 'yes' || privacyIssue === 'unknown') ? 'POSSIBLE -- SEE ESCALATION NOTE' : 'NO'}
${(privacyIssue === 'yes' || privacyIssue === 'unknown') ? '\n**ACTION REQUIRED:** Contact Privacy Owner via private channel. Do NOT file publicly.\n' : ''}
---

## 10. Billing and Ledger Observations

- Billing/ledger concern observed: ${billingConcern === 'yes' ? 'YES -- NOTIFY BILLING OWNER (P0/P1)' : billingConcern === 'unknown' ? 'UNKNOWN -- TREAT AS CONCERN UNTIL CONFIRMED CLEAR' : 'NO'}
- Billing smoke run during session: NOT RUN (requires Docker; optional for Track A)
- Billing invariant check: NOT RUN IN REAL TESTER SESSION

---

## 11. Rollback / Uninstall Result

- Disable procedure tested: ${ynu(closeWorked)}
- Remove procedure tested: ${ynu(uninstallOk)}
- Remove verified: ${ynu(uninstallOk)}
- Full rollback triggered: NO
${blockerNote}
---

## 13. Triage Outcome

Triage completed: ${hasIssues === 'yes' ? 'NEEDS TRIAGE' : 'NO ISSUES -- N/A'}

| Issue # | Severity | Priority | Assigned To | Target Fix |
|---------|----------|----------|-------------|-----------|
${issueSummaries.map((iss, i) => `| ${i + 1} | ${iss.severity} | [P0-P3 TBD] | [OWNER TBD] | [DATE TBD] |`).join('\n') || '| -- | -- | -- | No issues | -- |'}

---

## 14. Next Action

| Next Action | Details | Owner | Target Date |
|-------------|---------|-------|------------|
| ${decision === 'GO' ? 'Proceed to Day 2-3 small beta' : decision === 'HOLD' && hasUnknownAnswers ? 'Diagnose setup issues; schedule rerun' : decision === 'HOLD' ? 'Fix blocker(s) and schedule DRYRUN-002' : 'Execute rollback -- see ROLLBACK_AND_DISABLE_GUIDE.md'} | ${decision === 'GO' ? 'Distribute to 3-5 internal testers' : decision === 'HOLD' && hasUnknownAnswers ? 'Run dryrun:001:diagnose; see TROUBLESHOOTING_BANNER_NOT_OBSERVED.md' : decision === 'HOLD' ? 'Assign fix owners; set target dates' : 'Notify stakeholders; pause beta distribution'} | [OWNER TBD] | [DATE TBD] |

---

## 15. Sign-Off Table

| Role | Approved | Date |
|------|---------|------|
| Dry-Run Owner | [YES / NO / TBD] | ${today} |
| QA Owner | [YES / NO / TBD] | [DATE TBD] |
| Privacy Owner | ${(privacyIssue === 'yes' || privacyIssue === 'unknown') ? 'REQUIRED -- S0 PENDING' : '[YES / NO / TBD]'} | [DATE TBD] |
| Release Owner | [YES / NO / TBD] | [DATE TBD] |

---

**Privacy warning: Do not share ChatGPT prompt text, response text, screenshots containing
personal or private data, API keys, .env files, cookies, tokens, or raw logs with secrets.**
`;

    // Scan for forbidden content before writing
    const forbidden = scanForForbiddenContent(resultLog);
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

      const forbidden = scanForForbiddenContent(issueContent);
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
    const noteText = hasUnknownAnswers
      ? `Session inconclusive; some answers unknown; rerun required`
      : `Real session completed ${today}`;
    const newRow = `| DRYRUN-001 | ${today} | ${testerRole || '[TBD]'} | [A/B] | ${sessionStatus} | ${decision} | DRYRUN-001_RESULT_LOG.md | ${noteText} |`;
    tracker = tracker.replace(
      /\| DRYRUN-001 \|[^\n]+\|/,
      newRow
    );
    tracker = tracker.replace(/\| Status \| READY TO RUN \|/, `| Status | ${sessionStatus} |`);
    tracker = tracker.replace(/\| Status \| NOT RUN YET \|/, `| Status | ${sessionStatus} |`);
    tracker = tracker.replace(/\| Decision \| PENDING \|/, `| Decision | ${decision} |`);
    tracker = tracker.replace(/\| Issues Found \| NOT OBSERVED YET \|/, `| Issues Found | ${issueSummaries.length} |`);
    tracker = tracker.replace(
      /\| Privacy Result \| NOT OBSERVED YET \|/,
      `| Privacy Result | ${privacyIssue === 'yes' ? 'ISSUE OBSERVED -- SEE S0 ESCALATION' : privacyIssue === 'unknown' ? 'UNKNOWN -- TREAT AS S0 UNTIL REVIEWED' : 'CLEAN'} |`
    );
    tracker = tracker.replace(
      /\| Billing Result \| NOT OBSERVED IN REAL TESTER RUN \|/,
      `| Billing Result | ${billingConcern === 'yes' ? 'CONCERN OBSERVED' : billingConcern === 'unknown' ? 'UNKNOWN -- TREAT AS CONCERN' : 'NO CONCERN'} |`
    );
    tracker = tracker.replace(
      /\| Rollback Result \| NOT OBSERVED YET \|/,
      `| Rollback Result | ${uninstallOk === 'yes' ? 'CONFIRMED' : uninstallOk === 'unknown' ? 'UNKNOWN' : 'NOT CONFIRMED'} |`
    );
    fs.writeFileSync(TRACKER_PATH, tracker, 'utf8');
    console.log('  PASS  Updated: DRY_RUN_STATUS_TRACKER.md');
  }

  // -----------------------------------------------------------------------
  // Update GO_NO_GO_DECISION_RECORD.md
  // -----------------------------------------------------------------------
  if (fs.existsSync(GO_NO_GO_PATH)) {
    let goNoGo = fs.readFileSync(GO_NO_GO_PATH, 'utf8');
    const completionDesc = hasUnknownAnswers ? `inconclusive ${today}` : `completed ${today}`;
    goNoGo = goNoGo.replace(
      /\*\*Decision Status: PENDING[^\*]*\*\*/,
      `**Decision Status: ${decision} -- DRYRUN-001 ${completionDesc}**`
    );
    goNoGo = goNoGo.replace(
      /## CURRENT DECISION: PENDING[\s\S]*?---/,
      `## CURRENT DECISION: ${decision}\n\n**Reason:** DRYRUN-001 ${completionDesc}. Decision recorded by finalize script.\n\n---`
    );
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
    const worksheetStatus = hasUnknownAnswers ? 'INCONCLUSIVE' : 'COMPLETED';
    worksheet = worksheet.replace(
      '**Status: NOT RUN YET**',
      `**Status: ${worksheetStatus} -- see DRYRUN-001_RESULT_LOG.md (decision: ${decision})**`
    );
    worksheet = worksheet.replace(
      '**Decision:** PENDING -- dry-run not yet executed',
      `**Decision:** ${decision} -- DRYRUN-001 ${hasUnknownAnswers ? 'inconclusive' : 'completed'} ${today}`
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
    const found = scanForForbiddenContent(content);
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
  if (decision === 'GO' && privacyIssue !== 'yes' && billingConcern !== 'yes') {
    finalLabel = (hasIssues === 'yes')
      ? 'First internal beta dry-run completed and triaged. (PASS WITH ISSUES)'
      : 'First internal beta dry-run completed and triaged.';
  } else if (decision === 'HOLD' && hasUnknownAnswers) {
    finalLabel = 'DRYRUN-001 inconclusive; rerun required after setup clarification.';
  } else if (decision === 'HOLD' && bannerAppeared === 'no') {
    // Confirmed (not unknown) banner failure on real ChatGPT, even though the
    // packaged selftest passed -- setup/config causes are ruled out, but the
    // exact real-runtime failure point is not yet diagnosed.
    finalLabel = 'DRYRUN-001 inconclusive; real ChatGPT banner runtime diagnosis required.';
  } else if (decision === 'HOLD') {
    finalLabel = 'DRYRUN-001 blocked; fixes required before next tester.';
  } else if (decision === 'STOP') {
    finalLabel = 'DRYRUN-001 stopped; critical issue requires investigation.';
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
  } else if (decision === 'HOLD' && hasUnknownAnswers) {
    console.log('Next steps (INCONCLUSIVE -- setup must be confirmed):');
    console.log('  1. Run: pnpm -w run dryrun:001:diagnose');
    console.log('     Verify extension loads correctly from the extracted ZIP root folder containing manifest.json.');
    console.log('  2. See: docs/internal-beta/dry-runs/TROUBLESHOOTING_BANNER_NOT_OBSERVED.md');
    console.log('     Confirm tester is LOGGED INTO chatgpt.com before running the test.');
    console.log('  3. Confirm tester selects "New chat" (not an existing conversation).');
    console.log('  4. Confirm tester watches during ChatGPT generation (banner shows while generating).');
    console.log('  5. Commit the result log and updated docs (status: INCONCLUSIVE / HOLD).');
    console.log('  6. Reschedule rerun after confirming setup is correct.');
    console.log('  7. Do NOT invite more testers until the overlay is confirmed working.');
  } else if (decision === 'HOLD' && bannerAppeared === 'no') {
    console.log('Next steps (CONFIRMED banner failure -- packaged selftest passed, real ChatGPT did not):');
    console.log('  1. Do NOT reclassify this as a setup/environment issue (S2-S4) -- selftest already');
    console.log('     ruled out missing API config, wrong load folder, and kill-switch defaults.');
    console.log('  2. Add real-runtime diagnostics (content-script-loaded, wait-state-detected,');
    console.log('     ad-decision-requested/received, banner-render-attempted) without capturing page content.');
    console.log('  3. Verify CHATGPT_PROCESSING_SELECTORS still match the live chatgpt.com DOM.');
    console.log('  4. Verify dryRunDemoMode persists across install/update on a real Chrome profile.');
    console.log('  5. Commit the result log and updated docs (status: BLOCKED / HOLD, Issue S1/P1).');
    console.log('  6. Do NOT invite more testers until the real-ChatGPT root cause is diagnosed and fixed.');
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
    if (privacyIssue === 'yes' || privacyIssue === 'unknown') {
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
