'use strict';
/**
 * Pure-function helpers for the DRYRUN-001 verified Chrome launcher
 * (dryrun-001-launch-chrome.js). Extracted so the decision logic --
 * which flags to pass, whether a CDP target proves the extension loaded,
 * how to summarize CDP state without leaking page content -- can be
 * unit-tested without spawning a real Chrome process.
 *
 * No external dependencies -- pure Node.js built-ins only.
 */

const EXTENSION_ID_PATTERN = /^chrome-extension:\/\/([a-p]{32})\//;

/**
 * Given the parsed JSON body of GET /json/list (an array of CDP targets),
 * returns only the targets that prove the extension's own service worker
 * registered -- type "service_worker", scheme chrome-extension://, and a
 * URL ending in the manifest's declared background.service_worker path.
 *
 * This is the sole thing dryrun-001-launch-chrome.js is allowed to read
 * out of /json/list: it never inspects "page" type targets (which is
 * where a chatgpt.com tab's title/URL -- potentially content-derived --
 * would appear), so the extension-load check cannot leak ChatGPT content.
 *
 * @param {unknown} targets - parsed JSON from /json/list
 * @param {string} expectedSuffix - e.g. "/dist/background/service-worker.js"
 * @returns {Array<{id:string, url:string}>}
 */
function parseExtensionServiceWorkerTargets(targets, expectedSuffix) {
  if (!Array.isArray(targets) || typeof expectedSuffix !== 'string' || !expectedSuffix) return [];
  return targets.filter(
    (t) =>
      t &&
      typeof t === 'object' &&
      t.type === 'service_worker' &&
      typeof t.url === 'string' &&
      t.url.startsWith('chrome-extension://') &&
      t.url.endsWith(expectedSuffix),
  );
}

/** Pulls the 32-char extension ID out of a chrome-extension:// URL. Returns null if it doesn't match. */
function extractExtensionIdFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = EXTENSION_ID_PATTERN.exec(url);
  return m ? m[1] : null;
}

/**
 * Privacy-safe summary of a /json/list response: counts targets by type and
 * records whether a "page" target exists, WITHOUT ever reading that page
 * target's title or URL (a chatgpt.com tab's title can be content-derived,
 * e.g. the conversation name, which this script must never read per the
 * hard privacy rules). Safe to log/print in full.
 * @param {unknown} targets
 */
function summarizeCdpTargetsForLog(targets) {
  if (!Array.isArray(targets)) return { pageTargetPresent: false, targetCountsByType: {} };
  const targetCountsByType = {};
  let pageTargetPresent = false;
  for (const t of targets) {
    if (!t || typeof t !== 'object') continue;
    const type = typeof t.type === 'string' ? t.type : 'unknown';
    targetCountsByType[type] = (targetCountsByType[type] || 0) + 1;
    if (type === 'page') pageTargetPresent = true;
  }
  return { pageTargetPresent, targetCountsByType };
}

/**
 * Whether --no-sandbox should be added. Only true when running as root on a
 * non-Windows platform (Chromium's zygote refuses to start as root without
 * it -- this is a real dev-container/CI condition, not a Windows one; a real
 * Windows user never runs as root, so this must never fire there and must
 * never weaken a real user's sandbox).
 * @param {string} platform - process.platform
 * @param {number|undefined} uid - result of process.getuid?.() (undefined on win32)
 */
function shouldUseNoSandbox(platform, uid) {
  return platform !== 'win32' && typeof uid === 'number' && uid === 0;
}

/**
 * Whether to fall back to --headless=new. Only true on non-Windows platforms
 * with no display server available -- Chrome cannot open any window at all
 * in that case (this is the container/CI condition), so headless is the
 * only way to launch it. A real desktop (Windows always has one; Linux/macOS
 * desktops set DISPLAY/WAYLAND_DISPLAY) always gets a normal visible window.
 * @param {string} platform - process.platform
 * @param {NodeJS.ProcessEnv} env - process.env
 */
function shouldUseHeadlessFallback(platform, env) {
  if (platform === 'win32') return false;
  return !env.DISPLAY && !env.WAYLAND_DISPLAY;
}

/**
 * Builds the Chrome launch argument array. Pure and deterministic given its
 * inputs so it can be asserted on directly, without spawning anything.
 *
 * mode "A" includes --disable-extensions-except (the strict, preferred
 * mode -- only the target extension can load). mode "B" omits it (fallback
 * for the case where that flag itself suppresses the unpacked load on some
 * Chrome/Windows builds -- observed in the wild, not this repo's Chrome).
 *
 * @param {{profileDir:string, extractDir:string, port:number, mode:'A'|'B', noSandbox?:boolean, headless?:boolean}} opts
 * @returns {string[]}
 */
function buildChromeLaunchArgs(opts) {
  const { profileDir, extractDir, port, mode, noSandbox, headless } = opts;
  const args = [
    '--user-data-dir=' + profileDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=' + port,
    '--remote-allow-origins=*',
  ];
  if (mode === 'A') {
    args.push('--disable-extensions-except=' + extractDir);
  }
  args.push('--load-extension=' + extractDir);
  if (noSandbox) args.push('--no-sandbox');
  if (headless) {
    args.push('--headless=new');
  } else {
    args.push('--new-window');
  }
  args.push('https://chatgpt.com');
  return args;
}

module.exports = {
  parseExtensionServiceWorkerTargets,
  extractExtensionIdFromUrl,
  summarizeCdpTargetsForLog,
  shouldUseNoSandbox,
  shouldUseHeadlessFallback,
  buildChromeLaunchArgs,
};
