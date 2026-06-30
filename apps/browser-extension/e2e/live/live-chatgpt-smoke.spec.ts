/**
 * Guided live ChatGPT smoke test — human operator required.
 *
 * What this test does (and does NOT do):
 *
 *  DOES:
 *   - Launch a real Chromium window with the PromptProfit extension loaded
 *   - Configure the extension to POST ad events to a local mock API (so events
 *     are captured without touching any external service)
 *   - Enable the extension debug panel (opt-in overlay — controlled entirely by
 *     the extension, never reads page content)
 *   - Navigate to chatgpt.com and wait for a human to log in and submit a prompt
 *   - Verify the sponsored banner appears (by ID — extension-owned DOM only)
 *   - Verify ad events arrive at the local mock API
 *   - Write a JSON + Markdown smoke report to test-results/live/
 *
 *  DOES NOT:
 *   - Automate login or session extraction
 *   - Read page content, user input, AI responses, or any ChatGPT DOM text
 *   - Read cookies, auth tokens, localStorage, or sessionStorage from ChatGPT
 *   - Intercept ChatGPT network requests
 *   - Take screenshots or record video by default
 *   - Use private or undocumented ChatGPT APIs
 *
 * PRIVACY RULE: All assertions target only extension-owned elements:
 *   #promptprofit-sponsored-banner
 *   #promptprofit-debug-panel[data-*]
 * No ChatGPT page content is read at any point.
 */

import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { MockApiServer } from "../mock-api-server.js";
import {
  configureExtensionStorage,
  closeContext,
} from "../helpers/extension-context.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHATGPT_URL = "https://chatgpt.com/";

const EXTENSION_PATH = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
  "dist-test",
);

const REPORT_DIR = path.resolve(
  fileURLToPath(new URL("../../test-results/live", import.meta.url)),
);

const WAIT_TIMEOUT_MS = parseInt(
  process.env["LIVE_SMOKE_TIMEOUT_MS"] ?? "600000",
  10,
);

// Shorter timeout for post-interaction assertions (banner, events).
const ASSERT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Launch a truly-headed Chromium context with the PromptProfit extension. */
async function buildLiveExtensionContext(): Promise<BrowserContext> {
  const args = [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
  ];

  if (process.platform !== "win32") {
    args.push("--no-sandbox", "--disable-setuid-sandbox");
  }

  const customPath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];

  return chromium.launchPersistentContext("", {
    // No --headless=new — this is a fully visible browser for human interaction.
    headless: false,
    ...(customPath ? { executablePath: customPath } : {}),
    args,
  });
}

/** Wait for the extension service worker to register. */
async function waitForExtensionServiceWorker(
  context: BrowserContext,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const workers = context.serviceWorkers();
    if (workers.some((sw) => sw.url().startsWith("chrome-extension://"))) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 200);
      context.once("serviceworker", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  throw new Error(
    `Timed out waiting ${timeoutMs}ms for extension service worker.`,
  );
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

interface SmokeCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

interface SmokeReport {
  testId: string;
  timestamp: string;
  passed: boolean;
  checks: SmokeCheck[];
  eventCount: number;
  eventTypes: string[];
  durationMs: number;
  notes: string[];
}

function writeReport(report: SmokeReport): void {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const slug = report.testId.replace(/[^a-z0-9-]/gi, "-");
  const jsonPath = path.join(REPORT_DIR, `${slug}.json`);
  const mdPath = path.join(REPORT_DIR, `${slug}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const statusEmoji = report.passed ? "PASS" : "FAIL";
  const checksTable = report.checks
    .map(
      (c) =>
        `| ${c.passed ? "✓" : "✗"} | ${c.name} | ${c.detail ?? ""} |`,
    )
    .join("\n");

  const md = `# Live ChatGPT Smoke Test — ${statusEmoji}

**Test ID:** \`${report.testId}\`
**Timestamp:** ${report.timestamp}
**Duration:** ${(report.durationMs / 1000).toFixed(1)}s
**Overall:** ${report.passed ? "PASSED" : "FAILED"}

## Checks

| Status | Check | Detail |
|--------|-------|--------|
${checksTable}

## Events Received (${report.eventCount})

${report.eventTypes.length > 0 ? report.eventTypes.map((t) => `- \`${t}\``).join("\n") : "_none_"}

## Notes

${report.notes.length > 0 ? report.notes.map((n) => `- ${n}`).join("\n") : "_none_"}
`;

  fs.writeFileSync(mdPath, md);
  console.log(`\nSmoke report written:\n  ${jsonPath}\n  ${mdPath}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let context: BrowserContext | null = null;
let mockApi: MockApiServer | null = null;

test.beforeAll(async () => {
  mockApi = new MockApiServer();
  await mockApi.start();

  context = await buildLiveExtensionContext();
  await waitForExtensionServiceWorker(context);

  await configureExtensionStorage(context, {
    apiBaseUrl: `http://127.0.0.1:${mockApi.getPort()}`,
    killSwitchEnabled: false,
    disabledAdapters: [],
    debugMode: true,
  });
});

test.afterAll(async () => {
  await closeContext(context);
  context = null;
  if (mockApi) {
    await mockApi.stop();
    mockApi = null;
  }
});

test("live ChatGPT smoke — banner appears and events fire", async () => {
  if (!context || !mockApi) throw new Error("Setup failed");

  const startMs = Date.now();
  const checks: SmokeCheck[] = [];
  const notes: string[] = [];

  mockApi.clearEvents();

  const page: Page = await context.newPage();

  // Navigate to ChatGPT (privacy: we only navigate, read no content).
  await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded" });

  // ------------------------------------------------------------------
  // HUMAN ACTION: Log in and submit a prompt.
  //
  // The test waits here until the extension's wait-state detector fires,
  // which happens when ChatGPT is streaming/loading a response.
  // Timeout is controlled by LIVE_SMOKE_TIMEOUT_MS (default 10 min).
  // ------------------------------------------------------------------
  console.log(
    "\n" +
      "=".repeat(70) +
      "\n" +
      "  HUMAN ACTION REQUIRED\n" +
      "  ---------------------\n" +
      "  1. Log in to ChatGPT in the browser window that just opened.\n" +
      "  2. Submit any prompt (e.g. \"hello\").\n" +
      "  3. Wait for ChatGPT to begin generating a response.\n" +
      "  4. The test will automatically detect the wait state and continue.\n" +
      `\n  Waiting up to ${Math.round(WAIT_TIMEOUT_MS / 60000)} minutes...\n` +
      "=".repeat(70) +
      "\n",
  );

  // Wait for the debug panel to signal wait-state detected.
  // Privacy: we only read data-* attributes on extension-owned elements.
  let waitStateDetected = false;
  try {
    await page.waitForSelector(
      '#promptprofit-debug-panel[data-wait-state="true"]',
      { timeout: WAIT_TIMEOUT_MS },
    );
    waitStateDetected = true;
  } catch {
    notes.push("Wait-state not detected within timeout — was a prompt submitted?");
  }

  checks.push({
    name: "wait_state_detected",
    passed: waitStateDetected,
    detail: waitStateDetected
      ? "debug panel reported data-wait-state=true"
      : "timed out waiting for wait state",
  });

  // ------------------------------------------------------------------
  // Wait for sponsored banner to appear.
  // Privacy: we only check for the element by ID — no content is read.
  // ------------------------------------------------------------------
  let bannerRendered = false;
  try {
    await page.waitForSelector("#promptprofit-sponsored-banner", {
      timeout: ASSERT_TIMEOUT_MS,
    });
    bannerRendered = true;
  } catch {
    notes.push(
      "#promptprofit-sponsored-banner did not appear — ad decision may be null or API unreachable.",
    );
  }

  checks.push({
    name: "banner_rendered",
    passed: bannerRendered,
    detail: bannerRendered
      ? "#promptprofit-sponsored-banner found in DOM"
      : "banner element not found",
  });

  // ------------------------------------------------------------------
  // Verify debug panel reflects rendered state.
  // Privacy: data attributes only — no page content.
  // ------------------------------------------------------------------
  let panelShowsRendered = false;
  if (bannerRendered) {
    try {
      await page.waitForSelector(
        '#promptprofit-debug-panel[data-banner-rendered="true"]',
        { timeout: ASSERT_TIMEOUT_MS },
      );
      panelShowsRendered = true;
    } catch {
      notes.push("Debug panel did not reflect data-banner-rendered=true.");
    }
  }

  checks.push({
    name: "debug_panel_banner_rendered",
    passed: panelShowsRendered,
    detail: panelShowsRendered
      ? "data-banner-rendered=true confirmed"
      : bannerRendered
        ? "debug panel state mismatch"
        : "skipped (banner not rendered)",
  });

  // ------------------------------------------------------------------
  // Verify events captured by local mock API.
  // ------------------------------------------------------------------
  // Give events a moment to arrive if the banner just appeared.
  if (bannerRendered) {
    await page.waitForTimeout(2_000);
  }

  const capturedEvents = mockApi.getCapturedEvents();
  const eventTypes: string[] = capturedEvents
    .map((e) => {
      const body = e.body as Record<string, unknown> | null;
      return typeof body?.["eventType"] === "string" ? body["eventType"] : "unknown";
    })
    .filter((t): t is string => t !== "unknown");

  const hasImpressionRequested = eventTypes.includes("impression_requested");
  const hasImpressionRendered = eventTypes.includes("impression_rendered");

  checks.push({
    name: "impression_requested_sent",
    passed: hasImpressionRequested,
    detail: hasImpressionRequested
      ? "impression_requested received by mock API"
      : `not found in ${capturedEvents.length} captured events`,
  });

  checks.push({
    name: "impression_rendered_sent",
    passed: hasImpressionRendered,
    detail: hasImpressionRendered
      ? "impression_rendered received by mock API"
      : `not found in ${capturedEvents.length} captured events`,
  });

  // ------------------------------------------------------------------
  // Verify events contain no private fields.
  // Privacy: confirm events only carry ad identifiers and metadata.
  // ------------------------------------------------------------------
  const FORBIDDEN_FIELDS = [
    "pageUrl",
    "pageTitle",
    "domText",
    "promptText",
    "aiResponse",
    "chatHistory",
    "cookies",
    "authToken",
    "sessionCookie",
  ];
  const privacyViolations: string[] = [];
  for (const evt of capturedEvents) {
    const body = evt.body as Record<string, unknown> | null;
    if (body && typeof body === "object") {
      for (const field of FORBIDDEN_FIELDS) {
        if (field in body) {
          privacyViolations.push(`event contains forbidden field: ${field}`);
        }
      }
    }
  }

  checks.push({
    name: "events_privacy_safe",
    passed: privacyViolations.length === 0,
    detail:
      privacyViolations.length === 0
        ? `${capturedEvents.length} event(s) contain no forbidden fields`
        : privacyViolations.join("; "),
  });

  // ------------------------------------------------------------------
  // Final report
  // ------------------------------------------------------------------
  const durationMs = Date.now() - startMs;
  const allPassed = checks.every((c) => c.passed);

  const now = new Date();
  const timestamp = now.toISOString();
  const testId = `live-chatgpt-smoke-${timestamp
    .slice(0, 19)
    .replace(/[T:]/g, "-")}`;

  const report: SmokeReport = {
    testId,
    timestamp,
    passed: allPassed,
    checks,
    eventCount: capturedEvents.length,
    eventTypes,
    durationMs,
    notes,
  };

  writeReport(report);

  // Playwright assertions — fail the test if any check failed.
  for (const check of checks) {
    expect(check.passed, `${check.name}: ${check.detail ?? ""}`).toBe(true);
  }
});
