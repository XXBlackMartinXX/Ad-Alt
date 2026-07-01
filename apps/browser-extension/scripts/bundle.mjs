/**
 * esbuild bundle script for the PromptProfit browser extension.
 *
 * Produces browser-ready bundles from TypeScript source:
 *   - Content scripts → dist/content/*.js  (IIFE, for MV3 content scripts)
 *   - Service worker  → dist/background/service-worker.js  (ESM, MV3 supports modules)
 *
 * TypeScript type-checking is handled separately via `pnpm typecheck` (tsc --noEmit).
 */
import * as esbuild from "esbuild";
import { mkdirSync } from "fs";

mkdirSync("dist/content", { recursive: true });
mkdirSync("dist/background", { recursive: true });

const buildModeIdx = process.argv.indexOf("--build-mode");
const buildMode =
  buildModeIdx !== -1
    ? process.argv[buildModeIdx + 1]
    : (process.env.PROMPTPROFIT_BUILD_MODE ?? "production");

const sharedOpts = {
  bundle: true,
  sourcemap: true,
  target: "es2022",
  platform: "browser",
  logLevel: "info",
  define: {
    PROMPTPROFIT_BUILD_MODE: JSON.stringify(buildMode),
  },
};

await esbuild.build({
  ...sharedOpts,
  format: "iife",
  entryPoints: [
    "src/content/chatgpt.ts",
    "src/content/claude.ts",
    "src/content/gemini.ts",
  ],
  outdir: "dist/content",
});

await esbuild.build({
  ...sharedOpts,
  format: "esm",
  entryPoints: ["src/background/service-worker.ts"],
  outdir: "dist/background",
});
