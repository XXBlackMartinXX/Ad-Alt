import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.smoke.spec.ts",
  timeout: 30_000,
  retries: 1,
  forbidOnly: !!process.env["CI"],
  outputDir: "test-results/",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        channel: undefined,
        // executablePath is intentionally omitted here — extension-context.ts
        // handles the launch via chromium.launchPersistentContext() and reads
        // PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH from the environment when set.
      },
    },
  ],
});
