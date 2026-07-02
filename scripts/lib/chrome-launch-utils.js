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

const crypto = require('crypto');

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

// ---------------------------------------------------------------------------
// Multi-layer verification (Layer 1: CDP by predicted ID, Layer 2: profile
// Preferences, Layer 3: manifest resource probe, Layer 4: runtime DOM).
//
// Single-layer CDP service-worker matching (above) is kept for backwards
// compatibility and as one input signal, but is no longer sufficient on its
// own: MV3 service workers go idle and disappear from /json/list within
// seconds of being idle, so a real, correctly-loaded extension can transiently
// show zero service_worker targets. The layers below give independent,
// non-service-worker-dependent evidence.
// ---------------------------------------------------------------------------

/**
 * Reproduces Chromium's algorithm for deriving an unpacked extension's ID
 * from its absolute install path: SHA-256 the path string, take the first
 * 32 hex characters, map each hex nibble (0-15) to a letter (a-p). This is
 * deterministic and lets every verification layer anchor to the ONE
 * extension ID Chrome will assign -- instead of guessing which of several
 * chrome-extension:// targets/Preferences entries is ours (Chrome's own
 * built-in component extensions, e.g. the PDF viewer, also register
 * targets and Preferences entries in a fresh profile).
 *
 * Verified empirically against real Chrome output for multiple paths (see
 * chrome-launch-utils.test.js) -- not a guess.
 *
 * @param {string} absolutePath - must be the exact OS-native absolute path
 *   Chrome was launched with (path.resolve(extractDir))
 * @returns {string} 32-character extension ID, a-p only
 */
function computeUnpackedExtensionId(absolutePath) {
  const hex = crypto.createHash('sha256').update(absolutePath, 'utf8').digest('hex').slice(0, 32);
  let id = '';
  for (const c of hex) {
    id += String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16));
  }
  return id;
}

/**
 * Layer 1 (by-ID variant): every CDP target belonging to a specific
 * extension ID, regardless of type -- service_worker, background_page, or
 * any page opened at a chrome-extension://<id>/ URL. Unlike
 * parseExtensionServiceWorkerTargets, this does not require the target to
 * currently be a live service worker (which may have gone idle), only that
 * SOME target for this exact extension ID exists right now.
 * @param {unknown} targets - parsed JSON from /json/list
 * @param {string} extensionId
 * @returns {Array<{type:string, url:string}>}
 */
function parseExtensionTargetsById(targets, extensionId) {
  if (!Array.isArray(targets) || typeof extensionId !== 'string' || !extensionId) return [];
  const prefix = 'chrome-extension://' + extensionId + '/';
  return targets
    .filter((t) => t && typeof t === 'object' && typeof t.url === 'string' && t.url.startsWith(prefix))
    .map((t) => ({ type: typeof t.type === 'string' ? t.type : 'unknown', url: t.url }));
}

/**
 * Picks the single "real" page target to run the Layer 4 runtime DOM probe
 * against -- the tab Chrome was launched pointed at (chatgpt.com), as
 * opposed to any chrome-extension://... probe tab this script itself opened
 * for Layer 3. Deliberately returns ONLY id/webSocketDebuggerUrl, never the
 * target's url or title -- a real chatgpt.com tab's title can be
 * content-derived (e.g. the conversation name), so this function's return
 * value must never be logged or printed as-is.
 * @param {unknown} targets
 * @returns {{id:string, webSocketDebuggerUrl:string}|null}
 */
function findPageTargetExcludingExtensions(targets) {
  if (!Array.isArray(targets)) return null;
  const candidates = targets.filter(
    (t) =>
      t &&
      typeof t === 'object' &&
      t.type === 'page' &&
      typeof t.url === 'string' &&
      !t.url.startsWith('chrome-extension://') &&
      typeof t.webSocketDebuggerUrl === 'string' &&
      typeof t.id === 'string',
  );
  if (candidates.length === 0) return null;
  return { id: candidates[0].id, webSocketDebuggerUrl: candidates[0].webSocketDebuggerUrl };
}

/**
 * Layer 2: extracts ONLY the one Preferences sub-object relevant to a
 * specific extension ID (extensions.settings[extensionId]) out of a parsed
 * Chrome Preferences JSON file. Preferences.json does not contain browsing
 * history, cookies, saved passwords, or session tokens (those live in
 * separate files this script never opens), but it does list every other
 * installed extension -- this function deliberately narrows to one ID so
 * nothing about any other extension is ever read/returned.
 * @param {unknown} preferencesJson - parsed Preferences file contents
 * @param {string} extensionId
 * @returns {object|null}
 */
function extractPromptProfitPreferencesEntry(preferencesJson, extensionId) {
  if (!preferencesJson || typeof preferencesJson !== 'object') return null;
  if (typeof extensionId !== 'string' || !extensionId) return null;
  const settings = preferencesJson.extensions && preferencesJson.extensions.settings;
  if (!settings || typeof settings !== 'object') return null;
  const entry = settings[extensionId];
  return entry && typeof entry === 'object' ? entry : null;
}

/**
 * Pure validation of a Layer 2 Preferences entry: does it prove PromptProfit
 * is installed from the extracted root, and (if the field is present) not
 * disabled? No I/O -- easy to unit-test with hand-built fixture objects,
 * same pattern as zip-utils.js's validateBuildInfo.
 * @param {object|null} entry - result of extractPromptProfitPreferencesEntry
 * @param {{expectedName:string, expectedPathAbs:string}} expectations
 * @returns {{ok:boolean, reasons:string[], nameMatches:boolean, pathMatches:boolean}}
 */
function evaluatePreferencesEvidence(entry, expectations = {}) {
  const reasons = [];
  if (!entry) {
    return { ok: false, reasons: ['no Preferences entry for this extension ID'], nameMatches: false, pathMatches: false };
  }

  // Not every Chrome version embeds a manifest snapshot under entry.manifest
  // for an unpacked/command-line-loaded extension -- verified empirically:
  // real Chrome 141 Preferences entries for --load-extension have path/
  // location/state/etc. but no "manifest" key at all. When manifest.name IS
  // present it must match; when absent, identification instead relies on
  // the extension ID itself (already cryptographically tied to
  // expectedPathAbs via Chromium's own SHA-256 unpacked-ID algorithm --
  // see computeUnpackedExtensionId) plus the path match below, which
  // together are still definitive.
  const hasManifestName = entry.manifest && typeof entry.manifest.name === 'string';
  const nameMatches = hasManifestName ? entry.manifest.name === expectations.expectedName : true;
  if (hasManifestName && !nameMatches) {
    reasons.push(`Preferences manifest.name is "${entry.manifest.name}", expected "${expectations.expectedName}"`);
  }

  // Chrome stores the unpacked extension's on-disk path in the "path" field.
  // It may be absolute or (on some Chrome versions) relative to the profile
  // dir for other install types, so a substring/basename check is used
  // rather than requiring byte-exact equality.
  const entryPath = typeof entry.path === 'string' ? entry.path : '';
  const expectedPathAbs = expectations.expectedPathAbs || '';
  const pathMatches =
    !!entryPath && !!expectedPathAbs && (entryPath === expectedPathAbs || expectedPathAbs.endsWith(entryPath) || entryPath.endsWith(expectedPathAbs));
  if (!pathMatches) {
    reasons.push(`Preferences path "${entryPath}" does not match extracted root "${expectedPathAbs}"`);
  }

  // "state" is Chromium's Extension::State enum -- 1 is ENABLED. Only checked
  // when present, since not every Chrome version/entry populates it the same way.
  let stateOk = true;
  if (typeof entry.state === 'number' && entry.state !== 1) {
    stateOk = false;
    reasons.push(`Preferences state is ${entry.state}, expected 1 (enabled)`);
  }

  return { ok: nameMatches && pathMatches && stateOk, reasons, nameMatches, pathMatches };
}

/**
 * Layer 3: pure parse/validation of the JSON string returned by evaluating
 * `JSON.parse(document.body.innerText).name` against a
 * chrome-extension://<id>/manifest.json probe tab. A tab that failed to
 * load the resource (invalid ID, resource not web-accessible) shows Chrome's
 * error page instead, whose body text is not valid JSON -- so this can only
 * succeed for a genuinely loaded extension.
 * @param {string} rawResultValue - the string value returned by Runtime.evaluate
 * @param {string} expectedName
 * @returns {{ok:boolean, name:string|null, error:string|null}}
 */
function parseManifestProbeResult(rawResultValue, expectedName) {
  try {
    const parsed = JSON.parse(rawResultValue);
    if (parsed && parsed.ok === true && typeof parsed.name === 'string') {
      return { ok: parsed.name === expectedName, name: parsed.name, error: null };
    }
    return { ok: false, name: null, error: (parsed && parsed.error) || 'manifest probe did not report ok:true' };
  } catch (e) {
    return { ok: false, name: null, error: 'could not parse probe result: ' + e.message };
  }
}

/**
 * Layer 4: pure parse/validation of the JSON string returned by the
 * extension-owned-DOM Runtime.evaluate probe run against the chatgpt.com
 * tab. Only ever consumes the specific fields the probe expression itself
 * produces (banner presence/visibility, diagnostics data-* attribute
 * values) -- never arbitrary page content, since the probe expression run
 * in the page is itself scoped to exactly those two extension-owned
 * elements (see buildRuntimeDomProbeExpression).
 * @param {string} rawResultValue
 * @returns {{ok:boolean, bannerVisible:boolean, diagnosticsPresent:boolean, statusLabel:string|null, lastErrorCode:string|null, raw:object|null, error:string|null}}
 */
function parseRuntimeDomProbeResult(rawResultValue) {
  let parsed;
  try {
    parsed = JSON.parse(rawResultValue);
  } catch (e) {
    return { ok: false, bannerVisible: false, diagnosticsPresent: false, statusLabel: null, lastErrorCode: null, raw: null, error: 'could not parse DOM probe result: ' + e.message };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, bannerVisible: false, diagnosticsPresent: false, statusLabel: null, lastErrorCode: null, raw: null, error: 'DOM probe result was not an object' };
  }
  const bannerVisible = parsed.bannerVisible === true;
  const diagnosticsPresent = parsed.diagnosticsPresent === true;
  const statusLabel = typeof parsed.diagStatusLabel === 'string' ? parsed.diagStatusLabel : null;
  const lastErrorCode = typeof parsed.diagLastErrorCode === 'string' ? parsed.diagLastErrorCode : null;
  return {
    ok: bannerVisible || diagnosticsPresent,
    bannerVisible,
    diagnosticsPresent,
    statusLabel,
    lastErrorCode,
    raw: parsed,
    error: null,
  };
}

/**
 * Single JS expression string for the Layer 4 CDP Runtime.evaluate call.
 * Deliberately touches ONLY the two extension-owned elements by their fixed
 * ids (#promptprofit-sponsored-banner, #promptprofit-dryrun-diagnostics) and
 * their own data-* attributes -- never document.title, location.href,
 * innerText/outerHTML of anything else, or any ChatGPT-authored content.
 * @returns {string}
 */
function buildRuntimeDomProbeExpression() {
  return `(() => {
    const banner = document.querySelector('#promptprofit-sponsored-banner');
    const diag = document.querySelector('#promptprofit-dryrun-diagnostics');
    const bannerVisible = !!banner && banner.offsetWidth > 0 && banner.offsetHeight > 0;
    const result = { bannerPresent: !!banner, bannerVisible, diagnosticsPresent: !!diag };
    if (diag) {
      result.diagStatusLabel = diag.getAttribute('data-status-label');
      result.diagLastErrorCode = diag.getAttribute('data-last-error-code');
      result.diagBannerRendered = diag.getAttribute('data-banner-rendered');
      result.diagBannerVisible = diag.getAttribute('data-banner-visible');
      result.diagDemoFallbackActive = diag.getAttribute('data-demo-fallback-active');
      result.diagDemoFallbackRendered = diag.getAttribute('data-demo-fallback-rendered');
      result.diagKillSwitchActive = diag.getAttribute('data-kill-switch-active');
      result.diagExtensionLoaded = diag.getAttribute('data-extension-loaded');
    }
    return JSON.stringify(result);
  })()`;
}

/**
 * Final decision table (Phase 5): combines evidence from every layer into
 * exactly one of the four documented output states. Pure so the state
 * machine itself -- not just each layer's own pass/fail -- is unit-testable.
 * @param {{registered:boolean, runtimeVerified:boolean, policyBlockLikely:boolean}} evidence
 * @returns {'PASS'|'BLOCKED_EXTENSION_LOAD'|'BLOCKED_RUNTIME'|'BLOCKED_POLICY'}
 */
function classifyLaunchOutcome(evidence) {
  const { registered, runtimeVerified, policyBlockLikely } = evidence;
  if (!registered && policyBlockLikely) return 'BLOCKED_POLICY';
  if (!registered) return 'BLOCKED_EXTENSION_LOAD';
  if (!runtimeVerified) return 'BLOCKED_RUNTIME';
  return 'PASS';
}

/**
 * Generic async poll: calls checkFn() repeatedly until it resolves truthy or
 * timeoutMs elapses, sleeping intervalMs between attempts via the injectable
 * sleepFn. Shared by CDP readiness polling, assisted-manual-load polling,
 * and runtime-DOM polling -- one implementation instead of three copies.
 *
 * sleepFn is injectable specifically so tests can drive many iterations of
 * a fake checkFn (e.g. "false 3 times, then true", or "always false") near-
 * instantly instead of waiting on real timers, while production code passes
 * the real `(ms) => new Promise(r => setTimeout(r, ms))`.
 *
 * @param {() => Promise<any>} checkFn
 * @param {{timeoutMs:number, intervalMs:number, sleepFn:(ms:number)=>Promise<void>, onAttempt?:(result:any, elapsedMs:number)=>void}} opts
 * @returns {Promise<any>} the first truthy result, or null on timeout
 */
async function waitForCondition(checkFn, opts) {
  const { timeoutMs, intervalMs, sleepFn, onAttempt } = opts;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await checkFn();
    if (onAttempt) onAttempt(result, Date.now() - start);
    if (result) return result;
    await sleepFn(intervalMs);
  }
  return null;
}

/**
 * Parses the relevant lines out of a Windows `reg query` output for a
 * single policy value (or a "not found" error), returning just what's
 * needed to report a likely unpacked-extension/developer-mode block. Pure
 * string parsing -- takes the raw stdout, not a live registry read -- so it
 * can be unit-tested against captured sample output without Windows.
 * @param {string} regQueryStdout
 * @param {string} valueName - e.g. "DeveloperToolsAvailability"
 * @returns {{found:boolean, value:string|null}}
 */
function parseWindowsRegQueryValue(regQueryStdout, valueName) {
  if (typeof regQueryStdout !== 'string') return { found: false, value: null };
  const re = new RegExp(valueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+REG_\\w+\\s+(\\S+)');
  const m = re.exec(regQueryStdout);
  if (!m) return { found: false, value: null };
  return { found: true, value: m[1] };
}

/**
 * Given the parsed values of the handful of Chrome/Chromium policies that
 * can block unpacked/developer-mode extension loading, decides whether a
 * policy block is likely. Pure decision logic, separate from the actual
 * (Windows-only) registry reads.
 * @param {{developerToolsAvailability?:string, extensionDeveloperModeSettings?:string, blockExternalExtensions?:string}} policyValues
 * @returns {{likely:boolean, reasons:string[]}}
 */
function evaluatePolicyBlockLikelihood(policyValues) {
  const reasons = [];
  // DeveloperToolsAvailability: 2 = DeveloperToolsDisallowedForForceInstalledExtensions is not
  // relevant here, but 2 alone (via DeveloperToolsDisabled-equivalent value) disables dev tools
  // entirely on some policy schemas. ExtensionDeveloperModeSettings: 1 = force-disabled.
  if (policyValues.developerToolsAvailability === '2') {
    reasons.push('DeveloperToolsAvailability=2 (developer tools disabled by policy)');
  }
  if (policyValues.extensionDeveloperModeSettings === '1') {
    reasons.push('ExtensionDeveloperModeSettings=1 (developer mode extensions disallowed by policy)');
  }
  if (policyValues.blockExternalExtensions === '1') {
    reasons.push('BlockExternalExtensions=1');
  }
  return { likely: reasons.length > 0, reasons };
}

module.exports = {
  parseExtensionServiceWorkerTargets,
  extractExtensionIdFromUrl,
  summarizeCdpTargetsForLog,
  shouldUseNoSandbox,
  shouldUseHeadlessFallback,
  buildChromeLaunchArgs,
  computeUnpackedExtensionId,
  parseExtensionTargetsById,
  findPageTargetExcludingExtensions,
  extractPromptProfitPreferencesEntry,
  evaluatePreferencesEvidence,
  parseManifestProbeResult,
  parseRuntimeDomProbeResult,
  buildRuntimeDomProbeExpression,
  classifyLaunchOutcome,
  waitForCondition,
  parseWindowsRegQueryValue,
  evaluatePolicyBlockLikelihood,
};
