'use strict';
/**
 * Generates the four sanitized pilot-instance markdown documents from a
 * pilot-setup object (see scripts/lib/pilot-setup.js). Pure string
 * generation only -- no file I/O, no network, no private data beyond
 * what the caller already validated into the setup object.
 */

const PRIVACY_WARNING =
  '**Privacy warning: Do not add real ChatGPT prompt/response text, real ' +
  'buyer contact/payment details, real API keys, or real payment ' +
  'credentials to this document.**';

function checkbox(value) {
  return value === true ? '[x]' : '[ ]';
}

function generatePilotSetupMd(setup, validation) {
  const status = setup.status;
  const lines = [
    `# Controlled ChatGPT Pilot Setup — ${setup.pilotId}`,
    '',
    `**Status:** \`${status}\``,
    `**Created:** ${setup.createdAt}`,
    `**Platform:** ${setup.platform} (ChatGPT browser only, per CONTROLLED_REVENUE_PILOT_CRITERIA.md)`,
    '',
    '---',
    '',
    '## Pilot fields',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Pilot ID | ${setup.pilotId} |`,
    `| Owner initials | ${setup.ownerInitials || '[MISSING]'} |`,
    `| Rollback owner initials | ${setup.rollbackOwnerInitials || '[MISSING]'} |`,
    `| Buyer alias / internal reference | ${setup.buyerAlias || '[MISSING]'} |`,
    `| Budget cap (USD) | ${setup.budgetCapUsd !== '' ? `$${setup.budgetCapUsd}` : '[MISSING]'} |`,
    `| Start date | ${setup.startDate || '[MISSING]'} |`,
    `| End date | ${setup.endDate || '[MISSING]'} |`,
    `| Manual revenue record required | ${setup.manualRevenueRecordRequired} |`,
    `| No real payouts | ${setup.noRealPayouts} |`,
    `| No public release | ${setup.noPublicRelease} |`,
    `| ChatGPT-only scope | ${setup.chatgptOnly} |`,
    `| Rollback confirmed | ${setup.rollbackConfirmed} |`,
    `| Final preflight required | ${setup.finalPreflightRequired} |`,
    '',
  ];

  if (setup.notes) {
    lines.push('## Notes', '', setup.notes, '');
  }

  lines.push('---', '', '## Validation result', '');
  if (validation.errors.length > 0) {
    lines.push('**Errors (must be fixed before this pilot can be READY):**', '');
    for (const e of validation.errors) lines.push(`- ${e}`);
    lines.push('');
  } else {
    lines.push('No validation errors.', '');
  }
  if (validation.warnings.length > 0) {
    lines.push('**Warnings (non-blocking, but review before launch):**', '');
    for (const w of validation.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '## Non-negotiable scope (re-affirmed, never overridden by this instance)',
    '',
    '- Founder-operated only.',
    '- ChatGPT browser only — no Claude, Gemini, VS Code, Claude Code,',
    '  Codex, or any desktop/terminal surface is part of this pilot,',
    '  regardless of what other platform code exists in this repo.',
    '- One controlled buyer/advertiser.',
    '- Manual payment/revenue recording only — no automatic billing',
    '  collection, no real payment processor integration.',
    '- No real payout execution.',
    '- No public release, no production claim.',
    '- No self-serve advertiser onboarding.',
    '',
    'See `docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md`',
    'for the full, authoritative scope this instance operates within.',
    '',
    '---',
    '',
    PRIVACY_WARNING,
    '',
  );

  return lines.join('\n');
}

function generateManualRevenueRecordMd(setup) {
  return [
    `# Manual Revenue Record — ${setup.pilotId}`,
    '',
    '> Copy the block below once per collected payment. This is a',
    '> record-keeping template, not a payment processor. See',
    '> `docs/internal-beta/revenue-pilot/MANUAL_REVENUE_RECORD_TEMPLATE.md`',
    '> for the full warnings and field-by-field guidance.',
    '',
    '## Warnings',
    '',
    '- Do not store card data, bank credentials, or API keys here.',
    '- Do not store ChatGPT prompt/response/chat content here.',
    '- This is NOT production billing and does not imply any developer',
    '  payout — real payout execution remains disabled.',
    '',
    '## Record',
    '',
    '```',
    `Pilot ID: ${setup.pilotId}`,
    'Date: [YYYY-MM-DD]',
    `Buyer alias: ${setup.buyerAlias || '[MISSING]'}`,
    `Approved budget cap: ${setup.budgetCapUsd !== '' ? `$${setup.budgetCapUsd}` : '[MISSING]'}`,
    'Amount actually collected: $____',
    'Collection method: [e.g. "bank transfer", "check", "invoice + ACH"]',
    'Collection reference: [invoice/transfer ID -- never a card/account number]',
    'Ledger evidence location: [e.g. query:local-ledger output reviewed <date>]',
    'Reconciliation result: [PASS / FAIL from check:billing:reconciliation --mode internal-beta]',
    'Refund/adjustment needed: [YES / NO]',
    'Developer payout status: DISABLED / SIMULATED ONLY (never "PAID" or "SENT")',
    'Owner approval: [name/initials and date]',
    'Notes: [no ChatGPT content, no payment credentials]',
    '```',
    '',
    '---',
    '',
    PRIVACY_WARNING,
    '',
  ].join('\n');
}

function generatePreLaunchChecklistMd(setup, validation) {
  const items = [
    { label: 'Pilot ID assigned', ok: !!setup.pilotId },
    { label: 'Owner initials recorded', ok: !!setup.ownerInitials },
    { label: 'Rollback owner initials recorded', ok: !!setup.rollbackOwnerInitials },
    { label: 'Buyer alias recorded (no private contact/payment data)', ok: !!setup.buyerAlias },
    { label: 'Budget cap set and within the tiny-pilot ceiling', ok: setup.budgetCapUsd !== '' },
    { label: 'Start/end dates set (end not before start)', ok: !!setup.startDate && !!setup.endDate },
    { label: 'ChatGPT-browser-only scope confirmed', ok: setup.chatgptOnly === true },
    { label: 'No public release confirmed', ok: setup.noPublicRelease === true },
    { label: 'No real payout execution confirmed', ok: setup.noRealPayouts === true },
    { label: 'Manual revenue record workflow confirmed', ok: setup.manualRevenueRecordRequired === true },
    { label: 'Rollback plan reviewed and confirmed', ok: setup.rollbackConfirmed === true },
    { label: 'Final preflight will be run before launch', ok: setup.finalPreflightRequired === true },
    { label: 'Setup passes validation with zero errors', ok: validation.valid === true },
  ];

  const lines = [
    `# Pre-Launch Checklist — ${setup.pilotId}`,
    '',
    `**Setup status:** \`${setup.status}\``,
    '',
    '| # | Item | Status |',
    '|---|---|---|',
  ];
  items.forEach((item, i) => {
    lines.push(`| ${i + 1} | ${item.label} | ${checkbox(item.ok)} |`);
  });
  lines.push(
    '',
    '## Immediately before launch, also run',
    '',
    '```',
    `pnpm -w run pilot:preflight -- --pilot-id ${setup.pilotId}`,
    '```',
    '',
    'Launch only if that command prints **GO for controlled ChatGPT',
    'browser pilot setup only.** A HOLD result means do not launch until',
    'the reported reasons are resolved.',
    '',
    '---',
    '',
    PRIVACY_WARNING,
    '',
  );
  return lines.join('\n');
}

function generateRollbackConfirmationMd(setup) {
  return [
    `# Rollback Confirmation — ${setup.pilotId}`,
    '',
    `**Rollback owner:** ${setup.rollbackOwnerInitials || '[MISSING]'}`,
    `**Rollback plan reviewed and confirmed:** ${checkbox(setup.rollbackConfirmed === true)}`,
    '',
    'See `docs/internal-beta/revenue-pilot/PILOT_STOP_ROLLBACK_PLAN.md` for',
    'the full trigger list and rollback action sequence. Summary: any',
    'privacy leak, duplicate billing, ledger imbalance, budget-cap breach,',
    'or extension runtime regression triggers immediate rollback.',
    '',
    '## Rollback owner sign-off',
    '',
    '| Role | Initials | Confirmed | Date |',
    '|---|---|---|---|',
    `| Rollback owner | ${setup.rollbackOwnerInitials || '[MISSING]'} | ${checkbox(setup.rollbackConfirmed === true)} | |`,
    '',
    '---',
    '',
    PRIVACY_WARNING,
    '',
  ].join('\n');
}

module.exports = {
  generatePilotSetupMd,
  generateManualRevenueRecordMd,
  generatePreLaunchChecklistMd,
  generateRollbackConfirmationMd,
};
