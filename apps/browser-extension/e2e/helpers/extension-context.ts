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
  apiBaseUrl: string;
  killSwitchEnabled?: boolean;
  disabledAdapters?: string[];
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
  const context = await chromium.launchPersistentContext('', {
    // headless: false is required so Playwright does not inject --headless itself;
    // --headless=new below is Chrome's new headless mode which supports extensions.
    headless: false,
    executablePath: '/opt/pw-browsers/chromium',
    args: [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
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
    config.apiBaseUrl,
    config.killSwitchEnabled ?? false,
    config.disabledAdapters ?? [],
  ] as [string, boolean, string[]];

  const doEvaluate = async () => {
    const sw = await getOrWaitForServiceWorker(context);
    await sw.evaluate(
      ([apiBaseUrl, killSwitchEnabled, disabledAdapters]: [
        string,
        boolean,
        string[],
      ]) => {
        return new Promise<void>((resolve, reject) => {
          const items = {
            apiBaseUrl,
            featureFlags: {
              killSwitchEnabled,
              disabledAdapters,
              flags: {},
            },
          };
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
export async function closeContext(context: BrowserContext): Promise<void> {
  await context.close();
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
