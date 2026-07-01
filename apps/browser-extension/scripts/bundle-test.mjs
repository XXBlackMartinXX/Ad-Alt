/**
 * esbuild bundle script for the PromptProfit E2E test extension build.
 *
 * Produces browser-ready bundles from TypeScript source in dist-test/:
 *   - Content scripts → dist-test/content/*.js  (IIFE, for MV3 content scripts)
 *   - Service worker  → dist-test/background/service-worker.js  (ESM)
 *   - manifest.json  → dist-test/manifest.json  (test-specific manifest)
 *
 * This build is NEVER shipped to users. It is loaded by Playwright as an
 * unpacked extension during automated E2E tests only.
 *
 * TypeScript type-checking is handled separately via `pnpm typecheck` (tsc --noEmit).
 */
import * as esbuild from "esbuild";
import { mkdirSync, writeFileSync } from "fs";

// ---------------------------------------------------------------------------
// Directory scaffold
// ---------------------------------------------------------------------------
mkdirSync("dist-test/content", { recursive: true });
mkdirSync("dist-test/background", { recursive: true });
mkdirSync("dist-test/icons", { recursive: true });

// ---------------------------------------------------------------------------
// Shared esbuild options
// ---------------------------------------------------------------------------
const sharedOpts = {
  bundle: true,
  sourcemap: true,
  target: "es2022",
  platform: "browser",
  logLevel: "info",
  // Test builds always include internal-beta code paths (demo mode) so
  // the selftest can exercise the banner without a live API server.
  define: {
    PROMPTPROFIT_BUILD_MODE: JSON.stringify("internal-beta"),
  },
};

// ---------------------------------------------------------------------------
// Content scripts (IIFE — MV3 content scripts cannot use ES module syntax)
// ---------------------------------------------------------------------------
await esbuild.build({
  ...sharedOpts,
  format: "iife",
  entryPoints: [
    "src/content/chatgpt.ts",
    "src/content/claude.ts",
    "src/content/gemini.ts",
    "src/content/fixture-test.ts",
  ],
  outdir: "dist-test/content",
});

// ---------------------------------------------------------------------------
// Service worker (ESM — MV3 background service workers support ES modules)
// ---------------------------------------------------------------------------
await esbuild.build({
  ...sharedOpts,
  format: "esm",
  entryPoints: ["src/background/service-worker.ts"],
  outdir: "dist-test/background",
});

// ---------------------------------------------------------------------------
// Test manifest
// ---------------------------------------------------------------------------
const manifest = {
  manifest_version: 3,
  name: "PromptProfit (E2E Test Build)",
  version: "0.0.1",
  description: "Automated E2E test build. Not for production use.",
  permissions: ["storage", "alarms"],
  // host_permissions for 127.0.0.1 is required so the service worker can
  // make fetch calls to the mock API server running on localhost.
  host_permissions: ["http://127.0.0.1:*/*"],
  background: {
    service_worker: "background/service-worker.js",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
      js: ["content/chatgpt.js"],
      run_at: "document_idle",
    },
    {
      matches: ["https://claude.ai/*"],
      js: ["content/claude.js"],
      run_at: "document_idle",
    },
    {
      matches: ["https://gemini.google.com/*"],
      js: ["content/gemini.js"],
      run_at: "document_idle",
    },
    {
      // Fixture content script runs on local test fixture pages only.
      // all_frames: false ensures it only runs in the top-level frame.
      matches: ["http://127.0.0.1:*/*"],
      js: ["content/fixture-test.js"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],
  action: {
    default_title: "PromptProfit (Test)",
  },
  // No popup, options_ui, or icons — not needed for E2E tests and
  // their absence avoids requiring those asset files in dist-test/.
};

writeFileSync(
  "dist-test/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);

console.log("Test extension built → dist-test/");
