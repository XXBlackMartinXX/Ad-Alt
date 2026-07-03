/**
 * Fixture E2E tests for the internal-beta-only live dry-run diagnostics panel.
 *
 * These tests prove that the panel added for DRYRUN-001 correctly reflects
 * runtime state (adapter active, wait-state detected, ad decision, banner
 * render/visible/closed, kill-switch) using ONLY the synthetic fixture page —
 * no real ChatGPT login, prompt entry, or page content is touched.
 *
 * Note on "production mode does not expose the panel": this suite always
 * runs against dist-test/, which bundle-test.mjs always builds with
 * PROMPTPROFIT_BUILD_MODE="internal-beta" (required so the panel can be
 * exercised at all). Build-mode-based invisibility in a real production
 * artifact is proven separately by scripts/audit-browser-extension-zip.js
 * (Check 3b), which decompresses the actual shipped JS and fails a
 * public-release ZIP if any internal-beta-only string is found. What THIS
 * suite proves is the second, independent gate: the panel stays unmounted
 * unless `dryRunDiagnosticsEnabled` is explicitly true in storage.
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
const PANEL_SELECTOR = '#promptprofit-dryrun-diagnostics';

// Forbidden compound terms that must never appear in a diagnostic panel
// data-attribute NAME -- defense-in-depth on top of the unit tests in
// src/__tests__/dryrun-diagnostics.test.ts. These are checked against
// attribute names only (not values, and not the "id"/"aria-label"/"style"
// attributes), since "prompt" alone would false-positive on our own brand
// name "PromptProfit" -- the concern is a forbidden diagnostic FIELD, not
// the substring "prompt" appearing anywhere on the page.
const FORBIDDEN_ATTR_NAME_TERMS = [
  'prompttext',
  'responsetext',
  'airesponse',
  'chathistory',
  'domtext',
  'pagecontent',
  'pagetitle',
  'pageurl',
  'fullurl',
  'querystring',
  'conversationid',
  'cookie',
  'token',
  'localstorage',
  'sessionstorage',
  'clipboard',
  'screenshot',
  'video',
  'trace',
  'apikey',
];

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
  dryRunDemoMode?: boolean;
  dryRunDiagnosticsEnabled?: boolean;
  apiBaseUrl?: string;
}): Promise<Page> {
  await configureExtensionStorage(extensionContext, {
    apiBaseUrl: opts?.apiBaseUrl ?? `http://127.0.0.1:${mockApi.getPort()}`,
    killSwitchEnabled: opts?.killSwitchEnabled ?? false,
    dryRunDemoMode: opts?.dryRunDemoMode ?? false,
    dryRunDiagnosticsEnabled: opts?.dryRunDiagnosticsEnabled ?? true,
  });
  return openFixturePage(extensionContext, fileServerPort);
}

// ---------------------------------------------------------------------------
// 1. Panel appears when diagnostics are enabled
// ---------------------------------------------------------------------------

test('diagnostic panel appears when dryRunDiagnosticsEnabled is true', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  const panel = page.locator(PANEL_SELECTOR);
  await expect(panel).toBeVisible();
  expect(await panel.getAttribute('data-extension-loaded')).toBe('true');
  expect(await panel.getAttribute('data-platform-detected')).toBe('chatgpt');

  await page.close();
});

// ---------------------------------------------------------------------------
// 2. Adapter active but no wait-state yet
// ---------------------------------------------------------------------------

test('adapter active with no wait-state shows correct panel state', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  const panel = page.locator(PANEL_SELECTOR);
  expect(await panel.getAttribute('data-adapter-active')).toBe('true');
  expect(await panel.getAttribute('data-wait-state-detected')).toBe('false');
  expect(await panel.getAttribute('data-status-label')).toBe('Waiting for generation state');

  await page.close();
});

// ---------------------------------------------------------------------------
// 3. Wait-state detected + demo mode -> ad decision received
// ---------------------------------------------------------------------------

test('wait-state detected with demo mode shows ad decision received', async () => {
  const page = await openConfiguredPage({ dryRunDemoMode: true, apiBaseUrl: '' });
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  await page.evaluate('window.fixtureStartWait()');

  const panel = page.locator(PANEL_SELECTOR);
  await expect(panel).toHaveAttribute('data-wait-state-detected', 'true', { timeout: 5_000 });
  await expect(panel).toHaveAttribute('data-ad-decision-received', 'true', { timeout: 5_000 });
  expect(await panel.getAttribute('data-demo-mode')).toBe('true');

  await page.close();
});

// ---------------------------------------------------------------------------
// 4. Banner rendered updates banner_rendered / banner_visible
// ---------------------------------------------------------------------------

test('banner rendering updates banner_rendered and banner_visible', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  await page.evaluate('window.fixtureStartWait()');
  await page.waitForSelector('#promptprofit-sponsored-banner', { state: 'visible', timeout: 8_000 });

  const panel = page.locator(PANEL_SELECTOR);
  await expect(panel).toHaveAttribute('data-banner-render-attempted', 'true', { timeout: 5_000 });
  await expect(panel).toHaveAttribute('data-banner-rendered', 'true', { timeout: 5_000 });
  await expect(panel).toHaveAttribute('data-banner-visible', 'true', { timeout: 5_000 });
  expect(await panel.getAttribute('data-status-label')).toBe('Banner visible');

  await page.close();
});

// ---------------------------------------------------------------------------
// 5. Close button updates banner_closed
// ---------------------------------------------------------------------------

test('closing the banner updates banner_closed', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  await page.evaluate('window.fixtureStartWait()');
  await page.waitForSelector('#promptprofit-sponsored-banner', { state: 'visible', timeout: 8_000 });

  const panel = page.locator(PANEL_SELECTOR);
  await expect(panel).toHaveAttribute('data-banner-closed', 'false');

  await page.click('[aria-label="Dismiss sponsored moment"]');

  await expect(panel).toHaveAttribute('data-banner-closed', 'true', { timeout: 3_000 });

  await page.close();
});

// ---------------------------------------------------------------------------
// 6. Kill-switch active suppresses banner and updates kill_switch_active
// ---------------------------------------------------------------------------

test('kill-switch active updates kill_switch_active and suppresses the banner', async () => {
  const page = await openConfiguredPage({ killSwitchEnabled: true });
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  const panel = page.locator(PANEL_SELECTOR);
  await expect(panel).toHaveAttribute('data-kill-switch-active', 'true');
  expect(await panel.getAttribute('data-last-error-code')).toBe('kill_switch_active');

  await page.evaluate('window.fixtureStartWait()');
  await page.waitForTimeout(3_000);

  const banner = await page.$('#promptprofit-sponsored-banner');
  expect(banner).toBeNull();

  await page.close();
});

// ---------------------------------------------------------------------------
// 7. Panel does not mount unless explicitly enabled (independent of build mode)
// ---------------------------------------------------------------------------

test('diagnostic panel does not mount when dryRunDiagnosticsEnabled is false', async () => {
  const page = await openConfiguredPage({ dryRunDiagnosticsEnabled: false });
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  const panel = await page.$(PANEL_SELECTOR);
  expect(panel).toBeNull();

  await page.close();
});

// ---------------------------------------------------------------------------
// 8. Panel attributes contain no forbidden substrings
// ---------------------------------------------------------------------------

test('diagnostic panel attributes contain no forbidden data', async () => {
  const page = await openConfiguredPage();
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);
  await page.evaluate('window.fixtureStartWait()');
  await page.waitForSelector('#promptprofit-sponsored-banner', { state: 'visible', timeout: 8_000 });

  // Only inspect data-* attribute NAMES -- these are the actual diagnostic
  // state surface. "id", "aria-label", "role", and "style" are excluded
  // because they legitimately contain our own product name ("PromptProfit"),
  // which must not be confused with a forbidden content field.
  const dataAttrNames = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return [];
    return Array.from(el.attributes)
      .map((a) => a.name)
      .filter((name) => name.startsWith('data-'));
  }, PANEL_SELECTOR);

  const joinedNames = dataAttrNames.join(' ').toLowerCase().replace(/-/g, '');
  for (const forbidden of FORBIDDEN_ATTR_NAME_TERMS) {
    expect(joinedNames).not.toContain(forbidden);
  }

  await page.close();
});

// ---------------------------------------------------------------------------
// 9. Forced demo fallback renders even when wait-state selectors never match
//    (no window.fixtureStartWait() call anywhere in this test)
// ---------------------------------------------------------------------------

test('forced demo fallback renders banner and diagnostics without any wait-state trigger', async () => {
  const page = await openConfiguredPage({ dryRunDemoMode: true, apiBaseUrl: '' });

  // Deliberately never call fixtureStartWait() — the stop-button selector
  // never appears, so the normal wait-state path could never fire.
  await expect(page.locator('#promptprofit-sponsored-banner')).toBeVisible({ timeout: 5_000 });

  const panel = page.locator(PANEL_SELECTOR);
  await expect(panel).toHaveAttribute('data-demo-fallback-active', 'true');
  await expect(panel).toHaveAttribute('data-demo-fallback-rendered', 'true');
  await expect(panel).toHaveAttribute('data-banner-visible', 'true');
  expect(await panel.getAttribute('data-status-label')).toBe('Banner visible');

  // Confirm no stop-button was ever present (proves this isn't the wait-state path).
  const stopButton = await page.$('[data-testid="stop-button"]');
  expect(stopButton).toBeNull();

  await page.close();
});

// ---------------------------------------------------------------------------
// 10. Forced demo fallback sends NO billing/event telemetry
// ---------------------------------------------------------------------------

test('forced demo fallback does not send billing/event telemetry', async () => {
  // apiBaseUrl points at the real mock server this time — if the fallback
  // path called any of the ad-event-sender functions, POST /v1/events would
  // be captured here. It must not be, for any reason (this is a synthetic
  // placeholder banner, not a billable impression).
  const page = await openConfiguredPage({ dryRunDemoMode: true });

  await expect(page.locator('#promptprofit-sponsored-banner')).toBeVisible({ timeout: 5_000 });

  // Give any (incorrect) async telemetry call time to land before asserting.
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  expect(mockApi.getCapturedEvents()).toHaveLength(0);

  await page.close();
});

// ---------------------------------------------------------------------------
// 11. No duplicate banners when a real wait-state fires after the forced
//     fallback is already showing (SPA-like: content script stays loaded,
//     a later generation cycle must not create a second banner element)
// ---------------------------------------------------------------------------

test('no duplicate banners when wait-state fires after the forced fallback is already visible', async () => {
  const page = await openConfiguredPage({ dryRunDemoMode: true, apiBaseUrl: '' });

  await expect(page.locator('#promptprofit-sponsored-banner')).toBeVisible({ timeout: 5_000 });

  // Now trigger a real wait-state cycle while the forced fallback banner is
  // still up. This must not create a second banner element or re-attempt a
  // render — the existing banner (and only it) must remain.
  await page.evaluate('window.fixtureStartWait()');
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);
  await page.evaluate('window.fixtureEndWait()');
  await page.waitForTimeout(CONTENT_SCRIPT_SETTLE_MS);

  const banners = await page.$$('#promptprofit-sponsored-banner');
  expect(banners).toHaveLength(1);

  // The forced fallback banner must still be visible — a real (fleeting)
  // wait-state ending must not tear it down before its protected window.
  await expect(page.locator('#promptprofit-sponsored-banner')).toBeVisible();

  await page.close();
});
