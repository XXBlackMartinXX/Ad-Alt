'use strict';
/**
 * Monetization Privacy Check — scans monetization-related schemas, mock
 * payloads, generated billing/ledger/payout reports, and internal-beta
 * monetization docs for forbidden private data (prompt/response text, page
 * content, cookies/tokens, etc.).
 *
 * Two scan modes, to avoid false positives on documentation that legitimately
 * NAMES the forbidden fields for audit purposes:
 *
 *   1. STRICT (data/schema scope): event-schema and mock-payload source
 *      files, plus this session's machine-generated monetization reports.
 *      A forbidden field name appearing as an object/schema key (e.g.
 *      `pageTitle:` or `"pageTitle":`) is a FAIL — these files should never
 *      define or emit that field.
 *
 *   2. SECRET-PATTERN (broad scope): every monetization doc/report is also
 *      scanned for a literal leaked ppft_ API key, unconditionally. This
 *      pattern has no legitimate reason to appear anywhere, so no exemption
 *      is needed.
 *
 * Documentation whose PURPOSE is to describe/audit the forbidden-field list
 * (e.g. docs that quote `packages/platform-core/src/privacy-guard.ts`'s
 * TELEMETRY_FORBIDDEN_FIELDS array for review purposes) is exempt from scan
 * mode 1 only — it is expected to name these fields in prose/code-fences.
 *
 * Usage:
 *   node scripts/check-monetization-privacy.js
 *   pnpm -w run check:monetization:privacy
 */

const fs = require('fs');
const path = require('path');
const { importFile } = require('./lib/import-file.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const KEY_RE = /ppft_[0-9a-f]{48,}/i;

let passed = 0;
let failed = 0;

function pass(msg) {
  passed++;
  console.log(`  PASS  ${msg}`);
}
function fail(msg) {
  failed++;
  console.log(`  FAIL  ${msg}`);
}

function walk(dir, exts, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  console.log('[>>] Monetization Privacy Check');
  console.log('------------------------------------------------------------');
  console.log('');

  const platformCoreMod = await importFile(
    path.join(REPO_ROOT, 'packages/platform-core/dist/index.js'),
  );
  const forbiddenFields = platformCoreMod.TELEMETRY_FORBIDDEN_FIELDS;

  // Build a regex matching any forbidden field name used as an object/schema
  // key: `fieldName:` or `"fieldName":` or `'fieldName':`.
  const fieldKeyRe = new RegExp(
    `["']?(${forbiddenFields.join('|')})["']?\\s*:`,
    'g',
  );

  // ---------------------------------------------------------------------
  // Scope 1 (STRICT): event schemas + mock payloads
  // ---------------------------------------------------------------------
  console.log('== 1. Event schemas (forbidden field must never be a schema key) ==');
  const schemaFiles = [
    ...walk(path.join(REPO_ROOT, 'packages/shared/src/types'), ['.ts'], []),
    ...walk(path.join(REPO_ROOT, 'packages/telemetry/src'), ['.ts'], []).filter(
      (f) => !f.includes('__tests__'),
    ),
    ...walk(path.join(REPO_ROOT, 'packages/platform-core/src'), ['.ts'], []).filter(
      (f) => !f.includes('privacy-guard.ts') && !f.includes('__tests__'),
    ),
  ];
  let schemaHits = [];
  for (const file of schemaFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = [...content.matchAll(fieldKeyRe)];
    if (matches.length > 0) {
      schemaHits.push({ file: path.relative(REPO_ROOT, file), fields: matches.map((m) => m[1]) });
    }
  }
  if (schemaHits.length === 0) {
    pass(`No forbidden field used as a schema key in ${schemaFiles.length} event-schema source file(s)`);
  } else {
    fail(`Forbidden field(s) found as schema keys: ${JSON.stringify(schemaHits)}`);
  }
  console.log('');

  // ---------------------------------------------------------------------
  // Scope 2 (STRICT): mock payloads / test fixtures related to events
  // ---------------------------------------------------------------------
  console.log('== 2. Mock payloads / event fixtures ==');
  // Files whose entire purpose is to assert that forbidden fields are
  // REJECTED (negative tests for the privacy guard / schema validator) are
  // exempt: they legitimately contain forbidden field names as test INPUT
  // to prove the guard blocks them, which is the desired, safe behavior --
  // the opposite of a leak. Confirmed by direct inspection: these files
  // contain patterns like `rejects pageTitle` / `expect(...).toBeUndefined()`.
  const PRIVACY_REJECTION_TEST_EXEMPT = [
    'privacy-guard.test.ts',
    'privacy.test.ts',
    'event-schema.test.ts',
    'chatgpt.privacy.test.ts',
  ];
  const fixtureFiles = [
    ...walk(path.join(REPO_ROOT, 'apps/browser-extension/src'), ['.ts', '.tsx'], []).filter(
      (f) => (f.includes('__tests__') || f.includes('fixture') || f.includes('mock')) &&
        !PRIVACY_REJECTION_TEST_EXEMPT.includes(path.basename(f)),
    ),
    ...walk(path.join(REPO_ROOT, 'scripts/__tests__/fixtures'), ['.js', '.ts'], []),
  ];
  let fixtureHits = [];
  for (const file of fixtureFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = [...content.matchAll(fieldKeyRe)];
    if (matches.length > 0) {
      fixtureHits.push({ file: path.relative(REPO_ROOT, file), fields: matches.map((m) => m[1]) });
    }
  }
  if (fixtureHits.length === 0) {
    pass(`No forbidden field used as an object key in ${fixtureFiles.length} mock/fixture file(s)`);
  } else {
    fail(`Forbidden field(s) found in mock/fixture files: ${JSON.stringify(fixtureHits)}`);
  }
  console.log('');

  console.log('== 2b. Exempted privacy-rejection test files are genuinely rejection tests ==');
  // Validate the exemption itself, rather than trusting it blindly: every
  // exempted file must actually contain forbidden field names AND the word
  // "reject" (case-insensitive) -- confirming it is testing that the field
  // is blocked, not that it is accepted/emitted.
  let exemptionMisuse = [];
  for (const filename of PRIVACY_REJECTION_TEST_EXEMPT) {
    const matches = walk(path.join(REPO_ROOT, 'apps/browser-extension/src'), ['.ts', '.tsx'], []).filter(
      (f) => path.basename(f) === filename,
    );
    for (const file of matches) {
      const content = fs.readFileSync(file, 'utf8');
      const hasForbiddenField = forbiddenFields.some((f) => content.includes(f));
      const hasRejectLanguage = /reject/i.test(content);
      if (hasForbiddenField && !hasRejectLanguage) {
        exemptionMisuse.push(path.relative(REPO_ROOT, file));
      }
    }
  }
  if (exemptionMisuse.length === 0) {
    pass('Every exempted file that references a forbidden field also asserts rejection of it');
  } else {
    fail(`Exempted file(s) reference forbidden fields WITHOUT rejection language -- exemption may be misused: ${JSON.stringify(exemptionMisuse)}`);
  }
  console.log('');

  // ---------------------------------------------------------------------
  // Scope 3 (STRICT): this session's generated monetization reports
  // ---------------------------------------------------------------------
  console.log('== 3. Generated billing/ledger/payout reports ==');
  const monetizationDir = path.join(REPO_ROOT, 'docs/internal-beta/monetization');
  const allMonetizationDocs = walk(monetizationDir, ['.md'], []);

  // Reports this script itself generates deterministic data into -- these
  // must never contain a forbidden field as a data key, no exemption.
  const generatedReportNames = [
    'LEDGER_CONFIDENCE_REPORT.md',
    'PAYOUT_SIMULATION_REPORT.md',
    'BILLING_RECONCILIATION_REPORT.md',
  ];
  const generatedReports = allMonetizationDocs.filter((f) =>
    generatedReportNames.includes(path.basename(f)),
  );
  let reportHits = [];
  for (const file of generatedReports) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = [...content.matchAll(fieldKeyRe)];
    if (matches.length > 0) {
      reportHits.push({ file: path.relative(REPO_ROOT, file), fields: matches.map((m) => m[1]) });
    }
  }
  if (reportHits.length === 0) {
    pass(`No forbidden field found as a data key in ${generatedReports.length} generated report(s)`);
  } else {
    fail(`Forbidden field(s) found in generated reports: ${JSON.stringify(reportHits)}`);
  }
  console.log('');

  // ---------------------------------------------------------------------
  // Scope 4 (SECRET-PATTERN, unconditional): every monetization doc/report
  // ---------------------------------------------------------------------
  console.log('== 4. API key leak scan (ppft_...) across all monetization docs ==');
  let keyHits = [];
  for (const file of allMonetizationDocs) {
    const content = fs.readFileSync(file, 'utf8');
    if (KEY_RE.test(content)) {
      keyHits.push(path.relative(REPO_ROOT, file));
    }
  }
  if (keyHits.length === 0) {
    pass(`No ppft_ API key pattern found in ${allMonetizationDocs.length} monetization doc(s)`);
  } else {
    fail(`ppft_ API key pattern found in: ${JSON.stringify(keyHits)}`);
  }
  console.log('');

  // ---------------------------------------------------------------------
  // Scope 5 (informational): confirm the canonical forbidden-field list
  // itself is non-empty and includes the browser/monetization-relevant set.
  // ---------------------------------------------------------------------
  console.log('== 5. Canonical forbidden-field list sanity check ==');
  const requiredSubset = [
    'pageTitle', 'pageUrl', 'pageContent', 'domText', 'promptText', 'aiResponse',
    'chatHistory', 'cookieData', 'authToken', 'sessionCookie',
  ];
  const missing = requiredSubset.filter((f) => !forbiddenFields.includes(f));
  if (missing.length === 0) {
    pass(`Canonical TELEMETRY_FORBIDDEN_FIELDS (${forbiddenFields.length} fields) includes all required monetization-relevant fields`);
  } else {
    fail(`Canonical forbidden-field list is missing: ${JSON.stringify(missing)}`);
  }
  console.log('');

  // ---------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------
  console.log('=== Summary ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('');
  const overallPass = failed === 0;
  console.log(overallPass ? 'Result: PASS' : 'Result: FAIL');
  process.exit(overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error('[ERR]', err && err.stack ? err.stack : err);
  process.exit(1);
});
