#!/usr/bin/env node
'use strict';
/**
 * Windows-safe runner for this repo's scripts/__tests__ suite.
 *
 * The root `test:scripts` command used to be:
 *   node --test scripts/__tests__/*.test.js
 * which relies on the shell expanding the glob before Node ever sees it.
 * pnpm on Windows invokes package.json scripts via cmd.exe, which does
 * NOT expand globs -- so `*.test.js` reaches Node as a literal argument,
 * and Node reports "Could not find: ...\scripts\__tests__\*.test.js".
 *
 * This script expands the glob itself via Node's own fs/path (portable
 * on every OS) and invokes `node --test` with explicit, real file
 * paths, so no shell glob expansion is ever required.
 *
 * Usage:
 *   node scripts/run-script-tests.js
 *   pnpm -w run test:scripts
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { cleanTestEnv } = require('./lib/run-command.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(REPO_ROOT, 'scripts', '__tests__');

function main() {
  if (!fs.existsSync(TESTS_DIR)) {
    console.error(`Test directory not found: ${TESTS_DIR}`);
    process.exit(1);
  }

  const testFiles = fs.readdirSync(TESTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => path.join(TESTS_DIR, entry.name))
    .sort();

  if (testFiles.length === 0) {
    console.error(`No *.test.js files found under ${TESTS_DIR}`);
    process.exit(1);
  }

  console.log(`[>>] Running ${testFiles.length} test file(s) from scripts/__tests__/`);

  // Strip NODE_TEST_CONTEXT before spawning: if this runner is ever
  // itself invoked from within an active `node --test` run, that env
  // var would otherwise be inherited by this child and make Node's test
  // runner treat this as a forbidden recursive run, silently skipping
  // every file here with only a console warning.
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: cleanTestEnv(process.env),
  });

  if (result.error) {
    console.error(`Failed to spawn node --test: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`node --test was terminated by signal ${result.signal}`);
    process.exit(1);
  }
  process.exit(result.status === null ? 1 : result.status);
}

main();
