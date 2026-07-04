import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TerminalAdapterFlags } from "./kill-switch.js";

export const DEFAULT_ADAPTER_ID = "manual";

export interface TerminalAdapterConfig extends TerminalAdapterFlags {
  /** Must be explicitly true for `wrap` mode to emit any lifecycle event. */
  enabled: boolean;
  adapterId: string;
}

export const CONFIG_ENV_VAR = "PROMPTPROFIT_TERMINAL_ADAPTER_CONFIG";

/** Fail-closed default: disabled, no adapters allowlisted. */
export const DISABLED_CONFIG: TerminalAdapterConfig = {
  enabled: false,
  killSwitchEnabled: false,
  disabledAdapters: [],
  flags: {},
  adapterId: DEFAULT_ADAPTER_ID,
};

export function defaultConfigPath(): string {
  return path.join(os.homedir(), ".promptprofit", "terminal-adapter.config.json");
}

function resolveConfigPath(): string {
  return process.env[CONFIG_ENV_VAR] ?? defaultConfigPath();
}

/**
 * Loads the local config file. Missing file, unparsable JSON, or any read
 * error all resolve to the fail-closed DISABLED_CONFIG -- this adapter is
 * never enabled by default and never crashes on a bad/missing config.
 */
export function loadConfig(): TerminalAdapterConfig {
  const configPath = resolveConfigPath();
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    return DISABLED_CONFIG;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TerminalAdapterConfig>;
    return {
      enabled: parsed.enabled === true,
      killSwitchEnabled: parsed.killSwitchEnabled === true,
      disabledAdapters: Array.isArray(parsed.disabledAdapters) ? parsed.disabledAdapters : [],
      flags: typeof parsed.flags === "object" && parsed.flags !== null ? parsed.flags : {},
      adapterId: typeof parsed.adapterId === "string" ? parsed.adapterId : DEFAULT_ADAPTER_ID,
    };
  } catch {
    return DISABLED_CONFIG;
  }
}
