'use strict';
/**
 * Shared dry-run-by-default installer helpers for the Claude Code and
 * Codex native hook example configs. Used by scripts/install-claude-
 * code-hooks.js and scripts/install-codex-hooks.js.
 *
 * Safety rules enforced here (see NATIVE_HOOK_PRIVACY_CONTRACT.md and
 * this sprint's Phase 8 requirements):
 *   - Never writes anything unless the caller explicitly requests it
 *     (--write flag, handled by the caller, not this library).
 *   - Always backs up an existing target file before overwriting it.
 *   - Validates the JSON it is about to write by round-tripping it
 *     through JSON.parse/JSON.stringify before writing, and again by
 *     re-reading the file after writing.
 *   - Uses only Node's `path`/`os` modules for all paths, so behavior
 *     is correct on Windows, macOS, and Linux alike.
 *   - Never writes secrets, account identifiers, or raw hook payloads
 *     -- the only content ever written is the hooks wiring itself.
 */

const fs = require('fs');
const path = require('path');

/** Parses --target <path> and --write from argv. Returns { targetOverride, write }. */
function parseInstallArgs(argv) {
  const targetIdx = argv.indexOf('--target');
  return {
    targetOverride: targetIdx === -1 ? undefined : argv[targetIdx + 1],
    write: argv.includes('--write'),
  };
}

/** Reads and JSON.parses an existing config file. Returns {} if missing or unparsable. */
function readExistingConfig(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return { existed: false, parsed: {}, unparsable: false };
  }
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    return { existed: true, parsed: JSON.parse(raw), unparsable: false };
  } catch {
    return { existed: true, parsed: null, unparsable: true };
  }
}

/** Backs up an existing file to `<path>.bak.<timestamp>`. Returns the backup path, or null if nothing existed. */
function backupIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${targetPath}.bak.${stamp}`;
  fs.copyFileSync(targetPath, backupPath);
  return backupPath;
}

/** Round-trips a value through JSON.stringify/JSON.parse and confirms it survives unchanged. */
function validateJsonRoundTrip(value) {
  const text = JSON.stringify(value, null, 2);
  const reparsed = JSON.parse(text);
  const ok = JSON.stringify(reparsed) === JSON.stringify(value);
  return { ok, text };
}

/** Ensures the parent directory of `targetPath` exists. */
function ensureParentDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

/** Writes `text` to `targetPath`, then re-reads it to confirm the write succeeded and matches. */
function writeAndVerify(targetPath, text) {
  ensureParentDir(targetPath);
  fs.writeFileSync(targetPath, text, 'utf8');
  const readBack = fs.readFileSync(targetPath, 'utf8');
  return readBack === text;
}

function rollbackInstructions(targetPath, backupPath) {
  if (!backupPath) {
    return `No backup was needed (the target file did not exist). To roll back, delete: ${targetPath}`;
  }
  return `To roll back: copy ${backupPath} back over ${targetPath} (e.g. \`cp "${backupPath}" "${targetPath}"\` or, on Windows, \`copy "${backupPath}" "${targetPath}"\`).`;
}

module.exports = {
  parseInstallArgs,
  readExistingConfig,
  backupIfExists,
  validateJsonRoundTrip,
  ensureParentDir,
  writeAndVerify,
  rollbackInstructions,
};
