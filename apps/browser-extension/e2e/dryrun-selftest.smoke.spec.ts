/**
 * Dry-run selftest: verifies the sponsored banner renders without any API
 * configuration by relying on internal demo mode (dryRunDemoMode: true).
 *
 * This spec is the automated gate for DRYRUN-001 scheduling. It must pass
 * before a human tester is asked to run the dry-run. If it fails, the wrapper
 * script (scripts/dryrun-001-selftest.js) prints "BLOCKED BEFORE HUMAN TEST"
 * and exits non-zero.
 *
 * PRIVACY: No real ChatGPT content, user data, screenshots, or API responses
 * are captured here. The fixture page is entirely synthetic.
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type BrowserContext } from '@playwright/test';
import {
  buildExtensionContext,
  closeContext,
  configureExtensionStorage,
  openFixturePage,
} from './helpers/extension-context.js';

const FIXTURES_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');

// MutationObserver throttle is ~150 ms; 800 ms is well above that plus rendering.
const SETTLE_MS = 800;

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
  fileServerPort = await createFixtureServer();
  extensionContext = await buildExtensionContext();
});

test.afterAll(async () => {
  await closeContext(extensionContext);
  await new Promise<void>((resolve) => fileServer.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// Gate test: banner must render with demo mode and NO apiBaseUrl
// ---------------------------------------------------------------------------

test('dryrun-selftest: banner renders in demo mode without API config', async () => {
  // Configure storage: demo mode ON, kill-switch OFF, no apiBaseUrl.
  // This mirrors a fresh internal-beta install where onInstalled writes these defaults.
  await configureExtensionStorage(extensionContext, {
    dryRunDemoMode: true,
    killSwitchEnabled: false,
    disabledAdapters: [],
    // apiBaseUrl intentionally omitted — this is the key constraint being tested.
  });

  const page = await openFixturePage(extensionContext, fileServerPort);

  // Trigger the ChatGPT wait-state signal in the fixture page.
  // This adds [data-testid="stop-button"] to the DOM, which the MutationObserver picks up.
  await page.evaluate(() => (window as unknown as { fixtureStartWait: () => void }).fixtureStartWait());

  // Wait for the sponsored banner to appear.
  // Timeout of 5 s gives the service worker round-trip and MutationObserver throttle time.
  await expect(page.locator('#promptprofit-sponsored-banner')).toBeVisible({ timeout: 5_000 });

  // Verify the banner contains the expected demo content.
  const bannerText = await page.locator('#promptprofit-sponsored-banner').innerText();
  expect(bannerText).toContain('PromptProfit');

  // Verify the close button is present and visible.
  const closeBtn = page.locator('button[aria-label="Dismiss sponsored moment"]');
  await expect(closeBtn).toBeVisible();

  // Click close — banner must be removed from DOM.
  await closeBtn.click();
  await expect(page.locator('#promptprofit-sponsored-banner')).toBeHidden({ timeout: 2_000 });

  await page.close();
});

// ---------------------------------------------------------------------------
// Sanity check: kill-switch still blocks the banner even in demo mode
// ---------------------------------------------------------------------------

test('dryrun-selftest: kill-switch blocks banner even with demo mode', async () => {
  await configureExtensionStorage(extensionContext, {
    dryRunDemoMode: true,
    killSwitchEnabled: true,  // kill-switch ON
    disabledAdapters: [],
  });

  const page = await openFixturePage(extensionContext, fileServerPort);
  await page.evaluate(() => (window as unknown as { fixtureStartWait: () => void }).fixtureStartWait());

  await page.waitForTimeout(SETTLE_MS);

  // Kill-switch must suppress the banner regardless of demo mode.
  await expect(page.locator('#promptprofit-sponsored-banner')).toBeHidden();

  await page.close();
});
