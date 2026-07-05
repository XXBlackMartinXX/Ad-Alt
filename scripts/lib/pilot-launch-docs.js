'use strict';
/**
 * Generates the sanitized launch-session and closeout markdown documents
 * for the controlled ChatGPT pilot launch workflow. Pure string
 * generation only -- no file I/O, no network, no private data beyond
 * what the caller already validated into the setup/answers object.
 */

const PRIVACY_WARNING =
  '**Privacy warning: Do not add real ChatGPT prompt/response text, real ' +
  'buyer contact/payment details, real API keys, or real payment ' +
  'credentials to this document.**';

function checkbox(value) {
  return value === true ? '[x]' : '[ ]';
}

function generateLaunchSessionMd({ setup, decision, reasons, timestamp, browserOpened, browserReason, dryRun }) {
  const lines = [
    `# Launch Session — ${setup ? setup.pilotId : '(unknown pilot)'}`,
    '',
    `**Session timestamp:** ${timestamp}`,
    `**Mode:** ${dryRun ? 'DRY RUN (no real launch performed)' : 'REAL LAUNCH'}`,
    `**Decision:** \`${decision}\``,
    `**Platform:** ChatGPT browser only`,
    '',
  ];
  if (setup) {
    lines.push(
      '## Pilot fields at launch time',
      '',
      '| Field | Value |',
      '|---|---|',
      `| Pilot ID | ${setup.pilotId} |`,
      `| Budget cap (USD) | ${setup.budgetCapUsd !== '' && setup.budgetCapUsd !== undefined ? `$${setup.budgetCapUsd}` : '[MISSING]'} |`,
      `| Status | ${setup.status} |`,
      `| Owner initials | ${setup.ownerInitials || '[MISSING]'} |`,
      `| Rollback owner initials | ${setup.rollbackOwnerInitials || '[MISSING]'} |`,
      '',
    );
  }

  if (decision === 'GO') {
    lines.push(
      '## Result',
      '',
      'Preflight returned GO. This launch session folder was created and',
      'the safe-operator-actions / stop-conditions / post-pilot-closeout',
      'documents were written alongside this file.',
      '',
    );
    if (!dryRun) {
      lines.push(
        '## Browser surface',
        '',
        `- Opened: ${browserOpened ? 'yes' : 'no'}`,
        browserReason ? `- Detail: ${browserReason}` : '',
        '',
      );
    }
  } else {
    lines.push(
      '## Result',
      '',
      'Launch did NOT proceed. Reasons:',
      '',
      ...(reasons && reasons.length > 0 ? reasons.map((r) => `- ${r}`) : ['- (no reasons recorded)']),
      '',
    );
  }

  lines.push('---', '', PRIVACY_WARNING, '');
  return lines.filter((l) => l !== '').concat(['']).join('\n');
}

function generateSafeOperatorActionsMd(setup) {
  return [
    `# Safe Operator Actions — ${setup.pilotId}`,
    '',
    'Actions this launch automation performed or may perform on your',
    'behalf (all local, all safe, all reversible):',
    '',
    '- Ran every local preflight gate fresh.',
    '- Validated the pilot instance fields and non-negotiable scope flags.',
    '- Created this launch session folder and its sanitized status files.',
    '- Optionally opened local operator docs (quickstart, manual revenue',
    '  record, rollback confirmation) with your OS default viewer.',
    '- Optionally opened a fresh, disposable Chrome profile with the',
    '  built extension loaded, navigated to chatgpt.com\'s root URL only.',
    '',
    '## What this automation never does',
    '',
    '- Never logs in or fills in any credential.',
    '- Never types or submits a prompt.',
    '- Never reads page/DOM/chat/response content.',
    '- Never inspects cookies, tokens, or storage.',
    '- Never captures a screenshot, video, or trace.',
    '- Never collects, records, or transmits real buyer contact/payment',
    '  details.',
    '- Never executes a real payout or collects a real payment.',
    '- Never performs a public release.',
    '',
    '---',
    '',
    PRIVACY_WARNING,
    '',
  ].join('\n');
}

function generateStopConditionsMd(setup) {
  return [
    `# Stop Conditions — ${setup.pilotId}`,
    '',
    'Stop the pilot immediately (see',
    '`docs/internal-beta/revenue-pilot/PILOT_STOP_ROLLBACK_PLAN.md` for the',
    'full rollback sequence) if any of the following occur:',
    '',
    '- Any privacy leak (prompt/response/chat/page content, cookies,',
    '  tokens, or account data observed anywhere it should not be).',
    '- Duplicate billing or any ledger imbalance.',
    '- The approved budget cap is exceeded or at risk of being exceeded.',
    '- Any extension runtime regression or crash.',
    '- Any S0/S1 severity issue as defined in',
    '  `docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md`.',
    '- Anything that would require public release, real payout execution,',
    '  or automatic billing to continue.',
    '',
    `**Rollback owner:** ${setup.rollbackOwnerInitials || '[MISSING]'}`,
    '',
    'When in doubt, stop.',
    '',
    '---',
    '',
    PRIVACY_WARNING,
    '',
  ].join('\n');
}

function generatePostPilotCloseoutMd(setup) {
  return [
    `# Post-Pilot Closeout — ${setup.pilotId}`,
    '',
    'After the pilot interaction is complete, run:',
    '',
    '```',
    `pnpm -w run pilot:closeout -- --pilot-id ${setup.pilotId}`,
    '```',
    '',
    'That wizard will ask only safe yes/no questions (budget cap',
    'respected, manual revenue record updated, any S0/S1 issue, rollback',
    'needed, public release avoided, real payout avoided) and write',
    '`PILOT_CLOSEOUT_SUMMARY.md` alongside this pilot instance.',
    '',
    'Also manually:',
    '',
    '- Fill in `MANUAL_REVENUE_RECORD.md` with the actual amount collected.',
    '- Re-run `check:billing:reconciliation -- --mode internal-beta`.',
    '- Complete the post-pilot section of `PILOT_ACCEPTANCE_CHECKLIST.md`.',
    '',
    '---',
    '',
    PRIVACY_WARNING,
    '',
  ].join('\n');
}

function generatePilotCloseoutSummaryMd(setup, answers, result) {
  const items = [
    ['Budget cap respected', answers.budgetCapRespected],
    ['Manual revenue record updated', answers.manualRevenueRecordUpdated],
    ['Any S0/S1 issue', answers.hadS0S1Issue],
    ['Rollback needed', answers.rollbackNeeded],
    ['Public release avoided', answers.publicReleaseAvoided],
    ['Real payout execution avoided', answers.realPayoutAvoided],
  ];
  const lines = [
    `# Pilot Closeout Summary — ${setup.pilotId}`,
    '',
    `**Closed at:** ${answers.closedAt}`,
    `**Result:** \`${result}\``,
    '',
    '| Question | Answer |',
    '|---|---|',
  ];
  for (const [label, value] of items) {
    lines.push(`| ${label} | ${value === true ? 'yes' : value === false ? 'no' : '[unanswered]'} |`);
  }
  lines.push('');
  if (result === 'STOP_REVIEW_REQUIRED') {
    lines.push(
      '## Action required',
      '',
      'This pilot closeout requires human review before reconciliation --',
      'an S0/S1 issue was reported, or public release / real payout',
      'execution was not confirmed avoided. Do not mark this pilot',
      'reconciled until reviewed.',
      '',
    );
  } else {
    lines.push(
      '## Next step',
      '',
      'Proceed with reconciliation: re-run',
      '`check:billing:reconciliation -- --mode internal-beta` and complete',
      '`PILOT_ACCEPTANCE_CHECKLIST.md`\'s post-pilot section.',
      '',
    );
  }
  lines.push('---', '', PRIVACY_WARNING, '');
  return lines.join('\n');
}

module.exports = {
  checkbox,
  generateLaunchSessionMd,
  generateSafeOperatorActionsMd,
  generateStopConditionsMd,
  generatePostPilotCloseoutMd,
  generatePilotCloseoutSummaryMd,
};
