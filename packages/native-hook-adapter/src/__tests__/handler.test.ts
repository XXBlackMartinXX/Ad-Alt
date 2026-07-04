import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_ENV_VAR } from "../config.js";
import { handleHookInvocation } from "../handler.js";

const tmpFiles: string[] = [];

function writeTempConfig(content: string): string {
  const file = path.join(os.tmpdir(), `native-hook-handler-test-${Date.now()}-${Math.random()}.json`);
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

describe("handleHookInvocation", () => {
  it("defaults to dryRun=true and killSwitchActive=false when no config file exists", () => {
    process.env[CONFIG_ENV_VAR] = path.join(os.tmpdir(), "nope-native-hook-handler.json");
    const event = handleHookInvocation({
      platform: "claude_code",
      rawText: JSON.stringify({ hook_event_name: "Stop" }),
      adapterVersion: "0.0.1",
    });
    expect(event.dryRun).toBe(true);
    expect(event.killSwitchActive).toBe(false);
    expect(event.sanitizedResult).toBe("ok");
  });

  it("reports dryRun=false once explicitly enabled in config", () => {
    process.env[CONFIG_ENV_VAR] = writeTempConfig(
      JSON.stringify({ enabled: true, killSwitchEnabled: false, disabledAdapters: [], flags: {}, adapterId: "manual" }),
    );
    const event = handleHookInvocation({
      platform: "claude_code",
      rawText: JSON.stringify({ hook_event_name: "Stop" }),
      adapterVersion: "0.0.1",
    });
    expect(event.dryRun).toBe(false);
  });

  it("reports killSwitchActive=true once the global kill switch is set, even if enabled", () => {
    process.env[CONFIG_ENV_VAR] = writeTempConfig(
      JSON.stringify({ enabled: true, killSwitchEnabled: true, disabledAdapters: [], flags: {}, adapterId: "manual" }),
    );
    const event = handleHookInvocation({
      platform: "claude_code",
      rawText: JSON.stringify({ hook_event_name: "Stop" }),
      adapterVersion: "0.0.1",
    });
    expect(event.killSwitchActive).toBe(true);
    expect(event.sanitizedResult).toBe("kill_switch_active");
  });

  it("never includes the raw rawText content in the returned event", () => {
    const secretMarker = "TOTALLY-UNIQUE-SECRET-MARKER-9f8e7d";
    const event = handleHookInvocation({
      platform: "codex_cli",
      rawText: JSON.stringify({ hook_event_name: "PreToolUse", tool_input: { command: secretMarker } }),
      adapterVersion: "0.0.1",
    });
    expect(JSON.stringify(event)).not.toContain(secretMarker);
  });
});
