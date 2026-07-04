import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_ENV_VAR, DISABLED_CONFIG, loadConfig } from "../config.js";

const tmpFiles: string[] = [];

function writeTempConfig(content: string): string {
  const file = path.join(os.tmpdir(), `native-hook-config-test-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, content, "utf8");
  tmpFiles.push(file);
  return file;
}

afterEach(() => {
  delete process.env[CONFIG_ENV_VAR];
  for (const file of tmpFiles.splice(0)) {
    fs.rmSync(file, { force: true });
  }
});

describe("loadConfig", () => {
  it("fails closed (disabled) when the config file does not exist", () => {
    process.env[CONFIG_ENV_VAR] = path.join(os.tmpdir(), "does-not-exist-native-hook-config.json");
    expect(loadConfig()).toEqual(DISABLED_CONFIG);
  });

  it("fails closed (disabled) when the config file is unparsable JSON", () => {
    process.env[CONFIG_ENV_VAR] = writeTempConfig("{ not valid json");
    expect(loadConfig()).toEqual(DISABLED_CONFIG);
  });

  it("loads an explicitly enabled config", () => {
    process.env[CONFIG_ENV_VAR] = writeTempConfig(
      JSON.stringify({ enabled: true, killSwitchEnabled: false, disabledAdapters: [], flags: {} }),
    );
    expect(loadConfig().enabled).toBe(true);
  });
});
