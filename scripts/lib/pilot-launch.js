'use strict';
/**
 * Shared helpers for the controlled ChatGPT pilot launch workflow
 * (scripts/launch-controlled-pilot.js, scripts/closeout-controlled-
 * pilot.js, scripts/pilot-status.js).
 *
 * Everything here is either pure validation logic or safe, opt-in local
 * automation (opening a file with the OS default app, opening a fresh
 * disposable Chrome profile pointed at chatgpt.com's root URL). None of
 * it ever logs in, types/submits a prompt, reads page/DOM/chat content,
 * or touches cookies/tokens/storage -- see LIVE_VERIFICATION_SAFETY_POLICY.md
 * and CONTROLLED_REVENUE_PILOT_CRITERIA.md for the governing rules this
 * module must never violate.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { validatePilotSetup } = require('./pilot-setup.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const INSTANCES_DIR = process.env.PROMPTPROFIT_PILOT_INSTANCES_DIR
  || path.join(REPO_ROOT, 'docs', 'internal-beta', 'revenue-pilot', 'instances');

const CHATGPT_URL = 'https://chatgpt.com/';

/**
 * Combines the standard pilot-setup validation with the extra hard
 * requirements a real launch (not just a saved setup) must additionally
 * satisfy: the instance must actually be READY (not just individually
 * valid-but-still-DRAFT), and the rollback plan must be confirmed --
 * validatePilotSetup() only warns on a missing rollback confirmation
 * (since it may legitimately not be confirmed yet at setup time), but
 * launch is the point past which that can no longer be true.
 */
function validateLaunchReadiness(setup) {
  const base = validatePilotSetup(setup);
  const errors = [...base.errors];
  const warnings = [...base.warnings];

  if (!setup || setup.status !== 'READY') {
    errors.push(`pilot status must be READY to launch (got: ${JSON.stringify(setup ? setup.status : undefined)})`);
  }
  if (!setup || setup.rollbackConfirmed !== true) {
    errors.push('rollbackConfirmed must be true to launch');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Loads and parses a pilot instance's PILOT_SETUP.json, if present. */
function loadPilotSetup(pilotId) {
  const instanceDir = path.join(INSTANCES_DIR, pilotId);
  const setupJsonPath = path.join(instanceDir, 'PILOT_SETUP.json');
  if (!fs.existsSync(setupJsonPath)) {
    return { instanceDir, setupJsonPath, exists: false, setup: null, parseError: null };
  }
  try {
    const setup = JSON.parse(fs.readFileSync(setupJsonPath, 'utf8'));
    return { instanceDir, setupJsonPath, exists: true, setup, parseError: null };
  } catch (err) {
    return { instanceDir, setupJsonPath, exists: true, setup: null, parseError: String(err) };
  }
}

/** Lists launch-sessions/<TIMESTAMP> subfolders for a pilot, newest first. */
function listLaunchSessions(pilotId) {
  const sessionsDir = path.join(INSTANCES_DIR, pilotId, 'launch-sessions');
  if (!fs.existsSync(sessionsDir)) return [];
  return fs.readdirSync(sessionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
}

/** Builds a filesystem-safe launch-session timestamp folder name. */
function makeSessionTimestamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * Locates a Chrome/Chromium executable across platforms. Mirrors the
 * same lookup already used by scripts/launch-no-login-live-smoke.js.
 */
function findChromeExecutable() {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Opens a single local file with the OS default application (e.g. the
 * default markdown/text viewer). Never reads the file's content itself,
 * never blocks, and always degrades to a no-op + reported reason rather
 * than throwing (there may be no display/default-app configured, as in
 * a headless CI/remote sandbox).
 */
function openFileWithDefaultApp(filePath) {
  if (!fs.existsSync(filePath)) {
    return { opened: false, reason: `file does not exist: ${filePath}` };
  }
  try {
    let result;
    if (process.platform === 'win32') {
      // `cmd /c start "" <path>` is the standard safe way to open a file
      // with its registered default app on Windows without a shell
      // re-interpreting the path.
      result = spawnSync('cmd', ['/c', 'start', '""', filePath], { stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      result = spawnSync('open', [filePath], { stdio: 'ignore' });
    } else {
      result = spawnSync('xdg-open', [filePath], { stdio: 'ignore' });
    }
    if (result.error) return { opened: false, reason: result.error.message };
    return { opened: true, reason: '' };
  } catch (err) {
    return { opened: false, reason: err.message };
  }
}

/**
 * Opens a fresh, disposable Chrome profile with the production browser
 * extension loaded, pointed at chatgpt.com's root URL only. Non-blocking
 * (spawned detached) so the launch command can finish and hand control
 * to the human operator immediately.
 *
 * This function DOES NOT and NEVER WILL: log in, fill in a credential,
 * type or submit a prompt, read page/DOM/chat content, inspect cookies/
 * tokens/storage, or capture a screenshot/video/trace. Once spawned,
 * nothing in this process ever drives the opened page again -- control
 * passes entirely to the human from that point on.
 */
function openChatGptBrowserSurface({ buildExtension = true } = {}) {
  const extensionDir = path.join(REPO_ROOT, 'apps', 'browser-extension');
  const distDir = path.join(extensionDir, 'dist');

  if (buildExtension) {
    const { runPnpm } = require('./run-command.js');
    const build = runPnpm(['--filter', '@ad-alt/browser-extension', 'build'], { cwd: REPO_ROOT });
    if (!build.ok) {
      return { opened: false, reason: `extension build failed (status=${build.status})` };
    }
  }
  if (!fs.existsSync(distDir)) {
    return { opened: false, reason: `extension build output not found at ${distDir}` };
  }

  const chromeExe = findChromeExecutable();
  if (!chromeExe) {
    return { opened: false, reason: 'no compatible Chrome/Chromium executable found on this machine' };
  }

  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptprofit-pilot-launch-'));
  const args = [
    `--user-data-dir=${tempProfileDir}`,
    `--disable-extensions-except=${distDir}`,
    `--load-extension=${distDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    CHATGPT_URL,
  ];
  if (process.platform !== 'win32') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  try {
    const child = spawn(chromeExe, args, { stdio: 'ignore', detached: true });
    child.unref();
    return { opened: true, reason: '', profileDir: tempProfileDir, url: CHATGPT_URL };
  } catch (err) {
    return { opened: false, reason: err.message };
  }
}

module.exports = {
  REPO_ROOT,
  INSTANCES_DIR,
  CHATGPT_URL,
  validateLaunchReadiness,
  loadPilotSetup,
  listLaunchSessions,
  makeSessionTimestamp,
  findChromeExecutable,
  openFileWithDefaultApp,
  openChatGptBrowserSurface,
};
