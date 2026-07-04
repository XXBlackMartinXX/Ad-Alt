'use strict';
/**
 * Unit tests for scripts/lib/pilot-setup.js -- the controlled ChatGPT
 * pilot setup model and its validation rules.
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePilotSetup,
  buildPilotSetup,
  deriveStatus,
  generatePilotId,
  scanForPrivateData,
  ONLY_ALLOWED_PLATFORM,
  MAX_BUDGET_CAP_USD,
} = require('../lib/pilot-setup.js');

function validSetup(overrides) {
  return Object.assign(
    {
      pilotId: 'pilot-test-0001',
      createdAt: '2026-07-04T00:00:00.000Z',
      ownerInitials: 'JD',
      rollbackOwnerInitials: 'AB',
      platform: ONLY_ALLOWED_PLATFORM,
      buyerAlias: 'buyer-alpha',
      budgetCapUsd: 25,
      startDate: '2026-07-10',
      endDate: '2026-07-17',
      manualRevenueRecordRequired: true,
      noRealPayouts: true,
      noPublicRelease: true,
      chatgptOnly: true,
      rollbackConfirmed: true,
      finalPreflightRequired: true,
      notes: '',
      status: 'DRAFT',
    },
    overrides || {},
  );
}

test('a fully valid setup passes validation', () => {
  const result = validatePilotSetup(validSetup());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('rejects a platform other than ChatGPT browser', () => {
  const result = validatePilotSetup(validSetup({ platform: 'Claude browser' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('platform must be exactly')));
});

test('rejects chatgptOnly=false even if platform is correct', () => {
  const result = validatePilotSetup(validSetup({ chatgptOnly: false }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('chatgptOnly must be true')));
});

for (const label of ['claude code', 'codex', 'gemini', 'vscode', 'desktop', 'terminal']) {
  test(`rejects unsupported platform label "${label}" appearing in buyerAlias`, () => {
    const result = validatePilotSetup(validSetup({ buyerAlias: `test ${label} mention` }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('unsupported platform label')));
  });
}

test('rejects missing ownerInitials', () => {
  const result = validatePilotSetup(validSetup({ ownerInitials: '' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('ownerInitials is required')));
});

test('rejects missing rollbackOwnerInitials', () => {
  const result = validatePilotSetup(validSetup({ rollbackOwnerInitials: '' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('rollbackOwnerInitials is required')));
});

test('rejects missing buyerAlias', () => {
  const result = validatePilotSetup(validSetup({ buyerAlias: '' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('buyerAlias is required')));
});

test('rejects an email address in buyerAlias', () => {
  const result = validatePilotSetup(validSetup({ buyerAlias: 'contact me at buyer@example.com' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('email address')));
});

test('rejects a phone number in buyerAlias', () => {
  const result = validatePilotSetup(validSetup({ buyerAlias: 'call 555-123-4567 for details' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('phone number')));
});

test('rejects a card-like number in buyerAlias', () => {
  const result = validatePilotSetup(validSetup({ buyerAlias: 'card 4111 1111 1111 1111' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('card-like number')));
});

test('rejects a bank account keyword in notes', () => {
  const result = validatePilotSetup(validSetup({ notes: 'their routing number is on file' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('bank/account keyword')));
});

test('rejects prompt/response content markers', () => {
  const result = validatePilotSetup(validSetup({ notes: 'prompt: tell me a joke' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('prompt/response content marker')));
});

test('rejects a secret/token-like value', () => {
  const result = validatePilotSetup(validSetup({ notes: 'api key: ppft_abc123def456' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('secret/token-like value')));
});

test('rejects missing budgetCapUsd', () => {
  const result = validatePilotSetup(validSetup({ budgetCapUsd: '' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('budgetCapUsd is required')));
});

test('rejects a non-positive budgetCapUsd', () => {
  const result = validatePilotSetup(validSetup({ budgetCapUsd: 0 }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('positive number')));
});

test('rejects a budgetCapUsd above the tiny-pilot ceiling', () => {
  const result = validatePilotSetup(validSetup({ budgetCapUsd: MAX_BUDGET_CAP_USD + 1 }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('exceeds the tiny-capped-pilot ceiling')));
});

test('accepts a budgetCapUsd exactly at the ceiling', () => {
  const result = validatePilotSetup(validSetup({ budgetCapUsd: MAX_BUDGET_CAP_USD }));
  assert.equal(result.valid, true);
});

test('rejects endDate before startDate', () => {
  const result = validatePilotSetup(validSetup({ startDate: '2026-07-17', endDate: '2026-07-10' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('endDate must not be before startDate')));
});

test('rejects malformed dates', () => {
  const result = validatePilotSetup(validSetup({ startDate: 'not-a-date' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('startDate is required')));
});

for (const flag of ['manualRevenueRecordRequired', 'noRealPayouts', 'noPublicRelease', 'finalPreflightRequired']) {
  test(`rejects ${flag}=false`, () => {
    const result = validatePilotSetup(validSetup({ [flag]: false }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes(`${flag} must be true`)));
  });
}

test('warns (but does not error) when rollbackConfirmed is not yet true', () => {
  const result = validatePilotSetup(validSetup({ rollbackConfirmed: false }));
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes('rollbackConfirmed')));
});

test('scanForPrivateData returns empty for a clean short alias', () => {
  assert.deepEqual(scanForPrivateData('buyer-alpha-internal-ref'), []);
});

test('scanForPrivateData does not false-positive on ISO timestamps as phone numbers', () => {
  assert.deepEqual(scanForPrivateData('2026-07-04T11:55:02.622Z'), []);
});

test('scanForPrivateData does not false-positive on generated pilot IDs as phone numbers', () => {
  assert.deepEqual(scanForPrivateData('pilot-20260704-ab12'), []);
});

test('scanForPrivateData does not false-positive on a plain YYYY-MM-DD date as a phone number', () => {
  assert.deepEqual(scanForPrivateData('2026-07-10'), []);
});

test('scanForPrivateData still catches real phone number formats', () => {
  assert.ok(scanForPrivateData('call 555-123-4567 for details').includes('phone number'));
  assert.ok(scanForPrivateData('(555) 123-4567').includes('phone number'));
  assert.ok(scanForPrivateData('+1 555-123-4567').includes('phone number'));
});

test('scanForPrivateData flags multiple violation types independently', () => {
  const hits = scanForPrivateData('email me at a@b.com, card 4111111111111111');
  assert.ok(hits.includes('email address'));
  assert.ok(hits.includes('card-like number'));
});

test('buildPilotSetup forces the hardcoded-true safety flags regardless of input', () => {
  const setup = buildPilotSetup({ manualRevenueRecordRequired: false, noRealPayouts: false });
  assert.equal(setup.manualRevenueRecordRequired, true);
  assert.equal(setup.noRealPayouts, true);
  assert.equal(setup.noPublicRelease, true);
  assert.equal(setup.finalPreflightRequired, true);
});

test('buildPilotSetup generates a pilotId when none is supplied', () => {
  const setup = buildPilotSetup({});
  assert.match(setup.pilotId, /^pilot-\d{8}-[a-z0-9]{4}$/);
});

test('generatePilotId produces a well-formed, unique-looking ID', () => {
  const a = generatePilotId();
  const b = generatePilotId();
  assert.match(a, /^pilot-\d{8}-[a-z0-9]{4}$/);
  assert.notEqual(a, b);
});

test('deriveStatus returns HOLD for an invalid setup', () => {
  const setup = validSetup({ ownerInitials: '' });
  const validation = validatePilotSetup(setup);
  assert.equal(deriveStatus(setup, validation), 'HOLD');
});

test('deriveStatus returns READY for a fully valid setup', () => {
  const setup = validSetup();
  const validation = validatePilotSetup(setup);
  assert.equal(deriveStatus(setup, validation), 'READY');
});

test('deriveStatus returns DRAFT_NEEDS_HUMAN_COMPLETION for a template, regardless of validity', () => {
  const setup = validSetup({ status: 'DRAFT_NEEDS_HUMAN_COMPLETION' });
  const validation = validatePilotSetup(setup);
  assert.equal(deriveStatus(setup, validation), 'DRAFT_NEEDS_HUMAN_COMPLETION');
});
