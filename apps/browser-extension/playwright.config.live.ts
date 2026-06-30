/**
 * Playwright configuration for the live ChatGPT smoke test.
 *
 * Differences from the default config:
 *   - testDir points at e2e/live/ (not e2e/)
 *   - Very long timeout — human login/interaction is required
 *   - retries: 0 — live tests cannot be retried automatically
 *   - workers: 1 — only one browser instance opens at a time
 *   - No HTML report (the spec writes its own JSON + MD report)
 *
 * Run via:
 *   pnpm test:e2e:live
 * or via the orchestration script:
 *   scripts/live-chatgpt-smoke.ps1
 */

import { defineConfig } from "@playwright/test";

const timeoutMs = parseInt(
  process.env["LIVE_SMOKE_TIMEOUT_MS"] ?? "600000",
  10,
);

export default defineConfig({
  testDir: "e2e/live",
  testMatch: "**/*.spec.ts",
  timeout: timeoutMs,
  retries: 0,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  outputDir: "test-results/live",
  reporter: [["list"]],
  projects: [
    {
      name: "chromium-live",
      use: {
        // The spec manages its own browser launch via chromium.launchPersistentContext().
        // These settings exist only to satisfy Playwright's project schema.
        headless: false,
      },
    },
  ],
});
