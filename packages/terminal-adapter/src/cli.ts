#!/usr/bin/env node
/**
 * CLI entry point. Never logs the wrapped command's argv, env, or output --
 * only the lifecycle events defined in lifecycle.ts.
 */
import fs from "node:fs";
import { loadConfig } from "./config.js";
import { runDemo } from "./demo.js";
import { wrapCommand } from "./wrap.js";
import type { LifecycleEvent } from "./lifecycle.js";

function printEvent(event: LifecycleEvent): void {
  console.log(JSON.stringify(event));
}

function appendToLog(logPath: string | undefined, event: LifecycleEvent): void {
  if (!logPath) return;
  fs.appendFileSync(logPath, JSON.stringify(event) + "\n", "utf8");
}

function parseLogFlag(args: string[]): string | undefined {
  const idx = args.indexOf("--log");
  if (idx === -1) return undefined;
  return args[idx + 1];
}

async function runDemoCommand(args: string[]): Promise<number> {
  const config = loadConfig();
  const logPath = parseLogFlag(args);
  const events = await runDemo({ adapterId: config.adapterId, flags: config });
  for (const event of events) {
    printEvent(event);
    appendToLog(logPath, event);
  }
  return 0;
}

async function runWrapCommand(args: string[]): Promise<number> {
  const separatorIndex = args.indexOf("--");
  const wrapped = separatorIndex === -1 ? args : args.slice(separatorIndex + 1);
  const logPath = parseLogFlag(args.slice(0, separatorIndex === -1 ? args.length : separatorIndex));

  if (wrapped.length === 0) {
    console.error("[terminal-adapter] usage: wrap -- <command> [args...]");
    return 1;
  }

  const config = loadConfig();
  const result = await wrapCommand(wrapped, {
    adapterId: config.adapterId,
    flags: config,
    enabled: config.enabled,
    onEvent: (event) => {
      printEvent(event);
      appendToLog(logPath, event);
    },
  });
  return result.exitCode;
}

function runCheckCommand(): number {
  const config = loadConfig();
  console.log(
    JSON.stringify(
      {
        enabled: config.enabled,
        killSwitchEnabled: config.killSwitchEnabled,
        disabledAdapters: config.disabledAdapters,
        adapterId: config.adapterId,
      },
      null,
      2,
    ),
  );
  return 0;
}

async function main(): Promise<void> {
  const [, , subcommand, ...rest] = process.argv;

  let exitCode: number;
  switch (subcommand) {
    case "demo":
      exitCode = await runDemoCommand(rest);
      break;
    case "wrap":
      exitCode = await runWrapCommand(rest);
      break;
    case "check":
      exitCode = runCheckCommand();
      break;
    default:
      console.error("[terminal-adapter] usage: <demo|wrap -- <command...>|check> [--log <path>]");
      exitCode = 1;
  }
  process.exit(exitCode);
}

main();
