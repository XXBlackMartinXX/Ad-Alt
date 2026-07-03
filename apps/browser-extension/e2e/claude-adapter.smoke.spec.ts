/**
 * Smoke tests for the Claude adapter integration.
 *
 * These tests load the compiled extension in a real Chromium browser, serve a
 * static fixture page, and verify that the sponsored banner lifecycle works
 * end-to-end -- mirroring chatgpt-adapter.smoke.spec.ts's structure exactly.
 *
 * SUPPORT STATUS: This proves Claude at the fixture/unit-test level only. It
 * does NOT constitute a human-operated live-session verification against real
 * claude.ai -- see docs/internal-beta/platforms/CLAUDE_BROWSER_VERIFICATION.md.
 * No real claude.ai login or prompt entry occurs anywhere in this suite.
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { MockApiServer } from './mock-api-server.js';
import {
  buildExtensionContext,
  closeContext,
  configureExtensionStorage,
  openFixturePage,
} from './helpers/extension-context.js';

const FIXTURES_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const CONTENT_SCRIPT_SETTLE_MS = 500;

let mockApi: MockApiServer;
let fileServerPort: number;
let fileServer: http.Server;
let extensionContext: BrowserContext;

function createFixtureServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const rawPath = (req.url ?? '/').split('?')[0];
      const safeName = path.basename(rawPath) || 'index.html';
      const filePath = path.join(FIXTURES_DIR, safeName);

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript',
          '.css': 'text/css',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' });
        res.end(data);
      });
    });

    fileServer = server;
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

test.beforeAll(async () => {
  // OS-assigned free port -- never hardcoded (see mock-api-server.ts).
  mockApi = new MockApiServer();
  await mockApi.start();

  fileServerPort = await createFixtureServer();
  extensionContext = await buildExtensionContext();
});

test.afterAll(async () => {
  await closeContext(extensionContext);
  await mockApi.stop();
  await new Promise<void>((resolve) => fileServer.close(() => resolve()));
});

test.beforeEach(() => {
  mockApi.reset();
});

async function openConfiguredPage(opts?: {
  killSwitchEnabled?: boolean;
  apiBaseUrl?: string;
  disabledAdapters?: string[];
}): Promise<Page> {
  const apiBaseUrl =
    opts?.apiBaseUrl !== undefined ? opts.apiBaseUrl : `http://127.0.0.1:${mockApi.getPort()}`;

  await configureExtensionStorage(extensionContext, {
    apiBaseUrl,
    killSwitchEnabled: opts?.killSwitchEnabled ?? false,
    disabledAdapters: opts?.disabledAdapters ?? [],
  });

  return openFixturePage(extensionContext, fileServerPort, 'claude-wait-state.html');
}

test('extension loads on Claude fixture page without errors', async () => {
  const page = await openConfiguredPage();
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    if (!err.message.includes('favicon') && !err.message.includes('net::ERR_')) {
      errors.push(err.message);
    }
  });

  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  expect(errors).toHaveLength(0);
  await page.close();
});

test('sponsored banner appears when wait-state is triggered', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  await page.evaluate('window.fixtureStartWait()');

  const banner = await page.waitForSelector('#promptprofit-sponsored-banner', {
    state: 'visible',
    timeout: 8_000,
  });

  expect(await banner.getAttribute('aria-label')).toBe('PromptProfit Sponsored Moment');

  await page.close();
});

test('banner disappears when wait-state ends', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);
  await page.evaluate('window.fixtureStartWait()');

  await page.waitForSelector('#promptprofit-sponsored-banner', { state: 'visible', timeout: 8_000 });

  await page.evaluate('window.fixtureEndWait()');
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  const banner = await page.$('#promptprofit-sponsored-banner');
  expect(banner).toBeNull();

  await page.close();
});

test('disabled adapter (kill-switch) shows no banner', async () => {
  const page = await openConfiguredPage({ killSwitchEnabled: true });
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  await page.evaluate('window.fixtureStartWait()');
  await page.waitForTimeout(3_000);

  const banner = await page.$('#promptprofit-sponsored-banner');
  expect(banner).toBeNull();

  await page.close();
});

test('disabling only browser_claude via disabledAdapters shows no banner', async () => {
  const page = await openConfiguredPage({ disabledAdapters: ['browser_claude'] });
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  await page.evaluate('window.fixtureStartWait()');
  await page.waitForTimeout(3_000);

  const banner = await page.$('#promptprofit-sponsored-banner');
  expect(banner).toBeNull();

  await page.close();
});

test('missing api url shows no banner', async () => {
  const page = await openConfiguredPage({ apiBaseUrl: '' });
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  await page.evaluate('window.fixtureStartWait()');
  await page.waitForTimeout(3_000);

  const banner = await page.$('#promptprofit-sponsored-banner');
  expect(banner).toBeNull();

  await page.close();
});

test('ad-decision request and captured events for Claude contain no forbidden fields', async () => {
  const page = await openConfiguredPage();

  const capturedDecisionUrls: string[] = [];
  extensionContext.on('request', (request) => {
    if (request.url().includes('/v1/ads/decision')) {
      capturedDecisionUrls.push(request.url());
    }
  });

  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);
  await page.evaluate('window.fixtureStartWait()');
  await page.waitForSelector('#promptprofit-sponsored-banner', { state: 'visible', timeout: 8_000 });
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  const FORBIDDEN_FIELDS = [
    'pageUrl', 'pageTitle', 'domText', 'pageContent', 'cookies',
    'authToken', 'sessionCookie', 'screenshotData', 'clipboardContent',
    'sourceCode', 'fileContent',
  ];
  const ALLOWED_AD_DECISION_PARAMS = new Set(['adapterName', 'deviceId', 'extensionVersion']);

  for (const rawUrl of capturedDecisionUrls) {
    const url = new URL(rawUrl);
    for (const field of FORBIDDEN_FIELDS) {
      expect(url.searchParams.has(field)).toBe(false);
    }
    for (const [key] of url.searchParams.entries()) {
      expect(ALLOWED_AD_DECISION_PARAMS.has(key)).toBe(true);
    }
    // adapterName must correctly identify Claude, not ChatGPT/Gemini.
    expect(url.searchParams.get('adapterName')).toBe('browser_claude');
  }

  const events = mockApi.getCapturedEvents();
  for (const event of events) {
    const bodyStr = JSON.stringify(event.body);
    for (const field of FORBIDDEN_FIELDS) {
      expect(bodyStr).not.toContain(`"${field}"`);
    }
    expect((event.body as Record<string, unknown>)['adapterName']).toBe('browser_claude');
  }

  await page.close();
});
