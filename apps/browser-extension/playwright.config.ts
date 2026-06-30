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
        // Pre-installed Chromium binary required by the CI environment.
        executablePath: "/opt/pw-browsers/chromium",
      },
    },
  ],
});
