import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_ENV_VAR, DISABLED_CONFIG, loadConfig } from "../config.js";

const tmpFiles: string[] = [];

function writeTempConfig(content: string): string {
  const file = path.join(os.tmpdir(), `terminal-adapter-config-test-${Date.now()}-${Math.random()}.json`);
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
    process.env[CONFIG_ENV_VAR] = path.join(os.tmpdir(), "does-not-exist-terminal-adapter-config.json");
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
    const config = loadConfig();
    expect(config.enabled).toBe(true);
  });

  it("defaults enabled to false when omitted from the file", () => {
    process.env[CONFIG_ENV_VAR] = writeTempConfig(JSON.stringify({ killSwitchEnabled: true }));
    const config = loadConfig();
    expect(config.enabled).toBe(false);
    expect(config.killSwitchEnabled).toBe(true);
  });
});
