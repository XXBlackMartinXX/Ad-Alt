#!/usr/bin/env node
'use strict';
/**
 * Dry-run-by-default installer for the example Codex native hook config
 * (docs/internal-beta/platforms/examples/codex-hooks.example.json).
 *
 * Codex's hooks.json is a flat, event-name-keyed object (no wrapping
 * "hooks" key, unlike Claude Code's settings.json) -- see
 * NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md §4 for the schema
 * source. This installer substitutes the example's placeholder script
 * path with this repo's real, resolved absolute path to
 * scripts/codex-hook.js, since no confirmed path-placeholder variable
 * (analogous to Claude Code's ${CLAUDE_PROJECT_DIR}) was found in
 * Codex's documentation this sprint.
 *
 * Default behavior (no --write): prints exactly what WOULD be written
 * and to which target path, without touching any file.
 *
 * Usage:
 *   node scripts/install-codex-hooks.js                          (dry-run, default target)
 *   node scripts/install-codex-hooks.js --target <path>          (dry-run, custom target)
 *   node scripts/install-codex-hooks.js --target <path> --write  (actually writes)
 *
 * NEVER run --write against your real ~/.codex/hooks.json without
 * first reading CODEX_CLI_NATIVE_HOOK_INTEGRATION.md and
 * CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md, and without going
 * through Codex's own hook trust/review flow. Always point --target at
 * a disposable test project's hooks.json first.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseInstallArgs,
  readExistingConfig,
  backupIfExists,
  validateJsonRoundTrip,
  writeAndVerify,
  rollbackInstructions,
} = require('./lib/native-hook-installer.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXAMPLE_CONFIG_PATH = path.join(
  REPO_ROOT, 'docs', 'internal-beta', 'platforms', 'examples', 'codex-hooks.example.json',
);
const REAL_HOOK_SCRIPT_POSIX = path.join(REPO_ROOT, 'scripts', 'codex-hook.js').split(path.sep).join('/');
const REAL_HOOK_SCRIPT_WIN = path.join(REPO_ROOT, 'scripts', 'codex-hook.js').split('/').join('\\');

function defaultTargetPath() {
  return path.join(os.homedir(), '.codex', 'hooks.json');
}

function substitutePlaceholders(exampleConfig) {
  let text = JSON.stringify(exampleConfig);
  text = text.replaceAll('node /ABSOLUTE/PATH/TO/THIS/REPO/scripts/codex-hook.js', `node ${REAL_HOOK_SCRIPT_POSIX}`);
  text = text.replaceAll('node C:\\\\ABSOLUTE\\\\PATH\\\\TO\\\\THIS\\\\REPO\\\\scripts\\\\codex-hook.js', `node ${REAL_HOOK_SCRIPT_WIN.replaceAll('\\', '\\\\')}`);
  return JSON.parse(text);
}

function sameHookGroup(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeHooks(existingHooks, exampleHooks) {
  const merged = { ...(existingHooks || {}) };
  const addedEvents = [];
  for (const [eventName, exampleGroups] of Object.entries(exampleHooks)) {
    const existingGroups = Array.isArray(merged[eventName]) ? merged[eventName] : [];
    const toAdd = exampleGroups.filter(
      (group) => !existingGroups.some((existingGroup) => sameHookGroup(existingGroup, group)),
    );
    if (toAdd.length > 0) {
      merged[eventName] = [...existingGroups, ...toAdd];
      addedEvents.push(eventName);
    } else if (!merged[eventName]) {
      merged[eventName] = existingGroups;
    }
  }
  return { merged, addedEvents };
}

function main() {
  const { targetOverride, write } = parseInstallArgs(process.argv.slice(2));
  const targetPath = targetOverride || defaultTargetPath();

  console.log('[>>] Codex Native Hook Installer (dry-run by default)');
  console.log('------------------------------------------------------------');
  console.log(`Target hooks.json file: ${targetPath}`);
  console.log(`Mode: ${write ? 'WRITE (will modify the target file)' : 'DRY RUN (no files will be touched)'}`);
  console.log('');
  console.log('Reminder: Codex does not auto-trust project- or file-level hooks.');
  console.log('You must separately review and trust this hook definition through');
  console.log('Codex\'s own trust/review flow before it will actually run.');

  const exampleConfig = substitutePlaceholders(
    JSON.parse(fs.readFileSync(EXAMPLE_CONFIG_PATH, 'utf8')),
  );
  const existing = readExistingConfig(targetPath);

  if (existing.unparsable) {
    console.log('');
    console.log('[FAIL] Target file exists but is not valid JSON. Refusing to modify it.');
    console.log('       Fix or remove the file manually, then re-run.');
    process.exit(1);
  }

  const { merged: mergedHooks, addedEvents } = mergeHooks(existing.parsed, exampleConfig);

  console.log('');
  console.log(`Target file currently exists: ${existing.existed}`);
  console.log(`Hook events that would be added/ensured: ${addedEvents.length > 0 ? addedEvents.join(', ') : '(none -- already present)'}`);
  console.log('');
  console.log('Planned resulting hooks.json content:');
  console.log(JSON.stringify(mergedHooks, null, 2));

  const { ok: validationOk } = validateJsonRoundTrip(mergedHooks);
  console.log('');
  console.log(`Config validation (JSON round-trip): ${validationOk ? 'PASS' : 'FAIL'}`);
  if (!validationOk) {
    console.log('[FAIL] Generated config failed validation -- refusing to write.');
    process.exit(1);
  }

  if (!write) {
    console.log('');
    console.log('Dry run complete. No files were modified. Re-run with --write to apply.');
    process.exit(0);
  }

  const backupPath = backupIfExists(targetPath);
  const { text } = validateJsonRoundTrip(mergedHooks);
  const writeOk = writeAndVerify(targetPath, text);

  console.log('');
  console.log(`Backup created: ${backupPath || '(none needed -- target did not exist)'}`);
  console.log(`Write + verify: ${writeOk ? 'PASS' : 'FAIL'}`);
  console.log(rollbackInstructions(targetPath, backupPath));

  process.exit(writeOk ? 0 : 1);
}

main();
