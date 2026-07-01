/**
 * Playwright browser-context helpers for loading the PromptProfit Chrome
 * extension during E2E tests.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtensionConfig {
  /** API base URL written to storage. Omit or leave empty to simulate no-API state. */
  apiBaseUrl?: string;
  killSwitchEnabled?: boolean;
  disabledAdapters?: string[];
  debugMode?: boolean;
  /**
   * Test-only: override the viewability billable threshold (ms) in the fixture
   * content script. Only fixture-test.ts reads this key. chatgpt.ts (production)
   * never reads it, ensuring production thresholds are never weakened in the field.
   */
  testViewabilityThresholdMs?: number;
  /**
   * Local-dev-only API key forwarded as Authorization: Bearer in the service
   * worker. NEVER included in event payloads, debug panel, or reports.
   * Only used for local real-API smoke tests — never set in production.
   */
  apiKey?: string;
  /**
   * Device ID written to chrome.storage.local so the service worker can
   * include it in /v1/ads/decision requests. When omitted, the service worker
   * generates and persists its own UUID. For local-API smoke tests, set this to
   * the same deviceId used when minting the dev API key.
   */
  deviceId?: string;
  /**
   * When true, the service worker returns a hardcoded placeholder ad decision
   * without contacting the API. Requires an internal-beta build. Used in the
   * dry-run selftest to verify the banner renders without API configuration.
   * Defaults to false — always explicitly written to storage for test isolation.
   */
  dryRunDemoMode?: boolean;
  /**
   * When true, the internal-beta-only live dry-run diagnostics panel is
   * mounted on the fixture page (requires an internal-beta build; bundle-test.mjs
   * always builds internal-beta). Defaults to false — always explicitly
   * written to storage for test isolation.
   */
  dryRunDiagnosticsEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Absolute path to the compiled test extension bundle.
 * The build script (`pnpm build:test`) outputs to dist-test/.
 */
const EXTENSION_PATH = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
  'dist-test',
);

// ---------------------------------------------------------------------------
// buildExtensionContext
// ---------------------------------------------------------------------------

/**
 * Launch a Chromium persistent context with the extension loaded.
 * Returns the context after waiting for the extension service worker to
 * register itself.
 */
export async function buildExtensionContext(): Promise<BrowserContext> {
  const args = [
    // Chrome's new headless mode (112+) supports extensions; old --headless does not.
    '--headless=new',
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
  ];

  // --no-sandbox / --disable-setuid-sandbox are only needed in Linux containers.
  if (process.platform !== 'win32') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  // Allow an explicit override via env var; on Linux fall back to the
  // pre-installed Chromium symlink so version-pinned Playwright still works
  // when the managed binary revision differs from what is cached on the host.
  const customPath =
    process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] ??
    (process.platform !== 'win32' ? '/opt/pw-browsers/chromium' : undefined);

  const context = await chromium.launchPersistentContext('', {
    // headless: false is required so Playwright does not inject --headless itself;
    // the --headless=new arg above enables Chrome's new headless mode.
    headless: false,
    ...(customPath ? { executablePath: customPath } : {}),
    args,
  });

  // Wait until the extension service worker appears in the context.
  await waitForServiceWorker(context);

  return context;
}

// ---------------------------------------------------------------------------
// getExtensionId
// ---------------------------------------------------------------------------

/**
 * Extract the unpacked extension's ID from the service worker URL.
 * Service worker URLs look like: chrome-extension://<id>/service-worker.js
 */
export function getExtensionId(context: BrowserContext): string {
  const workers = context.serviceWorkers();
  for (const sw of workers) {
    const match = sw.url().match(/^chrome-extension:\/\/([a-z]{32})\//);
    if (match) {
      return match[1];
    }
  }
  throw new Error(
    'Extension service worker not found. Did you call buildExtensionContext() first?',
  );
}

// ---------------------------------------------------------------------------
// configureExtensionStorage
// ---------------------------------------------------------------------------

/**
 * Write configuration values into the extension's chrome.storage.local via
 * the service worker's execution context.
 *
 * Retries up to 3 times because MV3 service workers may be terminated between
 * `buildExtensionContext()` and the first `beforeEach`, causing `sw.evaluate()`
 * to fail. On failure we wait for a fresh serviceworker registration event.
 */
export async function configureExtensionStorage(
  context: BrowserContext,
  config: ExtensionConfig,
): Promise<void> {
  const args = [
    config.apiBaseUrl ?? "",
    config.killSwitchEnabled ?? false,
    config.disabledAdapters ?? [],
    config.debugMode ?? false,
    config.testViewabilityThresholdMs ?? null,
    config.apiKey ?? null,
    config.deviceId ?? null,
    config.dryRunDemoMode ?? false,
    config.dryRunDiagnosticsEnabled ?? false,
  ] as [string, boolean, string[], boolean, number | null, string | null, string | null, boolean, boolean];

  const doEvaluate = async () => {
    const sw = await getOrWaitForServiceWorker(context);
    await sw.evaluate(
      ([apiBaseUrl, killSwitchEnabled, disabledAdapters, debugMode, testViewabilityThresholdMs, apiKey, deviceId, dryRunDemoMode, dryRunDiagnosticsEnabled]: [
        string,
        boolean,
        string[],
        boolean,
        number | null,
        string | null,
        string | null,
        boolean,
        boolean,
      ]) => {
        return new Promise<void>((resolve, reject) => {
          const items: Record<string, unknown> = {
            apiBaseUrl,
            debugMode,
            featureFlags: {
              killSwitchEnabled,
              disabledAdapters,
              flags: {},
            },
          };
          // Only write testViewabilityThresholdMs when provided — avoids
          // accidentally carrying a previous value across tests.
          if (testViewabilityThresholdMs !== null) {
            items["testViewabilityThresholdMs"] = testViewabilityThresholdMs;
          } else {
            items["testViewabilityThresholdMs"] = null;
          }
          // apiKey: local-dev-only; null clears it (never bleeds across tests).
          // SECURITY: apiKey is stored in extension storage only — never written
          // to event payloads, debug panel, or any generated report.
          items["apiKey"] = apiKey ?? null;
          // deviceId: when set, the service worker uses this ID in /v1/ads/decision
          // requests. null clears any previously set value so the SW auto-generates.
          items["deviceId"] = deviceId ?? null;
          // Always write dryRunDemoMode so each test starts with an explicit value
          // (prevents onInstalled's write from bleeding into tests that don't set it).
          items["dryRunDemoMode"] = dryRunDemoMode;
          // Same reasoning for the live diagnostics panel toggle.
          items["dryRunDiagnosticsEnabled"] = dryRunDiagnosticsEnabled;
          // @ts-ignore — running inside Chrome extension service worker context
          chrome.storage.local.set(items, () => {
            // @ts-ignore
            if (chrome.runtime.lastError) {
              // @ts-ignore
              reject(new Error(String(chrome.runtime.lastError.message ?? chrome.runtime.lastError)));
            } else {
              resolve();
            }
          });
        });
      },
      args,
    );
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await doEvaluate();
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      // Give the service worker time to restart before retrying.
      await new Promise<void>((r) => setTimeout(r, 300));
    }
  }
}

// ---------------------------------------------------------------------------
// openFixturePage
// ---------------------------------------------------------------------------

/**
 * Open a new tab in the given context and navigate to the fixture page.
 *
 * @param context - The Playwright browser context (with extension loaded).
 * @param fixtureServerPort - Port on which the static fixture file server is listening.
 * @param page - Optional filename; defaults to 'chatgpt-wait-state.html'.
 */
export async function openFixturePage(
  context: BrowserContext,
  fixtureServerPort: number,
  page = 'chatgpt-wait-state.html',
): Promise<Page> {
  const tab = await context.newPage();
  const url = `http://127.0.0.1:${fixtureServerPort}/${page}`;
  await tab.goto(url, { waitUntil: 'domcontentloaded' });
  return tab;
}

// ---------------------------------------------------------------------------
// closeContext
// ---------------------------------------------------------------------------

/** Gracefully close the browser context after a test suite. */
export async function closeContext(context: BrowserContext | null | undefined): Promise<void> {
  if (context) await context.close();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getServiceWorker(context: BrowserContext) {
  const workers = context.serviceWorkers();
  const sw = workers.find((w) =>
    w.url().startsWith('chrome-extension://'),
  );
  if (!sw) {
    throw new Error(
      'Extension service worker not found. Ensure the extension is loaded and the service worker has registered.',
    );
  }
  return sw;
}

/**
 * Return the service worker if it is already registered, or wait up to
 * timeoutMs for it to (re-)register. MV3 service workers can be terminated
 * by Chrome between test steps; this helper ensures we always get a live SW.
 */
async function getOrWaitForServiceWorker(
  context: BrowserContext,
  timeoutMs = 10_000,
) {
  const workers = context.serviceWorkers();
  const existing = workers.find((w) => w.url().startsWith('chrome-extension://'));
  if (existing) return existing;

  // Service worker was terminated; wait for it to restart.
  return context.waitForEvent('serviceworker', {
    predicate: (sw) => sw.url().startsWith('chrome-extension://'),
    timeout: timeoutMs,
  });
}

async function waitForServiceWorker(
  context: BrowserContext,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const workers = context.serviceWorkers();
    const found = workers.some((sw) =>
      sw.url().startsWith('chrome-extension://'),
    );
    if (found) return;

    // Poll by waiting for the next serviceWorker event or a short tick.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 200);
      context.once('serviceworker', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  throw new Error(
    `Timed out waiting ${timeoutMs}ms for the extension service worker to register.`,
  );
}
