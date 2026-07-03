#!/usr/bin/env node
'use strict';
/**
 * Fixture-only terminal/CLI integration prototype -- CLI entry point.
 *
 * Demonstrates (with zero real terminal access) the safe lifecycle-only
 * pattern designed in
 * docs/internal-beta/platforms/DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md.
 * See scripts/lib/terminal-fixture.js for the actual logic and its privacy
 * guarantees.
 *
 * This script does not spawn any real process, wrap any real command, or
 * read any real terminal content. Running it is always safe.
 *
 * Usage:
 *   node scripts/terminal-fixture-runner.js
 */

const {
  runSyntheticWaitStateFixture,
  getSyntheticFlags,
  findForbiddenFields,
} = require('./lib/terminal-fixture.js');

function main() {
  console.log('[>>] Terminal fixture-only prototype (synthetic data only -- no real terminal access)');
  console.log('------------------------------------------------------------');

  console.log('\n== Normal (not kill-switched) ==');
  const normal = runSyntheticWaitStateFixture(getSyntheticFlags());
  console.log(JSON.stringify(normal, null, 2));
  const normalForbidden = normal.event ? findForbiddenFields(normal.event) : [];
  console.log(`Forbidden fields found: ${normalForbidden.length === 0 ? 'none' : JSON.stringify(normalForbidden)}`);

  console.log('\n== Global kill-switch active ==');
  const killed = runSyntheticWaitStateFixture(getSyntheticFlags({ killSwitchEnabled: true }));
  console.log(JSON.stringify(killed, null, 2));

  console.log('\n== Per-adapter kill-switch (disabledAdapters) ==');
  const disabled = runSyntheticWaitStateFixture(getSyntheticFlags({ disabledAdapters: ['manual'] }));
  console.log(JSON.stringify(disabled, null, 2));

  const ok =
    normal.rendered === true &&
    normalForbidden.length === 0 &&
    killed.rendered === false &&
    disabled.rendered === false;

  console.log('\n' + (ok ? '[OK] Prototype behaves as designed.' : '[FAIL] Prototype did not behave as expected.'));
  process.exit(ok ? 0 : 1);
}

main();
