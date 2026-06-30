/**
 * Cross-platform esbuild script for the VS Code extension.
 * Uses the esbuild JS API so pnpm doesn't need to resolve the native binary shim.
 * Reads BUILD_MINIFY=false (or absent) to switch between dev and release builds.
 */
import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const dev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  sourcemap: true,
  minify: !dev,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching for changes…");
} else {
  await esbuild.build(options);
}
