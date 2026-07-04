import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NativeHookFlags } from "./types.js";

export interface NativeHookConfig extends NativeHookFlags {
  /** Must be explicitly true for a hook script to emit anything beyond a disabled no-op. */
  enabled: boolean;
  adapterId: string;
}

export const CONFIG_ENV_VAR = "PROMPTPROFIT_NATIVE_HOOK_CONFIG";

/** Fail-closed default: disabled, no adapters allowlisted. */
export const DISABLED_CONFIG: NativeHookConfig = {
  enabled: false,
  killSwitchEnabled: false,
  disabledAdapters: [],
  flags: {},
  adapterId: "manual",
};

export function defaultConfigPath(): string {
  return path.join(os.homedir(), ".promptprofit", "native-hook-adapter.config.json");
}

function resolveConfigPath(): string {
  return process.env[CONFIG_ENV_VAR] ?? defaultConfigPath();
}

/**
 * Loads the local config file. Missing file, unparsable JSON, or any
 * read error all resolve to the fail-closed DISABLED_CONFIG -- this
 * adapter is never enabled by default and never crashes on a
 * bad/missing config.
 */
export function loadConfig(): NativeHookConfig {
  const configPath = resolveConfigPath();
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    return DISABLED_CONFIG;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NativeHookConfig>;
    return {
      enabled: parsed.enabled === true,
      killSwitchEnabled: parsed.killSwitchEnabled === true,
      disabledAdapters: Array.isArray(parsed.disabledAdapters) ? parsed.disabledAdapters : [],
      flags: typeof parsed.flags === "object" && parsed.flags !== null ? parsed.flags : {},
      adapterId: typeof parsed.adapterId === "string" ? parsed.adapterId : "manual",
    };
  } catch {
    return DISABLED_CONFIG;
  }
}
