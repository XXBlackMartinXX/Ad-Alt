'use strict';
/**
 * Pure-function tests for scripts/lib/chrome-launch-utils.js -- the CDP
 * target-matching, flag-selection, and privacy-safe-summary logic that
 * dryrun-001-launch-chrome.js uses to decide PASS vs BLOCKED. No real
 * Chrome process involved; every case here is a plain object/array in,
 * value out.
 *
 * Run: node --test scripts/__tests__/*.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
} = require('../lib/chrome-launch-utils.js');

const SW_SUFFIX = '/dist/background/service-worker.js';
const EXT_ID = 'cdakheiaikfkbfhbhcigmplmemaijcej'; // 32 lowercase a-p chars, same shape Chrome generates

test('parseExtensionServiceWorkerTargets: finds a matching service_worker target', () => {
  const targets = [
    { type: 'page', url: 'https://chatgpt.com/', title: 'some private conversation title' },
    { type: 'service_worker', url: `chrome-extension://${EXT_ID}${SW_SUFFIX}` },
  ];
  const matches = parseExtensionServiceWorkerTargets(targets, SW_SUFFIX);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, `chrome-extension://${EXT_ID}${SW_SUFFIX}`);
});

test('parseExtensionServiceWorkerTargets: returns empty when no service_worker target exists', () => {
  const targets = [{ type: 'page', url: 'https://chatgpt.com/' }];
  assert.deepEqual(parseExtensionServiceWorkerTargets(targets, SW_SUFFIX), []);
});

test('parseExtensionServiceWorkerTargets: ignores a service_worker target for a DIFFERENT extension/path', () => {
  const targets = [
    { type: 'service_worker', url: `chrome-extension://${EXT_ID}/dist/background/other.js` },
    { type: 'service_worker', url: 'https://example.com/not-an-extension' },
  ];
  assert.deepEqual(parseExtensionServiceWorkerTargets(targets, SW_SUFFIX), []);
});

test('parseExtensionServiceWorkerTargets: non-array input returns empty, does not throw', () => {
  assert.deepEqual(parseExtensionServiceWorkerTargets(null, SW_SUFFIX), []);
  assert.deepEqual(parseExtensionServiceWorkerTargets(undefined, SW_SUFFIX), []);
  assert.deepEqual(parseExtensionServiceWorkerTargets({}, SW_SUFFIX), []);
});

test('parseExtensionServiceWorkerTargets: empty/missing suffix returns empty rather than matching everything', () => {
  const targets = [{ type: 'service_worker', url: `chrome-extension://${EXT_ID}${SW_SUFFIX}` }];
  assert.deepEqual(parseExtensionServiceWorkerTargets(targets, ''), []);
  assert.deepEqual(parseExtensionServiceWorkerTargets(targets, undefined), []);
});

test('extractExtensionIdFromUrl: pulls the 32-char ID out of a chrome-extension:// URL', () => {
  assert.equal(extractExtensionIdFromUrl(`chrome-extension://${EXT_ID}${SW_SUFFIX}`), EXT_ID);
});

test('extractExtensionIdFromUrl: returns null for a non-extension URL', () => {
  assert.equal(extractExtensionIdFromUrl('https://chatgpt.com/'), null);
  assert.equal(extractExtensionIdFromUrl(null), null);
  assert.equal(extractExtensionIdFromUrl(undefined), null);
});

test('summarizeCdpTargetsForLog: never exposes a page target title or url', () => {
  const targets = [
    { type: 'page', url: 'https://chatgpt.com/c/some-conversation-id', title: 'My private tax question' },
    { type: 'service_worker', url: `chrome-extension://${EXT_ID}${SW_SUFFIX}` },
  ];
  const summary = summarizeCdpTargetsForLog(targets);
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /private tax question/);
  assert.doesNotMatch(serialized, /chatgpt\.com/);
  assert.equal(summary.pageTargetPresent, true);
  assert.deepEqual(summary.targetCountsByType, { page: 1, service_worker: 1 });
});

test('summarizeCdpTargetsForLog: handles non-array input safely', () => {
  const summary = summarizeCdpTargetsForLog(null);
  assert.equal(summary.pageTargetPresent, false);
  assert.deepEqual(summary.targetCountsByType, {});
});

test('shouldUseNoSandbox: true only for root on non-Windows', () => {
  assert.equal(shouldUseNoSandbox('linux', 0), true);
  assert.equal(shouldUseNoSandbox('darwin', 0), true);
});

test('shouldUseNoSandbox: false for a non-root uid', () => {
  assert.equal(shouldUseNoSandbox('linux', 1000), false);
});

test('shouldUseNoSandbox: false on win32 even if uid were somehow 0', () => {
  assert.equal(shouldUseNoSandbox('win32', 0), false);
});

test('shouldUseNoSandbox: false when uid is undefined (win32 has no process.getuid)', () => {
  assert.equal(shouldUseNoSandbox('win32', undefined), false);
  assert.equal(shouldUseNoSandbox('linux', undefined), false);
});

test('shouldUseHeadlessFallback: true on Linux with no DISPLAY/WAYLAND_DISPLAY', () => {
  assert.equal(shouldUseHeadlessFallback('linux', {}), true);
});

test('shouldUseHeadlessFallback: false on Linux when DISPLAY is set', () => {
  assert.equal(shouldUseHeadlessFallback('linux', { DISPLAY: ':0' }), false);
});

test('shouldUseHeadlessFallback: false on Linux when WAYLAND_DISPLAY is set', () => {
  assert.equal(shouldUseHeadlessFallback('linux', { WAYLAND_DISPLAY: 'wayland-0' }), false);
});

test('shouldUseHeadlessFallback: always false on win32, even with no display env vars', () => {
  assert.equal(shouldUseHeadlessFallback('win32', {}), false);
});

test('buildChromeLaunchArgs: mode A includes --disable-extensions-except', () => {
  const args = buildChromeLaunchArgs({
    profileDir: '/tmp/profile', extractDir: '/tmp/ext', port: 12345, mode: 'A',
  });
  assert.ok(args.includes('--disable-extensions-except=/tmp/ext'));
  assert.ok(args.includes('--load-extension=/tmp/ext'));
  assert.ok(args.includes('--remote-debugging-port=12345'));
  assert.ok(args.includes('--remote-allow-origins=*'));
  assert.ok(args.includes('--new-window'));
  assert.ok(args.includes('https://chatgpt.com'));
});

test('buildChromeLaunchArgs: mode B omits --disable-extensions-except but keeps --load-extension', () => {
  const args = buildChromeLaunchArgs({
    profileDir: '/tmp/profile', extractDir: '/tmp/ext', port: 12345, mode: 'B',
  });
  assert.ok(!args.some((a) => a.startsWith('--disable-extensions-except')));
  assert.ok(args.includes('--load-extension=/tmp/ext'));
});

test('buildChromeLaunchArgs: adds --no-sandbox only when requested', () => {
  const withSandboxFlag = buildChromeLaunchArgs({
    profileDir: '/tmp/p', extractDir: '/tmp/e', port: 1, mode: 'A', noSandbox: true,
  });
  const withoutSandboxFlag = buildChromeLaunchArgs({
    profileDir: '/tmp/p', extractDir: '/tmp/e', port: 1, mode: 'A', noSandbox: false,
  });
  assert.ok(withSandboxFlag.includes('--no-sandbox'));
  assert.ok(!withoutSandboxFlag.includes('--no-sandbox'));
});

test('buildChromeLaunchArgs: headless swaps --new-window for --headless=new', () => {
  const headlessArgs = buildChromeLaunchArgs({
    profileDir: '/tmp/p', extractDir: '/tmp/e', port: 1, mode: 'A', headless: true,
  });
  const windowedArgs = buildChromeLaunchArgs({
    profileDir: '/tmp/p', extractDir: '/tmp/e', port: 1, mode: 'A', headless: false,
  });
  assert.ok(headlessArgs.includes('--headless=new'));
  assert.ok(!headlessArgs.includes('--new-window'));
  assert.ok(windowedArgs.includes('--new-window'));
  assert.ok(!windowedArgs.includes('--headless=new'));
});

// ---------------------------------------------------------------------------
// Multi-layer verification (Layer 1 by-ID, Layer 2 Preferences, Layer 3
// manifest probe, Layer 4 runtime DOM, decision table, assisted-mode polling)
// ---------------------------------------------------------------------------

test('computeUnpackedExtensionId: matches real Chrome output for known paths (ground truth captured from actual runs)', () => {
  // These pairs were captured by running the real launcher against real
  // bundled Chromium and reading back the extension ID Chrome itself
  // assigned for each extraction path -- not invented values.
  const cases = [
    ['/tmp/promptprofit-dryrun-extract-2026-07-02T10-39-35-452Z-3347', 'knjjfhgannogeempolgkbfgfikofofco'],
    ['/tmp/promptprofit-dryrun-extract-2026-07-02T09-47-21-365Z-13353', 'ednifkadnmfakingpajgggecpipibhda'],
    ['/tmp/promptprofit-dryrun-extract-2026-07-02T09-42-39-975Z-10214', 'pdehlfikginlbllelieofpccagjaoieg'],
  ];
  for (const [p, expected] of cases) {
    assert.equal(computeUnpackedExtensionId(p), expected, `mismatch for ${p}`);
  }
});

test('computeUnpackedExtensionId: 32 chars, a-p only, deterministic', () => {
  const id = computeUnpackedExtensionId('/some/arbitrary/path');
  assert.equal(id.length, 32);
  assert.match(id, /^[a-p]{32}$/);
  assert.equal(id, computeUnpackedExtensionId('/some/arbitrary/path'));
});

test('computeUnpackedExtensionId: different paths produce different ids', () => {
  assert.notEqual(computeUnpackedExtensionId('/path/one'), computeUnpackedExtensionId('/path/two'));
});

test('parseExtensionTargetsById: matches any target type for the given extension id, ignores others', () => {
  const id = 'knjjfhgannogeempolgkbfgfikofofco';
  const otherId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const targets = [
    { type: 'page', url: 'https://chatgpt.com/' },
    { type: 'background_page', url: `chrome-extension://${otherId}/_generated_background_page.html` },
    { type: 'service_worker', url: `chrome-extension://${id}/dist/background/service-worker.js` },
    { type: 'page', url: `chrome-extension://${id}/manifest.json` },
  ];
  const matches = parseExtensionTargetsById(targets, id);
  assert.equal(matches.length, 2);
  assert.ok(matches.some((m) => m.type === 'service_worker'));
  assert.ok(matches.some((m) => m.type === 'page'));
});

test('parseExtensionTargetsById: empty when the id has no targets at all (e.g. idle MV3 service worker)', () => {
  const targets = [{ type: 'page', url: 'https://chatgpt.com/' }];
  assert.deepEqual(parseExtensionTargetsById(targets, 'knjjfhgannogeempolgkbfgfikofofco'), []);
});

test('findPageTargetExcludingExtensions: picks the non-extension page target, returns only id/webSocketDebuggerUrl', () => {
  const targets = [
    { type: 'page', url: `chrome-extension://knjjfhgannogeempolgkbfgfikofofco/manifest.json`, id: 'probe-tab', webSocketDebuggerUrl: 'ws://probe', title: 'ignored' },
    { type: 'page', url: 'https://chatgpt.com/c/private-conversation-slug', id: 'real-tab', webSocketDebuggerUrl: 'ws://real', title: 'My private conversation' },
    { type: 'service_worker', url: 'chrome-extension://knjjfhgannogeempolgkbfgfikofofco/dist/background/service-worker.js', id: 'sw', webSocketDebuggerUrl: 'ws://sw' },
  ];
  const found = findPageTargetExcludingExtensions(targets);
  assert.deepEqual(found, { id: 'real-tab', webSocketDebuggerUrl: 'ws://real' });
  assert.ok(!('url' in found), 'must never return the page url');
  assert.ok(!('title' in found), 'must never return the page title');
});

test('findPageTargetExcludingExtensions: returns null when only extension pages exist', () => {
  const targets = [{ type: 'page', url: 'chrome-extension://knjjfhgannogeempolgkbfgfikofofco/manifest.json', id: 'x', webSocketDebuggerUrl: 'ws://x' }];
  assert.equal(findPageTargetExcludingExtensions(targets), null);
});

test('extractPromptProfitPreferencesEntry: reads only extensions.settings[id], nothing else', () => {
  const prefs = {
    extensions: {
      settings: {
        knjjfhgannogeempolgkbfgfikofofco: { manifest: { name: 'PromptProfit' }, path: '/tmp/extract-dir', state: 1 },
        someotherid00000000000000000000: { manifest: { name: 'Adobe Acrobat' }, path: '/somewhere/else' },
      },
    },
    profile: { name: 'a real person name, must never be read' },
    account_info: [{ email: 'should-never-be-read@example.com' }],
  };
  const entry = extractPromptProfitPreferencesEntry(prefs, 'knjjfhgannogeempolgkbfgfikofofco');
  assert.equal(entry.manifest.name, 'PromptProfit');
  assert.equal(entry.path, '/tmp/extract-dir');
});

test('extractPromptProfitPreferencesEntry: ignores other extensions such as Adobe/IDM entirely', () => {
  const prefs = {
    extensions: {
      settings: {
        adobeidididididididididididididi: { manifest: { name: 'Adobe Acrobat' }, path: 'C:\\adobe' },
        idmididididididididididididididi: { manifest: { name: 'Internet Download Manager' }, path: 'C:\\idm' },
      },
    },
  };
  assert.equal(extractPromptProfitPreferencesEntry(prefs, 'knjjfhgannogeempolgkbfgfikofofco'), null);
});

test('extractPromptProfitPreferencesEntry: null when Preferences has no extensions.settings at all', () => {
  assert.equal(extractPromptProfitPreferencesEntry({}, 'knjjfhgannogeempolgkbfgfikofofco'), null);
  assert.equal(extractPromptProfitPreferencesEntry(null, 'knjjfhgannogeempolgkbfgfikofofco'), null);
});

test('evaluatePreferencesEvidence: ok when name and path both match', () => {
  const entry = { manifest: { name: 'PromptProfit' }, path: '/tmp/extract-dir', state: 1 };
  const result = evaluatePreferencesEvidence(entry, { expectedName: 'PromptProfit', expectedPathAbs: '/tmp/extract-dir' });
  assert.equal(result.ok, true);
  assert.equal(result.nameMatches, true);
  assert.equal(result.pathMatches, true);
});

test('evaluatePreferencesEvidence: ok on a real Chrome 141 --load-extension entry, which has NO manifest field at all', () => {
  // Captured verbatim (minus install timestamps) from a real profile's
  // Preferences after `--load-extension`: this Chrome version does not
  // embed a manifest snapshot for unpacked extensions, only path/location/
  // state/etc. Identification here relies on path alone (already tied to
  // the extension ID via computeUnpackedExtensionId's SHA-256 algorithm).
  const entry = {
    account_extension_type: 0,
    creation_flags: 38,
    disable_reasons: [],
    from_webstore: false,
    location: 8,
    path: '/tmp/test-prefs-ext',
    state: 1,
    was_installed_by_default: false,
  };
  const result = evaluatePreferencesEvidence(entry, { expectedName: 'PromptProfit', expectedPathAbs: '/tmp/test-prefs-ext' });
  assert.equal(result.ok, true);
  assert.equal(result.nameMatches, true, 'absent manifest.name must not fail the check');
  assert.equal(result.pathMatches, true);
});

test('evaluatePreferencesEvidence: fails on name mismatch (e.g. Preferences entry is a different extension)', () => {
  const entry = { manifest: { name: 'Some Other Extension' }, path: '/tmp/extract-dir', state: 1 };
  const result = evaluatePreferencesEvidence(entry, { expectedName: 'PromptProfit', expectedPathAbs: '/tmp/extract-dir' });
  assert.equal(result.ok, false);
  assert.equal(result.nameMatches, false);
});

test('evaluatePreferencesEvidence: fails on path mismatch', () => {
  const entry = { manifest: { name: 'PromptProfit' }, path: '/tmp/completely-different-dir', state: 1 };
  const result = evaluatePreferencesEvidence(entry, { expectedName: 'PromptProfit', expectedPathAbs: '/tmp/extract-dir' });
  assert.equal(result.ok, false);
  assert.equal(result.pathMatches, false);
});

test('evaluatePreferencesEvidence: fails when state is present and not enabled (1)', () => {
  const entry = { manifest: { name: 'PromptProfit' }, path: '/tmp/extract-dir', state: 0 };
  const result = evaluatePreferencesEvidence(entry, { expectedName: 'PromptProfit', expectedPathAbs: '/tmp/extract-dir' });
  assert.equal(result.ok, false);
});

test('evaluatePreferencesEvidence: null entry fails cleanly with a reason, does not throw', () => {
  const result = evaluatePreferencesEvidence(null, { expectedName: 'PromptProfit', expectedPathAbs: '/tmp/x' });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.length > 0);
});

test('parseManifestProbeResult: ok when the probed manifest.json content has the expected name', () => {
  const raw = JSON.stringify({ ok: true, name: 'PromptProfit' });
  const result = parseManifestProbeResult(raw, 'PromptProfit');
  assert.equal(result.ok, true);
  assert.equal(result.name, 'PromptProfit');
});

test('parseManifestProbeResult: fails when the probe hit an error page (not valid JSON, ok:false)', () => {
  const raw = JSON.stringify({ ok: false, error: "SyntaxError: Unexpected token 'a'" });
  const result = parseManifestProbeResult(raw, 'PromptProfit');
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('parseManifestProbeResult: fails cleanly on totally malformed input, does not throw', () => {
  const result = parseManifestProbeResult('not json at all', 'PromptProfit');
  assert.equal(result.ok, false);
});

test('parseRuntimeDomProbeResult: ok when banner is visible', () => {
  const raw = JSON.stringify({ bannerPresent: true, bannerVisible: true, diagnosticsPresent: false });
  const result = parseRuntimeDomProbeResult(raw);
  assert.equal(result.ok, true);
  assert.equal(result.bannerVisible, true);
});

test('parseRuntimeDomProbeResult: ok when diagnostics panel present even if banner missing, and surfaces status/error code', () => {
  const raw = JSON.stringify({
    bannerPresent: false, bannerVisible: false, diagnosticsPresent: true,
    diagStatusLabel: 'Kill-switch active -- banner suppressed', diagLastErrorCode: 'kill_switch_active',
  });
  const result = parseRuntimeDomProbeResult(raw);
  assert.equal(result.ok, true);
  assert.equal(result.diagnosticsPresent, true);
  assert.equal(result.statusLabel, 'Kill-switch active -- banner suppressed');
  assert.equal(result.lastErrorCode, 'kill_switch_active');
});

test('parseRuntimeDomProbeResult: not ok when neither banner nor diagnostics appear', () => {
  const raw = JSON.stringify({ bannerPresent: false, bannerVisible: false, diagnosticsPresent: false });
  const result = parseRuntimeDomProbeResult(raw);
  assert.equal(result.ok, false);
});

test('parseRuntimeDomProbeResult: malformed input fails cleanly, does not throw', () => {
  const result = parseRuntimeDomProbeResult('{not valid json');
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('buildRuntimeDomProbeExpression: only references extension-owned selectors, never document.title/location/innerText', () => {
  const expr = buildRuntimeDomProbeExpression();
  assert.match(expr, /#promptprofit-sponsored-banner/);
  assert.match(expr, /#promptprofit-dryrun-diagnostics/);
  assert.doesNotMatch(expr, /document\.title/);
  assert.doesNotMatch(expr, /location\.href/);
  assert.doesNotMatch(expr, /innerText/);
  assert.doesNotMatch(expr, /outerHTML/);
  assert.doesNotMatch(expr, /document\.body\.textContent/);
});

test('classifyLaunchOutcome: PASS when registered and runtime verified', () => {
  assert.equal(classifyLaunchOutcome({ registered: true, runtimeVerified: true, policyBlockLikely: false }), 'PASS');
});

test('classifyLaunchOutcome: BLOCKED_RUNTIME when registered but runtime not verified', () => {
  assert.equal(classifyLaunchOutcome({ registered: true, runtimeVerified: false, policyBlockLikely: false }), 'BLOCKED_RUNTIME');
});

test('classifyLaunchOutcome: BLOCKED_EXTENSION_LOAD when not registered and no policy signal', () => {
  assert.equal(classifyLaunchOutcome({ registered: false, runtimeVerified: false, policyBlockLikely: false }), 'BLOCKED_EXTENSION_LOAD');
});

test('classifyLaunchOutcome: BLOCKED_POLICY when not registered and a policy block is likely', () => {
  assert.equal(classifyLaunchOutcome({ registered: false, runtimeVerified: false, policyBlockLikely: true }), 'BLOCKED_POLICY');
});

test('waitForCondition: resolves as soon as checkFn returns truthy, without waiting full timeout', async () => {
  let calls = 0;
  const fakeSleep = async () => {}; // instant, so the test doesn't actually wait
  const result = await waitForCondition(
    async () => { calls++; return calls === 3 ? 'found' : null; },
    { timeoutMs: 100000, intervalMs: 1, sleepFn: fakeSleep },
  );
  assert.equal(result, 'found');
  assert.equal(calls, 3);
});

test('waitForCondition: returns null after exhausting the timeout when checkFn never succeeds', async () => {
  let calls = 0;
  // Fake clock: sleepFn advances a counter that Date.now() substitutes for
  // via attempt count instead of real timers -- simplest way to deterministically
  // exhaust a timeout without a real multi-second test. We simulate this by
  // using a real small timeout with a real (short) sleep instead.
  const result = await waitForCondition(
    async () => { calls++; return null; },
    { timeoutMs: 20, intervalMs: 5, sleepFn: (ms) => new Promise((r) => setTimeout(r, ms)) },
  );
  assert.equal(result, null);
  assert.ok(calls >= 1);
});

test('waitForCondition: onAttempt callback observes each attempt', async () => {
  const seen = [];
  let calls = 0;
  await waitForCondition(
    async () => { calls++; seen.push('check:' + calls); return calls === 2 ? true : null; },
    { timeoutMs: 100000, intervalMs: 1, sleepFn: async () => {}, onAttempt: (result) => seen.push('attempt:' + result) },
  );
  assert.deepEqual(seen, ['check:1', 'attempt:null', 'check:2', 'attempt:true']);
});

test('parseWindowsRegQueryValue: extracts a REG_DWORD value from reg query output', () => {
  const out = [
    'HKEY_LOCAL_MACHINE\\Software\\Policies\\Google\\Chrome',
    '    ExtensionDeveloperModeSettings    REG_DWORD    0x1',
    '',
  ].join('\r\n');
  const result = parseWindowsRegQueryValue(out, 'ExtensionDeveloperModeSettings');
  assert.equal(result.found, true);
  assert.equal(result.value, '0x1');
});

test('parseWindowsRegQueryValue: not found when reg query returned an error (key does not exist)', () => {
  const out = 'ERROR: The system was unable to find the specified registry key or value.';
  const result = parseWindowsRegQueryValue(out, 'ExtensionDeveloperModeSettings');
  assert.equal(result.found, false);
});

test('evaluatePolicyBlockLikelihood: likely when ExtensionDeveloperModeSettings forbids developer mode', () => {
  const result = evaluatePolicyBlockLikelihood({ extensionDeveloperModeSettings: '1' });
  assert.equal(result.likely, true);
  assert.ok(result.reasons.length > 0);
});

test('evaluatePolicyBlockLikelihood: not likely when no relevant policy values are set', () => {
  const result = evaluatePolicyBlockLikelihood({});
  assert.equal(result.likely, false);
  assert.deepEqual(result.reasons, []);
});
