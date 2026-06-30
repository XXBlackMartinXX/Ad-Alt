'use strict';
/**
 * Cross-platform PowerShell script runner.
 *
 * Detects `pwsh` (PowerShell Core 7+) first, then falls back to `powershell`
 * (Windows PowerShell 5.1) so scripts work on Windows 11 without needing to
 * install PowerShell Core.
 *
 * Usage (from npm scripts):
 *   node scripts/run-ps1.js <relative/path/to/script.ps1> [args...]
 *
 * Extra args passed after `--` in `pnpm run` are forwarded automatically:
 *   pnpm -w run smoke:chatgpt:live:stability -- -Help -Runs 5
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const [, , scriptRelPath, ...scriptArgs] = process.argv;

if (!scriptRelPath) {
  process.stderr.write(
    'Usage: node scripts/run-ps1.js <script.ps1> [args...]\n',
  );
  process.exit(1);
}

const absScript = path.resolve(process.cwd(), scriptRelPath);

if (!fs.existsSync(absScript)) {
  process.stderr.write(`[ERR] Script not found: ${absScript}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// PowerShell detection
// ---------------------------------------------------------------------------

/**
 * Return the first available PowerShell executable name, or null if none found.
 * On Windows: tries pwsh (Core) then powershell (Windows PS 5.1).
 * On other platforms: tries pwsh only (no inbox Windows PowerShell).
 */
function detectPowerShell() {
  const candidates =
    process.platform === 'win32' ? ['pwsh', 'powershell'] : ['pwsh'];

  for (const exe of candidates) {
    // A missing executable sets probe.error (ENOENT); a present one does not.
    const probe = spawnSync(exe, ['-NoProfile', '-Command', 'exit 0'], {
      stdio: 'ignore',
    });
    if (!probe.error) return exe;
  }
  return null;
}

const ps = detectPowerShell();

if (!ps) {
  if (process.platform === 'win32') {
    process.stderr.write(
      '[ERR] No PowerShell executable found (tried: pwsh, powershell).\n' +
        '      Windows PowerShell 5.1 is built-in — check your PATH.\n' +
        '      To install PowerShell Core 7+: https://aka.ms/powershell\n',
    );
  } else {
    process.stderr.write(
      '[ERR] "pwsh" (PowerShell Core) not found.\n' +
        '      Install: https://aka.ms/powershell\n',
    );
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Invoke the script
// ---------------------------------------------------------------------------

const result = spawnSync(
  ps,
  ['-ExecutionPolicy', 'Bypass', '-File', absScript, ...scriptArgs],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
