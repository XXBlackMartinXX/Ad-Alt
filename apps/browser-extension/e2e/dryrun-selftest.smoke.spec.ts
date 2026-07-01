/**
 * Dry-run selftest: verifies the sponsored banner renders DETERMINISTICALLY
 * via the internal-beta forced demo fallback (dryRunDemoMode: true), with NO
 * dependency on wait-state detection, ChatGPT selector matching, generation
 * timing, or apiBaseUrl/the ad-decision API.
 *
 * This spec is the automated gate for DRYRUN-001 scheduling. It must pass
 * before a human tester is asked to run the dry-run. If it fails, the wrapper
 * script (scripts/dryrun-001-selftest.js) prints "BLOCKED BEFORE HUMAN TEST"
 * and exits non-zero.
 *
 * Critically, the primary test below never calls window.fixtureStartWait().
 * If it required that call to pass, it would only be proving the OLD
 * wait-state-dependent path all over again -- exactly the thing that kept
 * failing on real ChatGPT. See DRYRUN-001_DEFINITIVE_BANNER_FIX.md.
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
// PRIMARY GATE: forced demo fallback renders with NO wait-state trigger at all
// ---------------------------------------------------------------------------

test('dryrun-selftest: forced internal-beta demo fallback banner rendered (no wait-state, no apiBaseUrl)', async () => {
  // Configure storage: demo mode ON, kill-switch OFF, no apiBaseUrl.
  // This mirrors a fresh internal-beta install where onInstalled writes these defaults.
  await configureExtensionStorage(extensionContext, {
    dryRunDemoMode: true,
    killSwitchEnabled: false,
    disabledAdapters: [],
    // apiBaseUrl intentionally omitted — the forced fallback must not need it.
  });

  const page = await openFixturePage(extensionContext, fileServerPort);

  // Deliberately do NOT call window.fixtureStartWait(). The forced fallback
  // must render on its own, driven only by extension load + demo mode +
  // supported host + kill-switch off -- proving the banner no longer depends
  // on wait-state selector matching or generation timing.
  await expect(page.locator('#promptprofit-sponsored-banner')).toBeVisible({ timeout: 5_000 });

  // Verify the banner contains the expected demo content.
  const bannerText = await page.locator('#promptprofit-sponsored-banner').innerText();
  expect(bannerText).toContain('PromptProfit');

  // Verify the close button is present and visible.
  const closeBtn = page.locator('button[aria-label="Dismiss sponsored moment"]');
  await expect(closeBtn).toBeVisible();

  // Confirm no stop-button / wait-state signal was ever present on this page
  // (this fixture never had fixtureStartWait() called) -- the banner appeared
  // despite that, which is exactly the property being verified.
  const stopButton = await page.$('[data-testid="stop-button"]');
  expect(stopButton).toBeNull();

  // Click close — banner must be removed from DOM.
  await closeBtn.click();
  await expect(page.locator('#promptprofit-sponsored-banner')).toBeHidden({ timeout: 2_000 });

  await page.close();

  // eslint-disable-next-line no-console
  console.log('PASS: forced internal-beta demo fallback banner rendered');
});

// ---------------------------------------------------------------------------
// Backward-compatibility check: the normal wait-state path still works too
// (demo mode content is identical either way; this just proves the older
// path was not broken by adding the fallback).
// ---------------------------------------------------------------------------

test('dryrun-selftest: banner also renders via the normal wait-state path in demo mode', async () => {
  await configureExtensionStorage(extensionContext, {
    dryRunDemoMode: true,
    killSwitchEnabled: false,
    disabledAdapters: [],
  });

  const page = await openFixturePage(extensionContext, fileServerPort);
  await page.evaluate(() => (window as unknown as { fixtureStartWait: () => void }).fixtureStartWait());

  await expect(page.locator('#promptprofit-sponsored-banner')).toBeVisible({ timeout: 5_000 });

  await page.close();
});

// ---------------------------------------------------------------------------
// Sanity check: kill-switch still blocks the banner even in demo mode,
// including the forced fallback path (no wait-state trigger needed here either).
// ---------------------------------------------------------------------------

test('dryrun-selftest: kill-switch blocks banner even with demo mode', async () => {
  await configureExtensionStorage(extensionContext, {
    dryRunDemoMode: true,
    killSwitchEnabled: true,  // kill-switch ON
    disabledAdapters: [],
  });

  const page = await openFixturePage(extensionContext, fileServerPort);

  await page.waitForTimeout(SETTLE_MS);

  // Kill-switch must suppress the banner regardless of demo mode, even
  // without ever triggering a wait-state.
  await expect(page.locator('#promptprofit-sponsored-banner')).toBeHidden();

  await page.close();
});
