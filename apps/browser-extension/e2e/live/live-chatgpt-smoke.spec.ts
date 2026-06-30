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
 *
 * RESULT SEMANTICS:
 *   PASSED      — all checks verified; banner appeared; events received.
 *   FAILED      — wait state was detected but one or more checks failed.
 *   INCONCLUSIVE — wait state was never detected (no prompt submitted,
 *                 login timed out, or extension not active). Nothing is
 *                 verified; re-run after fixing the precondition.
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

// ---------------------------------------------------------------------------
// Local real-API mode
// Set LIVE_SMOKE_USE_LOCAL_API=1 (via run-local-real-api-smoke.ps1) to route
// the extension at the real local PromptProfit API instead of MockApiServer.
// In this mode the spec does NOT verify in-process event capture; instead the
// orchestrating PS1 script queries local Postgres for event rows post-run.
//
// SECURITY: The PROMPTPROFIT_DEV_API_KEY value is passed into the extension's
// chrome.storage.local as "apiKey" so the service worker can send
// Authorization: Bearer headers. It is NEVER printed, logged, written to
// reports, or included in event payloads.
// ---------------------------------------------------------------------------
const LOCAL_API_MODE = process.env["LIVE_SMOKE_USE_LOCAL_API"] === "1";
const LOCAL_API_BASE_URL = process.env["PLAYWRIGHT_API_BASE_URL"] ?? "http://127.0.0.1:3001";
const LOCAL_REPORT_DIR = path.resolve(
  fileURLToPath(new URL("../../test-results/local-api", import.meta.url)),
);
const ACTIVE_REPORT_DIR = LOCAL_API_MODE ? LOCAL_REPORT_DIR : REPORT_DIR;

// The Playwright spec timeout (set in playwright.config.live.ts).
const SPEC_TIMEOUT_MS = parseInt(
  process.env["LIVE_SMOKE_TIMEOUT_MS"] ?? "600000",
  10,
);

// Reserve 90 s for report writing + Playwright assertion overhead so the
// waitForSelector always times out BEFORE Playwright kills the spec.
// This guarantees the report is always written even on a full-timeout run.
const WAIT_TIMEOUT_MS = Math.max(SPEC_TIMEOUT_MS - 90_000, 60_000);

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
// Report types and helpers
// ---------------------------------------------------------------------------

type CheckResult = "pass" | "fail" | "skip";

interface SmokeCheck {
  name: string;
  result: CheckResult;
  detail: string;
  elapsedMs: number;
}

/** Three distinct outcomes — never conflate timeout with genuine failure. */
type SmokeResult = "passed" | "failed" | "inconclusive";

interface SmokeReport {
  testId: string;
  timestamp: string;
  result: SmokeResult;
  /** @deprecated kept for backward-compat scripts that read `passed` */
  passed: boolean;
  /** "mock" = embedded MockApiServer; "local-api" = real local PromptProfit API */
  apiBackend: "mock" | "local-api";
  checks: SmokeCheck[];
  eventCount: number;
  eventTypes: string[];
  durationMs: number;
  waitTimeoutMs: number;
  notes: string[];
}

function writeReport(report: SmokeReport): void {
  fs.mkdirSync(ACTIVE_REPORT_DIR, { recursive: true });

  const slug = report.testId.replace(/[^a-z0-9-]/gi, "-");
  const jsonPath = path.join(ACTIVE_REPORT_DIR, `${slug}.json`);
  const mdPath = path.join(ACTIVE_REPORT_DIR, `${slug}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const resultLabel: Record<SmokeResult, string> = {
    passed: "PASSED",
    failed: "FAILED",
    inconclusive: "INCONCLUSIVE",
  };

  const statusIcon = (r: CheckResult) =>
    r === "pass" ? "✓" : r === "skip" ? "–" : "✗";

  const checksTable = report.checks
    .map(
      (c) =>
        `| ${statusIcon(c.result)} | ${c.name} | ${(c.elapsedMs / 1000).toFixed(1)}s | ${c.detail} |`,
    )
    .join("\n");

  const inconclusiveNote =
    report.result === "inconclusive"
      ? "\n> **INCONCLUSIVE** — The wait state was never detected.\n" +
        "> This usually means no prompt was submitted, the extension did not\n" +
        "> activate, or the debug panel could not mount.\n" +
        "> Re-run after verifying the extension is loaded and submit a prompt\n" +
        "> within the wait window.\n"
      : "";

  const backendLabel = report.apiBackend === "local-api"
    ? "Local real API (http://127.0.0.1:3001)"
    : "Embedded MockApiServer";

  const md = `# Live ChatGPT Smoke Test — ${resultLabel[report.result]}

**Test ID:** \`${report.testId}\`
**Timestamp:** ${report.timestamp}
**Duration:** ${(report.durationMs / 1000).toFixed(1)}s of ${(report.waitTimeoutMs / 1000).toFixed(0)}s budget
**API backend:** ${backendLabel}
**Overall:** ${resultLabel[report.result]}
${inconclusiveNote}
## Checks

| Status | Check | Elapsed | Detail |
|--------|-------|---------|--------|
${checksTable}

## Events Received (${report.eventCount})

${report.eventTypes.length > 0 ? report.eventTypes.map((t) => `- \`${t}\``).join("\n") : "_none_"}

## Notes

${report.notes.length > 0 ? report.notes.map((n) => `- ${n}`).join("\n") : "_none_"}
`;

  fs.writeFileSync(mdPath, md);
  console.log(`\nSmoke report (${resultLabel[report.result]}):\n  ${jsonPath}\n  ${mdPath}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let context: BrowserContext | null = null;
let mockApi: MockApiServer | null = null;

test.beforeAll(async () => {
  context = await buildLiveExtensionContext();
  await waitForExtensionServiceWorker(context);

  if (LOCAL_API_MODE) {
    // Real local API mode — no MockApiServer.
    // SECURITY: apiKey is consumed from env, stored in chrome.storage.local,
    // and forwarded as Authorization: Bearer by the service worker only.
    // It is never written to reports, event payloads, or debug panel.
    const apiKey = process.env["PROMPTPROFIT_DEV_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "LIVE_SMOKE_USE_LOCAL_API=1 is set but PROMPTPROFIT_DEV_API_KEY is missing. " +
        "Run run-local-real-api-smoke.ps1 to auto-mint a key."
      );
    }
    await configureExtensionStorage(context, {
      apiBaseUrl: LOCAL_API_BASE_URL,
      killSwitchEnabled: false,
      disabledAdapters: [],
      debugMode: true,
      apiKey,
      // Must match the deviceId used when minting the local dev API key so the
      // ad-decision request passes the API's deviceId validation (min 1, max 64).
      deviceId: "local-real-api-smoke-device",
    });
    console.log(`[local-api] Extension configured -> ${LOCAL_API_BASE_URL} (key: [redacted])`);
  } else {
    mockApi = new MockApiServer();
    await mockApi.start();
    await configureExtensionStorage(context, {
      apiBaseUrl: `http://127.0.0.1:${mockApi.getPort()}`,
      killSwitchEnabled: false,
      disabledAdapters: [],
      debugMode: true,
    });
  }
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
  if (!context) throw new Error("Setup failed: browser context is null");
  if (!LOCAL_API_MODE && !mockApi) throw new Error("Setup failed: no mockApi in mock mode");

  const testStartMs = Date.now();
  const elapsed = () => Date.now() - testStartMs;

  const checks: SmokeCheck[] = [];
  const notes: string[] = [];

  if (mockApi) mockApi.clearEvents();

  const page: Page = await context.newPage();

  // Navigate to ChatGPT (privacy: we only navigate, read no content).
  await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded" });

  // ------------------------------------------------------------------
  // HUMAN ACTION: Log in and submit a prompt.
  //
  // The test waits here until the extension's wait-state detector fires,
  // which happens when ChatGPT is streaming/loading a response.
  // We use WAIT_TIMEOUT_MS (= spec timeout - 90 s) so that if the
  // operator never acts, the waitForSelector times out cleanly, the
  // report is written as INCONCLUSIVE, and the spec still has time to
  // fail without being killed by Playwright's own timeout.
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
      `\n  Waiting up to ${Math.round(WAIT_TIMEOUT_MS / 60000)} min ` +
      `(spec timeout: ${Math.round(SPEC_TIMEOUT_MS / 60000)} min)...\n` +
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
    notes.push(
      `Wait-state timed out after ${Math.round(WAIT_TIMEOUT_MS / 60000)} min — ` +
        "was a prompt submitted and did the debug panel mount?",
    );
  }

  checks.push({
    name: "wait_state_detected",
    result: waitStateDetected ? "pass" : "fail",
    detail: waitStateDetected
      ? "debug panel reported data-wait-state=true"
      : `timed out after ${Math.round(WAIT_TIMEOUT_MS / 60000)} min — no wait state`,
    elapsedMs: elapsed(),
  });

  // If no wait state was detected, every downstream check is meaningless.
  // Record them as skipped so the report clearly distinguishes "didn't run"
  // from "ran and failed," then mark the overall result as INCONCLUSIVE.
  if (!waitStateDetected) {
    checks.push(
      { name: "banner_rendered",            result: "skip", detail: "skipped — wait state not detected", elapsedMs: elapsed() },
      { name: "debug_panel_banner_rendered", result: "skip", detail: "skipped — wait state not detected", elapsedMs: elapsed() },
      { name: "impression_requested_sent",  result: "skip", detail: "skipped — wait state not detected", elapsedMs: elapsed() },
      { name: "impression_rendered_sent",   result: "skip", detail: "skipped — wait state not detected", elapsedMs: elapsed() },
      { name: "events_privacy_safe",        result: "skip", detail: "skipped — no events to verify",     elapsedMs: elapsed() },
    );

    const durationMs = elapsed();
    const now = new Date();
    const timestamp = now.toISOString();
    const testId = `live-chatgpt-smoke-${timestamp.slice(0, 19).replace(/[T:]/g, "-")}`;
    writeReport({
      testId, timestamp, result: "inconclusive", passed: false,
      apiBackend: LOCAL_API_MODE ? "local-api" : "mock",
      checks, eventCount: 0, eventTypes: [], durationMs,
      waitTimeoutMs: WAIT_TIMEOUT_MS, notes,
    });
    expect.fail(
      "INCONCLUSIVE: wait state was never detected.\n" +
        "Ensure the extension is loaded, log in to ChatGPT, and submit a prompt " +
        `within the ${Math.round(WAIT_TIMEOUT_MS / 60000)}-minute window.\n` +
        `Report written to ${ACTIVE_REPORT_DIR}/`,
    );
  }

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
      "#promptprofit-sponsored-banner did not appear within " +
        `${ASSERT_TIMEOUT_MS / 1000}s — ad decision may be null or API unreachable.`,
    );
  }

  checks.push({
    name: "banner_rendered",
    result: bannerRendered ? "pass" : "fail",
    detail: bannerRendered
      ? "#promptprofit-sponsored-banner found in DOM"
      : `banner element not found after ${ASSERT_TIMEOUT_MS / 1000}s`,
    elapsedMs: elapsed(),
  });

  // ------------------------------------------------------------------
  // Verify debug panel reflects rendered state.
  // Only run this check when the banner actually appeared; otherwise
  // there is nothing for the panel to reflect and the check cannot add
  // information beyond what banner_rendered already captured.
  // ------------------------------------------------------------------
  if (bannerRendered) {
    let panelShowsRendered = false;
    try {
      await page.waitForSelector(
        '#promptprofit-debug-panel[data-banner-rendered="true"]',
        { timeout: ASSERT_TIMEOUT_MS },
      );
      panelShowsRendered = true;
    } catch {
      notes.push("Debug panel did not reflect data-banner-rendered=true.");
    }

    checks.push({
      name: "debug_panel_banner_rendered",
      result: panelShowsRendered ? "pass" : "fail",
      detail: panelShowsRendered
        ? "data-banner-rendered=true confirmed on debug panel"
        : "debug panel state mismatch — banner in DOM but panel not updated",
      elapsedMs: elapsed(),
    });
  }

  // ------------------------------------------------------------------
  // Event verification — mock mode vs local-API mode.
  // ------------------------------------------------------------------
  // Give events a moment to arrive if the banner just appeared.
  if (bannerRendered) {
    await page.waitForTimeout(2_000);
  }

  let eventCount = 0;
  let eventTypes: string[] = [];

  if (LOCAL_API_MODE) {
    // In local-API mode there is no in-process event collector.
    // Event verification is done post-run by query-local-browser-events.ps1
    // which queries local Postgres with sanitized column selection.
    checks.push({
      name: "events_db_verification",
      result: "skip",
      detail: "local-api mode: event ingestion verified via DB query post-run (see PS1 output)",
      elapsedMs: elapsed(),
    });
    notes.push(
      "local-api mode: run 'pnpm query:local-events' after this test to verify DB ingestion."
    );
  } else {
    // Mock API mode: verify event capture in-process.
    const capturedEvents = mockApi!.getCapturedEvents();
    eventCount = capturedEvents.length;
    eventTypes = capturedEvents
      .map((e) => {
        const body = e.body as Record<string, unknown> | null;
        return typeof body?.["eventType"] === "string" ? body["eventType"] : "unknown";
      })
      .filter((t): t is string => t !== "unknown");

    const hasImpressionRequested = eventTypes.includes("impression_requested");
    const hasImpressionRendered = eventTypes.includes("impression_rendered");

    checks.push({
      name: "impression_requested_sent",
      result: hasImpressionRequested ? "pass" : "fail",
      detail: hasImpressionRequested
        ? "impression_requested received by mock API"
        : `not found — ${eventCount} event(s) captured: [${eventTypes.join(", ") || "none"}]`,
      elapsedMs: elapsed(),
    });

    checks.push({
      name: "impression_rendered_sent",
      result: hasImpressionRendered ? "pass" : "fail",
      detail: hasImpressionRendered
        ? "impression_rendered received by mock API"
        : `not found — ${eventCount} event(s) captured: [${eventTypes.join(", ") || "none"}]`,
      elapsedMs: elapsed(),
    });

    // Verify events contain no private fields (skip if no events — avoid vacuous truth).
    const FORBIDDEN_FIELDS = [
      "pageUrl", "pageTitle", "domText", "promptText",
      "aiResponse", "chatHistory", "cookies", "authToken", "sessionCookie", "apiKey",
    ];

    if (eventCount === 0) {
      checks.push({
        name: "events_privacy_safe",
        result: "skip",
        detail: "no events captured — privacy check not applicable",
        elapsedMs: elapsed(),
      });
      notes.push("events_privacy_safe skipped: 0 events received by mock API.");
    } else {
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
        result: privacyViolations.length === 0 ? "pass" : "fail",
        detail:
          privacyViolations.length === 0
            ? `${eventCount} event(s) inspected — no forbidden fields`
            : privacyViolations.join("; "),
        elapsedMs: elapsed(),
      });
    }
  }

  // ------------------------------------------------------------------
  // Final report
  // ------------------------------------------------------------------
  const durationMs = elapsed();

  // A run is "passed" only when every non-skipped check passed.
  const nonSkipped = checks.filter((c) => c.result !== "skip");
  const anyFailed  = nonSkipped.some((c) => c.result === "fail");
  const result: SmokeResult = anyFailed ? "failed" : "passed";

  const now = new Date();
  const timestamp = now.toISOString();
  const prefix = LOCAL_API_MODE ? "local-api-chatgpt-smoke" : "live-chatgpt-smoke";
  const testId = `${prefix}-${timestamp.slice(0, 19).replace(/[T:]/g, "-")}`;

  writeReport({
    testId, timestamp, result, passed: result === "passed",
    apiBackend: LOCAL_API_MODE ? "local-api" : "mock",
    checks, eventCount, eventTypes,
    durationMs, waitTimeoutMs: WAIT_TIMEOUT_MS, notes,
  });

  // Fail the Playwright test if any non-skipped check failed.
  for (const check of nonSkipped) {
    expect(check.result, `${check.name}: ${check.detail}`).toBe("pass");
  }
});
