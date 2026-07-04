'use strict';
/**
 * Controlled ChatGPT Pilot Setup Model
 *
 * Defines the shape of a single controlled-pilot instance and validates
 * it against this repo's non-negotiable pilot scope (see
 * docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md):
 * ChatGPT-browser-only, tiny capped budget, manual revenue recording,
 * no real payouts, no public release, no private data.
 *
 * This module never talks to the network, a database, or a payment
 * processor -- it only validates plain data and (via the caller)
 * produces sanitized markdown files.
 */

const ONLY_ALLOWED_PLATFORM = 'ChatGPT browser';
const MAX_BUDGET_CAP_USD = 500; // "tiny capped budget" ceiling for a controlled pilot, not a real launch
const MAX_FREE_TEXT_LEN = 200; // long blocks of text look like pasted content, not a short alias/note

const STATUSES = ['DRAFT', 'DRAFT_NEEDS_HUMAN_COMPLETION', 'HOLD', 'READY'];

// Explicitly named per this sprint's canaries -- never "verified"/"supported"
// pilot surfaces other than ChatGPT browser.
const UNSUPPORTED_PLATFORM_LABELS = [
  'claude browser', 'claude', 'gemini browser', 'gemini', 'vs code',
  'vscode', 'claude code', 'codex', 'desktop', 'terminal',
];

/** Patterns that must never appear in any pilot-setup free-text field. */
const FORBIDDEN_PATTERNS = [
  { name: 'email address', re: /[^\s@]+@[^\s@]+\.[^\s@]+/i },
  // Requires phone-shaped digit grouping (3-3-4, parenthesized area code,
  // or a leading +country code) -- deliberately NOT a bare long digit
  // run, since that would false-positive on ISO timestamps
  // ("2026-07-04T..."), pilot IDs ("pilot-20260704-ab12"), and dollar
  // amounts, none of which are phone numbers.
  { name: 'phone number', re: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b|\+\d{1,3}[-.\s]?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{2,4}\b/ },
  { name: 'card-like number', re: /\b(?:\d[ -]?){13,19}\b/ },
  { name: 'bank/account keyword', re: /\b(routing number|account number|iban|swift code|bank account|sort code)\b/i },
  { name: 'card keyword', re: /\b(card number|cvv|cvc|expiry date|expiration date)\b/i },
  { name: 'prompt/response content marker', re: /\b(prompt:|response:|chat history|conversation id)/i },
  { name: 'secret/token-like value', re: /\b(ppft_[A-Za-z0-9]+|sk-[A-Za-z0-9]{10,}|api[_-]?key\s*[:=])\b/i },
];

/** Scans a single string for forbidden private-data patterns. Returns violation names (empty = clean). */
function scanForPrivateData(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const hits = [];
  for (const { name, re } of FORBIDDEN_PATTERNS) {
    if (re.test(text)) hits.push(name);
  }
  return hits;
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Validates a candidate pilot-setup object. Never mutates the input.
 * Returns { valid, errors, warnings } -- valid is false if any error
 * exists, regardless of warnings.
 */
function validatePilotSetup(data) {
  const errors = [];
  const warnings = [];
  const d = data || {};

  // --- Platform / scope ---
  if (d.platform !== ONLY_ALLOWED_PLATFORM) {
    errors.push(`platform must be exactly "${ONLY_ALLOWED_PLATFORM}" (got: ${JSON.stringify(d.platform)})`);
  }
  if (d.chatgptOnly !== true) {
    errors.push('chatgptOnly must be true');
  }
  const lowerFields = [d.platform, d.buyerAlias, d.notes].filter((v) => typeof v === 'string').map((v) => v.toLowerCase());
  for (const label of UNSUPPORTED_PLATFORM_LABELS) {
    for (const field of lowerFields) {
      if (field !== ONLY_ALLOWED_PLATFORM.toLowerCase() && field.includes(label)) {
        errors.push(`unsupported platform label detected: "${label}" -- this pilot is ChatGPT browser only`);
      }
    }
  }

  // --- Owner / rollback sign-off ---
  if (isBlank(d.ownerInitials)) errors.push('ownerInitials is required');
  else if (d.ownerInitials.trim().length > 12) warnings.push('ownerInitials looks unusually long for initials');
  if (isBlank(d.rollbackOwnerInitials)) errors.push('rollbackOwnerInitials is required');
  else if (d.rollbackOwnerInitials.trim().length > 12) warnings.push('rollbackOwnerInitials looks unusually long for initials');

  // --- Buyer alias ---
  if (isBlank(d.buyerAlias)) {
    errors.push('buyerAlias is required');
  } else {
    if (d.buyerAlias.length > MAX_FREE_TEXT_LEN) {
      errors.push(`buyerAlias is too long (${d.buyerAlias.length} chars) -- use a short alias/internal reference, not pasted content`);
    }
    const hits = scanForPrivateData(d.buyerAlias);
    if (hits.length > 0) errors.push(`buyerAlias contains forbidden content: ${hits.join(', ')}`);
  }

  // --- Budget cap ---
  if (d.budgetCapUsd === undefined || d.budgetCapUsd === null || d.budgetCapUsd === '') {
    errors.push('budgetCapUsd is required');
  } else {
    const cap = Number(d.budgetCapUsd);
    if (!Number.isFinite(cap) || cap <= 0) {
      errors.push('budgetCapUsd must be a positive number');
    } else if (cap > MAX_BUDGET_CAP_USD) {
      errors.push(`budgetCapUsd ($${cap}) exceeds the tiny-capped-pilot ceiling of $${MAX_BUDGET_CAP_USD} -- this is a controlled pilot, not a real launch`);
    }
  }

  // --- Dates ---
  const start = parseDate(d.startDate);
  const end = parseDate(d.endDate);
  if (!start) errors.push('startDate is required and must be YYYY-MM-DD');
  if (!end) errors.push('endDate is required and must be YYYY-MM-DD');
  if (start && end && end < start) errors.push('endDate must not be before startDate');

  // --- Hardcoded-true safety flags ---
  if (d.manualRevenueRecordRequired !== true) errors.push('manualRevenueRecordRequired must be true');
  if (d.noRealPayouts !== true) errors.push('noRealPayouts must be true');
  if (d.noPublicRelease !== true) errors.push('noPublicRelease must be true');
  if (d.finalPreflightRequired !== true) errors.push('finalPreflightRequired must be true');

  // --- Rollback confirmation (warning only if missing -- may not be confirmed until launch day) ---
  if (d.rollbackConfirmed !== true) {
    warnings.push('rollbackConfirmed is not yet true -- confirm the rollback plan before launch');
  }

  // --- Notes: same private-data scan if present ---
  if (typeof d.notes === 'string' && d.notes.length > 0) {
    const hits = scanForPrivateData(d.notes);
    if (hits.length > 0) errors.push(`notes contains forbidden content: ${hits.join(', ')}`);
    if (d.notes.length > 1000) warnings.push('notes is unusually long -- keep sanitized notes short');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Generates a pilot ID like "pilot-20260704-ab12" if one wasn't supplied. */
function generatePilotId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = Math.random().toString(36).slice(2, 6);
  return `pilot-${datePart}-${randPart}`;
}

/**
 * Builds a complete pilot-setup object from partial input, applying safe
 * defaults for the hardcoded-true safety flags. Does not validate --
 * call validatePilotSetup() on the result separately.
 */
function buildPilotSetup(partial) {
  const now = new Date().toISOString();
  return {
    pilotId: partial.pilotId || generatePilotId(),
    createdAt: partial.createdAt || now,
    ownerInitials: partial.ownerInitials || '',
    rollbackOwnerInitials: partial.rollbackOwnerInitials || '',
    platform: partial.platform || ONLY_ALLOWED_PLATFORM,
    buyerAlias: partial.buyerAlias || '',
    budgetCapUsd: partial.budgetCapUsd ?? '',
    startDate: partial.startDate || '',
    endDate: partial.endDate || '',
    manualRevenueRecordRequired: true,
    noRealPayouts: true,
    noPublicRelease: true,
    chatgptOnly: true,
    rollbackConfirmed: partial.rollbackConfirmed === true,
    finalPreflightRequired: true,
    notes: partial.notes || '',
    status: partial.status || 'DRAFT',
  };
}

/** Derives the correct status from a pilot-setup object + its validation result. */
function deriveStatus(setup, validation) {
  if (setup.status === 'DRAFT_NEEDS_HUMAN_COMPLETION') return 'DRAFT_NEEDS_HUMAN_COMPLETION';
  if (!validation.valid) return 'HOLD';
  return 'READY';
}

module.exports = {
  ONLY_ALLOWED_PLATFORM,
  MAX_BUDGET_CAP_USD,
  MAX_FREE_TEXT_LEN,
  STATUSES,
  UNSUPPORTED_PLATFORM_LABELS,
  FORBIDDEN_PATTERNS,
  scanForPrivateData,
  validatePilotSetup,
  generatePilotId,
  buildPilotSetup,
  deriveStatus,
};
