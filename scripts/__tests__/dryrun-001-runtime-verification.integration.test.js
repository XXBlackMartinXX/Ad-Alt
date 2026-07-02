'use strict';
/**
 * Integration test for the Layer 4 runtime-DOM-verification mechanics used
 * by dryrun-001-launch-chrome.js -- proves the real CDP WebSocket
 * Runtime.evaluate round-trip (cdp-ws-client.js + buildRuntimeDomProbeExpression
 * + parseRuntimeDomProbeResult) correctly detects PromptProfit's banner and
 * diagnostics elements against a REAL rendered page in a REAL Chrome tab.
 *
 * This deliberately does NOT navigate to chatgpt.com: this sandboxed dev
 * container's network policy blocks chatgpt.com entirely (its outbound
 * proxy returns 403 for that host), which would make any chatgpt.com-based
 * test here fail for a reason unrelated to the code under test. Instead it
 * serves a minimal local HTML fixture containing the exact extension-owned
 * elements/attributes the real content script would produce, and exercises
 * the identical probe expression against it. Whether the real content
 * script itself renders those elements correctly on real chatgpt.com is
 * already covered separately by the 27/27 fixture e2e suite
 * (pnpm -w run smoke:chatgpt:fixture); this test covers only whether this
 * session's NEW CDP-probing code reads them correctly once they exist.
 *
 * Run: node --test scripts/__tests__/*.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  buildRuntimeDomProbeExpression,
  parseRuntimeDomProbeResult,
  findPageTargetExcludingExtensions,
} = require('../lib/chrome-launch-utils.js');
const { evaluateInTarget } = require('../lib/cdp-ws-client.js');

function findChromeExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  if (fs.existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  return null;
}

function serveHtml(html) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function httpGetJson(port, pathName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathName, timeout: timeoutMs, agent: false }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function waitForCdp(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await httpGetJson(port, '/json/version', 1000);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return false;
}

const chromePath = findChromeExecutable();

test(
  'Layer 4 probe: detects a visible banner and reads diagnostics data-* attributes off a real rendered page',
  { timeout: 30_000, skip: !chromePath ? 'no Chrome/Chromium executable available in this environment' : false },
  async () => {
    const html = `<!DOCTYPE html><html><body>
      <div id="promptprofit-sponsored-banner" style="width:200px;height:50px;"></div>
      <div id="promptprofit-dryrun-diagnostics"
           data-status-label="Banner visible"
           data-last-error-code="none"
           data-banner-rendered="true"
           data-banner-visible="true"
           data-demo-fallback-active="true"
           data-demo-fallback-rendered="true"
           data-kill-switch-active="false"
           data-extension-loaded="true"></div>
    </body></html>`;
    const server = await serveHtml(html);
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    const port = await getFreePort();
    const profileDir = path.join(os.tmpdir(), 'promptprofit-runtime-probe-test-' + Date.now());
    const child = spawn(chromePath, [
      '--user-data-dir=' + profileDir,
      '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--headless=new',
      '--remote-debugging-port=' + port, '--remote-allow-origins=*', url,
    ], { stdio: 'ignore' });

    try {
      const cdpUp = await waitForCdp(port, 10_000);
      assert.ok(cdpUp, 'Chrome DevTools port must become reachable');

      let pageTarget = null;
      const start = Date.now();
      while (!pageTarget && Date.now() - start < 8_000) {
        const targets = await httpGetJson(port, '/json/list', 1000);
        pageTarget = findPageTargetExcludingExtensions(targets);
        if (!pageTarget) await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(pageTarget, 'must find the local fixture page target');

      // A single evaluate() immediately after the target appears can race
      // Chrome's first layout pass under CPU contention (offsetWidth/
      // offsetHeight briefly read 0), which is exactly why the real
      // verifyRuntimeOnChatGpt() polls for up to 20s rather than checking
      // once -- mirror that here instead of asserting on a single sample.
      let result = null;
      const pollStart = Date.now();
      while (Date.now() - pollStart < 5_000) {
        const raw = await evaluateInTarget(pageTarget.webSocketDebuggerUrl, buildRuntimeDomProbeExpression(), 3000);
        result = parseRuntimeDomProbeResult(raw);
        if (result.ok) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      assert.equal(result.ok, true);
      assert.equal(result.bannerVisible, true);
      assert.equal(result.diagnosticsPresent, true);
      assert.equal(result.statusLabel, 'Banner visible');
      assert.equal(result.lastErrorCode, 'none');
    } finally {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      server.close();
      // Chrome can still be flushing profile files for a moment after
      // SIGKILL is delivered; retry a few times rather than let a cleanup
      // race fail the whole test.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.rmSync(profileDir, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }
  },
);

test(
  'Layer 4 probe: reports not-ok when neither banner nor diagnostics exist on the page',
  { timeout: 30_000, skip: !chromePath ? 'no Chrome/Chromium executable available in this environment' : false },
  async () => {
    const html = '<!DOCTYPE html><html><body><p>plain page, no PromptProfit elements</p></body></html>';
    const server = await serveHtml(html);
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    const port = await getFreePort();
    const profileDir = path.join(os.tmpdir(), 'promptprofit-runtime-probe-test-' + Date.now());
    const child = spawn(chromePath, [
      '--user-data-dir=' + profileDir,
      '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--headless=new',
      '--remote-debugging-port=' + port, '--remote-allow-origins=*', url,
    ], { stdio: 'ignore' });

    try {
      const cdpUp = await waitForCdp(port, 10_000);
      assert.ok(cdpUp, 'Chrome DevTools port must become reachable');

      let pageTarget = null;
      const start = Date.now();
      while (!pageTarget && Date.now() - start < 8_000) {
        const targets = await httpGetJson(port, '/json/list', 1000);
        pageTarget = findPageTargetExcludingExtensions(targets);
        if (!pageTarget) await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(pageTarget, 'must find the local fixture page target');

      const raw = await evaluateInTarget(pageTarget.webSocketDebuggerUrl, buildRuntimeDomProbeExpression(), 5000);
      const result = parseRuntimeDomProbeResult(raw);

      assert.equal(result.ok, false);
      assert.equal(result.bannerVisible, false);
      assert.equal(result.diagnosticsPresent, false);
    } finally {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      server.close();
      // Chrome can still be flushing profile files for a moment after
      // SIGKILL is delivered; retry a few times rather than let a cleanup
      // race fail the whole test.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.rmSync(profileDir, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }
  },
);
