#!/usr/bin/env node
'use strict';
/**
 * Dry-run-by-default installer for the example Claude Code native hook
 * config (docs/internal-beta/platforms/examples/claude-code-hooks.example.json).
 *
 * Default behavior (no --write): prints exactly what WOULD be written
 * and to which target path, without touching any file.
 *
 * With --write: backs up the target file if it exists, merges the
 * example's SessionStart/Stop/SessionEnd hook entries into it
 * (idempotent -- running twice does not duplicate entries), validates
 * the result via a JSON round-trip, writes it, and re-reads it to
 * confirm the write succeeded.
 *
 * Usage:
 *   node scripts/install-claude-code-hooks.js                          (dry-run, default target)
 *   node scripts/install-claude-code-hooks.js --target <path>          (dry-run, custom target)
 *   node scripts/install-claude-code-hooks.js --target <path> --write  (actually writes)
 *
 * NEVER run --write against your real ~/.claude/settings.json without
 * first reading CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md and
 * CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md. Always point --target
 * at a disposable test project's .claude/settings.local.json first.
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
  REPO_ROOT, 'docs', 'internal-beta', 'platforms', 'examples', 'claude-code-hooks.example.json',
);

function defaultTargetPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function sameHookGroup(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Merges exampleHooks into existingHooks, appending new groups per event, never duplicating. */
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

  console.log('[>>] Claude Code Native Hook Installer (dry-run by default)');
  console.log('------------------------------------------------------------');
  console.log(`Target settings file: ${targetPath}`);
  console.log(`Mode: ${write ? 'WRITE (will modify the target file)' : 'DRY RUN (no files will be touched)'}`);

  const exampleConfig = JSON.parse(fs.readFileSync(EXAMPLE_CONFIG_PATH, 'utf8'));
  const existing = readExistingConfig(targetPath);

  if (existing.unparsable) {
    console.log('');
    console.log('[FAIL] Target file exists but is not valid JSON. Refusing to modify it.');
    console.log('       Fix or remove the file manually, then re-run.');
    process.exit(1);
  }

  const { merged: mergedHooks, addedEvents } = mergeHooks(existing.parsed.hooks, exampleConfig.hooks);
  const mergedConfig = { ...existing.parsed, hooks: mergedHooks };
  if (mergedConfig.disableAllHooks === undefined) mergedConfig.disableAllHooks = false;

  console.log('');
  console.log(`Target file currently exists: ${existing.existed}`);
  console.log(`Hook events that would be added/ensured: ${addedEvents.length > 0 ? addedEvents.join(', ') : '(none -- already present)'}`);
  console.log('');
  console.log('Planned resulting "hooks" section:');
  console.log(JSON.stringify(mergedHooks, null, 2));

  const { ok: validationOk } = validateJsonRoundTrip(mergedConfig);
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
  const { text } = validateJsonRoundTrip(mergedConfig);
  const writeOk = writeAndVerify(targetPath, text);

  console.log('');
  console.log(`Backup created: ${backupPath || '(none needed -- target did not exist)'}`);
  console.log(`Write + verify: ${writeOk ? 'PASS' : 'FAIL'}`);
  console.log(rollbackInstructions(targetPath, backupPath));

  process.exit(writeOk ? 0 : 1);
}

main();
