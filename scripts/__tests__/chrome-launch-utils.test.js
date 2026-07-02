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
