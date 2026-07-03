#!/usr/bin/env node
'use strict';
/**
 * No-login live smoke launcher for the Claude/Gemini browser adapters.
 *
 * Builds the production extension, launches a real (headed) Chrome window
 * with a FRESH TEMPORARY profile and the unpacked extension loaded, and
 * navigates directly to the real platform origin. It then blocks until the
 * human operator closes that Chrome window, and finally deletes the
 * temporary profile.
 *
 * See docs/internal-beta/platforms/LIVE_VERIFICATION_SAFETY_POLICY.md for
 * the full rules this script and the human operator must follow. In short:
 *
 * This script DOES:
 *   - build the extension (production bundle, dist/)
 *   - create a fresh, disposable, empty Chrome profile (no prior sessions,
 *     cookies, or saved passwords -- never a real/reused profile)
 *   - launch Chrome with that profile and the unpacked extension loaded
 *   - navigate to the real platform's root URL (origin only)
 *   - print safety instructions and a manual checklist
 *   - print the path to the sanitized result template to fill in afterward
 *
 * This script does NOT and NEVER WILL:
 *   - log in, create an account, or fill in any credential
 *   - solve a CAPTCHA or any security/bot challenge
 *   - type or submit any prompt
 *   - read DOM text, page text, chat content, or prompt/response text
 *   - inspect cookies, auth tokens, localStorage, or sessionStorage
 *   - take a screenshot, record a video, or capture a trace
 *   - save a full URL or conversation ID anywhere
 *   - drive the real page programmatically in any way after launch --
 *     control passes entirely to the human operator at that point.
 *
 * Usage:
 *   node scripts/launch-no-login-live-smoke.js claude
 *   node scripts/launch-no-login-live-smoke.js gemini
 * or via package scripts:
 *   pnpm -w run live:claude:no-login
 *   pnpm -w run live:gemini:no-login
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXTENSION_DIR = path.join(REPO_ROOT, 'apps', 'browser-extension');
const DIST_DIR = path.join(EXTENSION_DIR, 'dist');

const PLATFORMS = {
  claude: {
    label: 'Claude',
    url: 'https://claude.ai/',
    runbook: 'docs/internal-beta/platforms/CLAUDE_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md',
    template: 'docs/internal-beta/platforms/CLAUDE_NO_LOGIN_LIVE_SMOKE_RESULT_TEMPLATE.md',
    resultLog: 'docs/internal-beta/platforms/CLAUDE_NO_LOGIN_LIVE_SMOKE_RESULT_LOG.md',
  },
  gemini: {
    label: 'Gemini',
    url: 'https://gemini.google.com/',
    runbook: 'docs/internal-beta/platforms/GEMINI_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md',
    template: 'docs/internal-beta/platforms/GEMINI_NO_LOGIN_LIVE_SMOKE_RESULT_TEMPLATE.md',
    resultLog: 'docs/internal-beta/platforms/GEMINI_NO_LOGIN_LIVE_SMOKE_RESULT_LOG.md',
  },
};

function printSafetyBanner(platform) {
  console.log('==============================================================');
  console.log(`[>>] No-Login Live Smoke Launcher -- ${platform.label} browser`);
  console.log('==============================================================');
  console.log('');
  console.log('This launches a REAL, visible Chrome window against the REAL');
  console.log(`${platform.url} -- read the full runbook first:`);
  console.log(`  ${platform.runbook}`);
  console.log('');
  console.log('DO NOT, at any point in the window that opens:');
  console.log('  - log in / create an account / enter credentials');
  console.log('  - solve a CAPTCHA or security challenge');
  console.log('  - type or submit a prompt');
  console.log('  - click through any "Sign in" / account-chooser flow');
  console.log('');
  console.log('This script never reads page content, DOM text, cookies,');
  console.log('tokens, storage, or takes any screenshot/video/trace. It only');
  console.log('launches the browser and waits for you to close it.');
  console.log('');
  console.log('This does NOT guarantee zero account/IP-ban risk from the');
  console.log('target platform\'s own systems -- see the safety policy doc.');
  console.log('==============================================================');
  console.log('');
}

function printChecklist(platform) {
  console.log('Manual checklist once the window opens (see runbook for detail):');
  console.log('  1. Confirm the page loads without you logging in.');
  console.log('  2. Do not type or submit anything.');
  console.log('  3. Open DevTools Console on the tab -- confirm no extension');
  console.log('     (chrome-extension://) errors.');
  console.log('  4. Go to chrome://extensions -> PromptProfit -> "service');
  console.log('     worker" DevTools -> run: chrome.storage.local.set({ debugMode: true })');
  console.log('  5. Reload the tab -- confirm the "PP Debug" panel shows the');
  console.log('     adapter active, with no banner and no wait-state.');
  console.log('  6. Confirm no unexpected outbound network requests appear.');
  console.log('  7. Close this Chrome window when done.');
  console.log('');
  console.log('Then fill in the sanitized result template:');
  console.log(`  Template: ${platform.template}`);
  console.log(`  Save your filled-in copy as: ${platform.resultLog}`);
  console.log('');
}

function findChromeExecutable() {
  const envPath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
        ]
      : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function main() {
  const platformArg = (process.argv[2] || '').toLowerCase();
  const platform = PLATFORMS[platformArg];

  if (!platform) {
    console.error(`Usage: node ${path.basename(__filename)} <claude|gemini>`);
    process.exit(1);
  }

  printSafetyBanner(platform);

  console.log('[1/4] Building the production extension bundle...');
  const build = spawnSync('pnpm', ['--filter', '@ad-alt/browser-extension', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
  });
  if (build.status !== 0) {
    console.error('Build failed -- aborting. Fix the build before running live smoke.');
    process.exit(1);
  }
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`Expected build output not found at ${DIST_DIR} -- aborting.`);
    process.exit(1);
  }

  console.log('');
  console.log('[2/4] Creating a fresh, temporary, disposable Chrome profile...');
  const tempProfileDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `promptprofit-live-smoke-${platformArg}-`),
  );
  console.log(`  Profile dir: ${tempProfileDir}`);
  console.log('  This profile is brand new -- no cookies, no saved logins,');
  console.log('  no prior session of any kind. It will be deleted after the');
  console.log('  Chrome window you are about to see is closed.');

  const chromeExe = findChromeExecutable();
  if (!chromeExe) {
    console.log('');
    console.log('[3/4] No compatible Chrome executable was found automatically.');
    console.log('Do this manually instead:');
    console.log(`  1. Launch Chrome with a fresh profile, e.g.:`);
    console.log(`     chrome --user-data-dir="${tempProfileDir}"`);
    console.log(`  2. Go to chrome://extensions, enable Developer Mode, click`);
    console.log(`     "Load unpacked", and select: ${DIST_DIR}`);
    console.log(`  3. Open a new tab to: ${platform.url}`);
    printChecklist(platform);
    console.log('(Temporary profile left in place for your manual use; delete');
    console.log(`it yourself afterward: ${tempProfileDir})`);
    return;
  }

  console.log('');
  console.log(`[3/4] Launching Chrome (${chromeExe}) with the unpacked extension...`);
  printChecklist(platform);
  console.log('Waiting for you to close the Chrome window...');
  console.log('');

  const args = [
    `--user-data-dir=${tempProfileDir}`,
    `--disable-extensions-except=${DIST_DIR}`,
    `--load-extension=${DIST_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    platform.url,
  ];
  if (process.platform !== 'win32') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  // Blocks until the human operator closes the Chrome window. This script
  // never drives the page itself once launched -- control passes entirely
  // to the human from this point on.
  spawnSync(chromeExe, args, { stdio: 'ignore' });

  console.log('[4/4] Chrome window closed. Cleaning up temporary profile...');
  try {
    fs.rmSync(tempProfileDir, { recursive: true, force: true });
    console.log('  Temporary profile deleted.');
  } catch (err) {
    console.log(`  Could not delete temporary profile automatically: ${err.message}`);
    console.log(`  Please delete it manually: ${tempProfileDir}`);
  }

  console.log('');
  console.log('Now fill in the sanitized result template:');
  console.log(`  Template: ${platform.template}`);
  console.log(`  Save your filled-in copy as: ${platform.resultLog}`);
}

main();
