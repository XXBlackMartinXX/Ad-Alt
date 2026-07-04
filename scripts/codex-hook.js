#!/usr/bin/env node
'use strict';
/**
 * Codex CLI / Codex IDE extension native hook script. Wired into a
 * Codex hooks.json / inline config.toml [hooks] `command` handler (see
 * docs/internal-beta/platforms/examples/codex-hooks.example.json).
 *
 * Behavior mirrors scripts/claude-code-hook.js exactly (see
 * CODEX_CLI_NATIVE_HOOK_INTEGRATION.md for the full design):
 *   1. Reads the hook's JSON payload from stdin.
 *   2. Immediately normalizes it via @ad-alt/native-hook-adapter's
 *      allowlist normalizer -- every raw field except the recognized
 *      hook_event_name is discarded in-memory and never referenced
 *      again by this script.
 *   3. Respects the local kill-switch/enabled config.
 *   4. Prints only the sanitized, normalized event to stdout (and,
 *      optionally, appends it to a local --log file).
 *   5. Always exits 0 -- purely observational, never blocks or alters
 *      a real Codex session's behavior.
 *
 * Pass --ide to tag events as sourcePlatform "codex_ide" instead of the
 * default "codex_cli" -- both share the same underlying config/hooks
 * engine (see NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md §6), so the
 * same script covers both surfaces.
 *
 * This script does not invoke git or any other subprocess, and makes
 * no network requests -- it only reads stdin, reads its own config
 * file, and writes stdout/an optional local log file.
 */

const fs = require('fs');
const path = require('path');

function parseFlags(argv) {
  const logIdx = argv.indexOf('--log');
  return {
    logPath: logIdx === -1 ? undefined : argv[logIdx + 1],
    ide: argv.includes('--ide'),
  };
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const { logPath, ide } = parseFlags(process.argv.slice(2));
  const rawText = readStdin();

  let event;
  try {
    const distIndex = path.join(
      __dirname, '..', 'packages', 'native-hook-adapter', 'dist', 'index.js',
    );
    const mod = await import(require('url').pathToFileURL(distIndex).href);
    event = mod.handleCodexHook(rawText, { ide, repoCommit: process.env.PROMPTPROFIT_REPO_COMMIT });
  } catch {
    // Package not built, or any other unexpected failure -- fail safe
    // and inert. Never echo the raw input in this fallback path.
    event = {
      sourcePlatform: ide ? 'codex_ide' : 'codex_cli',
      integrationType: 'native_hook',
      hookEventType: 'unrecognized_event',
      hookReceivedAt: new Date().toISOString(),
      adapterVersion: 'unknown',
      repoCommit: process.env.PROMPTPROFIT_REPO_COMMIT || 'unknown',
      killSwitchActive: false,
      dryRun: true,
      sanitizedResult: 'error',
      errorCodeSafeOnly: 'unknown_safe_error',
    };
  }

  const line = JSON.stringify(event);
  process.stdout.write(line + '\n');
  if (logPath) {
    try {
      fs.appendFileSync(logPath, line + '\n', 'utf8');
    } catch {
      // Never fail the hook because the optional log write failed.
    }
  }

  process.exit(0);
}

main();
