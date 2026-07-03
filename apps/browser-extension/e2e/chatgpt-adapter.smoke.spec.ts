/**
 * Smoke tests for the ChatGPT adapter integration.
 *
 * These tests load the compiled extension in a real Chromium browser, serve a
 * static fixture page, and verify that the sponsored banner lifecycle works
 * end-to-end.
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');

// Milliseconds to wait after triggering a wait-state before asserting.
// The MutationObserver in the extension has a ~150 ms throttle; 500 ms is safe.
const CONTENT_SCRIPT_SETTLE_MS = 500;

// ---------------------------------------------------------------------------
// Shared server state (shared across tests in this file)
// ---------------------------------------------------------------------------

let mockApi: MockApiServer;
let fileServerPort: number;
let fileServer: http.Server;
let extensionContext: BrowserContext;

// ---------------------------------------------------------------------------
// Static fixture file server (serves e2e/fixtures/)
// ---------------------------------------------------------------------------

function createFixtureServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Only serve GET requests; strip query strings.
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
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] ?? 'application/octet-stream',
        });
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

// ---------------------------------------------------------------------------
// Suite setup / teardown
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  // Start mock API server on an OS-assigned free port (never a hardcoded
  // one -- see mock-api-server.ts's start() doc comment for why).
  mockApi = new MockApiServer();
  await mockApi.start();

  // Start static fixture file server.
  fileServerPort = await createFixtureServer();

  // Launch Chromium with the extension loaded.
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

// ---------------------------------------------------------------------------
// Helper: open a configured fixture page
// ---------------------------------------------------------------------------

async function openConfiguredPage(opts?: {
  killSwitchEnabled?: boolean;
  apiBaseUrl?: string;
  disabledAdapters?: string[];
  testViewabilityThresholdMs?: number;
}): Promise<Page> {
  const apiBaseUrl =
    opts?.apiBaseUrl !== undefined
      ? opts.apiBaseUrl
      : `http://127.0.0.1:${mockApi.getPort()}`;

  await configureExtensionStorage(extensionContext, {
    apiBaseUrl,
    killSwitchEnabled: opts?.killSwitchEnabled ?? false,
    disabledAdapters: opts?.disabledAdapters ?? [],
    testViewabilityThresholdMs: opts?.testViewabilityThresholdMs,
  });

  return openFixturePage(extensionContext, fileServerPort);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('extension loads on fixture page without errors', async () => {
  const page = await openConfiguredPage();
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    // Filter out errors that are irrelevant to the extension itself.
    if (
      !err.message.includes('favicon') &&
      !err.message.includes('net::ERR_')
    ) {
      errors.push(err.message);
    }
  });

  // Give scripts time to initialise.
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  expect(errors).toHaveLength(0);
  await page.close();
});

test('fixture page reports idle state initially', async () => {
  const page = await openConfiguredPage();

  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  // No stop-button (fixture UI artefact that appears only during a wait-state).
  const stopButton = await page.$('[data-testid="stop-button"]');
  expect(stopButton).toBeNull();

  // No sponsored banner.
  const banner = await page.$('#promptprofit-sponsored-banner');
  expect(banner).toBeNull();

  await page.close();
});

test('sponsored banner appears when wait-state is triggered', async () => {
  const page = await openConfiguredPage();

  // Let the content script attach.
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  // Trigger the wait-state so the adapter detects a pending generation.
  await page.evaluate('window.fixtureStartWait()');

  // Wait for the banner to appear.
  const banner = await page.waitForSelector('#promptprofit-sponsored-banner', {
    state: 'visible',
    timeout: 8_000,
  });

  expect(await banner.getAttribute('aria-label')).toBe(
    'PromptProfit Sponsored Moment',
  );

  await page.close();
});

test('banner has required sponsorship label', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);
  await page.evaluate('window.fixtureStartWait()');

  await page.waitForSelector('#promptprofit-sponsored-banner', {
    state: 'visible',
    timeout: 8_000,
  });

  const bannerText = await page.locator('#promptprofit-sponsored-banner').innerText();
  // The label may be rendered in uppercase via CSS — compare case-insensitively.
  expect(bannerText.toLowerCase()).toContain('promptprofit');
  expect(bannerText.toLowerCase()).toContain('sponsored');

  await page.close();
});

test('banner has close button', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);
  await page.evaluate('window.fixtureStartWait()');

  await page.waitForSelector('#promptprofit-sponsored-banner', {
    state: 'visible',
    timeout: 8_000,
  });

  const closeButton = page.locator(
    '[aria-label="Dismiss sponsored moment"]',
  );
  await expect(closeButton).toBeVisible();

  await page.close();
});

test('banner disappears when close button is clicked', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);
  await page.evaluate('window.fixtureStartWait()');

  await page.waitForSelector('#promptprofit-sponsored-banner', {
    state: 'visible',
    timeout: 8_000,
  });

  await page.click('[aria-label="Dismiss sponsored moment"]');

  await page.waitForSelector('#promptprofit-sponsored-banner', {
    state: 'detached',
    timeout: 5_000,
  });

  await page.close();
});

test('banner disappears when wait-state ends', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);
  await page.evaluate('window.fixtureStartWait()');

  await page.waitForSelector('#promptprofit-sponsored-banner', {
    state: 'visible',
    timeout: 8_000,
  });

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

  // Wait long enough that the banner would have appeared if enabled.
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

// ---------------------------------------------------------------------------
// Viewability threshold E2E
//
// The production threshold is 5 000 ms — too long for fast E2E.
// We configure testViewabilityThresholdMs: 200 in chrome.storage.local, which
// fixture-test.ts reads and passes to ViewabilityObserver. chatgpt.ts (the
// production content script) never reads this key, so the production threshold
// is never weakened in the field.
// ---------------------------------------------------------------------------

test('viewability_threshold_met fires after test threshold', async () => {
  // Use a 200 ms threshold so the event fires in well under 1 s.
  const TEST_THRESHOLD_MS = 200;

  const page = await openConfiguredPage({ testViewabilityThresholdMs: TEST_THRESHOLD_MS });

  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);
  await page.evaluate('window.fixtureStartWait()');

  // Wait for the banner — viewability observation starts when it enters the DOM.
  await page.waitForSelector('#promptprofit-sponsored-banner', {
    state: 'visible',
    timeout: 8_000,
  });

  // Wait for threshold + buffer for service-worker round-trip.
  await page.waitForTimeout(TEST_THRESHOLD_MS + 400);

  const events = mockApi.getCapturedEvents();
  const viewabilityEvents = events.filter((e) => {
    const body = e.body as Record<string, unknown>;
    return body?.['eventType'] === 'viewability_threshold_met';
  });

  expect(viewabilityEvents).toHaveLength(1);

  const body = viewabilityEvents[0].body as Record<string, unknown>;

  // displayedDurationMs should be at least the configured threshold.
  expect(typeof body['displayedDurationMs']).toBe('number');
  expect(body['displayedDurationMs'] as number).toBeGreaterThanOrEqual(TEST_THRESHOLD_MS);

  // thresholdMs in the event must reflect the configured test threshold.
  expect(body['thresholdMs']).toBe(TEST_THRESHOLD_MS);

  // Standard event identifiers must be present.
  expect(typeof body['eventId']).toBe('string');
  expect(typeof body['adDecisionId']).toBe('string');
  expect(typeof body['sessionId']).toBe('string');
  expect(body['eventType']).toBe('viewability_threshold_met');

  // Privacy: no forbidden fields in the event payload.
  const FORBIDDEN_FIELDS = [
    'pageUrl', 'pageTitle', 'domText', 'promptText',
    'aiResponse', 'chatHistory', 'cookies', 'authToken', 'sessionCookie',
  ];
  for (const field of FORBIDDEN_FIELDS) {
    expect(body, `forbidden field "${field}" found in viewability event`).not.toHaveProperty(field);
  }

  await page.close();
});
