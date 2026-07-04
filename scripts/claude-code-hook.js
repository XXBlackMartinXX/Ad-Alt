#!/usr/bin/env node
'use strict';
/**
 * Claude Code native hook script. Wired into a settings.json `hooks`
 * entry as a `command` handler (see
 * docs/internal-beta/platforms/examples/claude-code-hooks.example.json).
 *
 * Behavior (see CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md for the full
 * design):
 *   1. Reads the hook's JSON payload from stdin.
 *   2. Immediately normalizes it via @ad-alt/native-hook-adapter's
 *      allowlist normalizer -- tool_input, tool_response, prompt text,
 *      command text, and every other raw field are discarded in-memory
 *      and never referenced again by this script.
 *   3. Respects the local kill-switch/enabled config
 *      (~/.promptprofit/native-hook-adapter.config.json or
 *      $PROMPTPROFIT_NATIVE_HOOK_CONFIG).
 *   4. Prints only the sanitized, normalized event to stdout (and,
 *      optionally, appends it to a local --log file). Never prints or
 *      writes the raw input anywhere.
 *   5. Always exits 0 and never emits any Claude-Code-recognized
 *      control field (decision, hookSpecificOutput, continue, etc.) --
 *      this hook is purely observational and never blocks or modifies
 *      Claude Code's behavior.
 *
 * This script does not invoke git or any other subprocess, and makes
 * no network requests -- it only reads stdin, reads its own config
 * file, and writes stdout/an optional local log file.
 */

const fs = require('fs');
const path = require('path');

function parseLogFlag(argv) {
  const idx = argv.indexOf('--log');
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const logPath = parseLogFlag(process.argv.slice(2));
  const rawText = readStdin();

  let event;
  try {
    const distIndex = path.join(
      __dirname, '..', 'packages', 'native-hook-adapter', 'dist', 'index.js',
    );
    const mod = await import(require('url').pathToFileURL(distIndex).href);
    event = mod.handleClaudeCodeHook(rawText, process.env.PROMPTPROFIT_REPO_COMMIT);
  } catch {
    // Package not built, or any other unexpected failure -- fail safe
    // and inert. Never echo the raw input in this fallback path.
    event = {
      sourcePlatform: 'claude_code',
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

  // Always exit 0: this hook is purely observational and must never
  // block or otherwise alter Claude Code's own behavior.
  process.exit(0);
}

main();
