import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { wrapCommand } from "../wrap.js";
import { findForbiddenFields } from "../lifecycle.js";
import { DEFAULT_FLAGS_ENABLED, DEFAULT_FLAGS_DISABLED } from "../kill-switch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRAP_SRC = fs.readFileSync(path.join(__dirname, "..", "wrap.ts"), "utf8");

describe("wrap.ts source -- static stdio-safety guarantees", () => {
  it("always passes stdio: 'inherit' to spawn, never 'pipe'", () => {
    expect(WRAP_SRC).toMatch(/stdio:\s*["']inherit["']/);
    expect(WRAP_SRC).not.toMatch(/stdio:\s*["']pipe["']/);
  });

  it("never attaches a listener to a child's stdout or stderr", () => {
    expect(WRAP_SRC).not.toMatch(/child\.stdout/);
    expect(WRAP_SRC).not.toMatch(/child\.stderr/);
  });

  it("never requires or imports http/https/net", () => {
    expect(WRAP_SRC).not.toMatch(/from ["']node:https?["']/);
    expect(WRAP_SRC).not.toMatch(/from ["']node:net["']/);
  });
});

describe("wrapCommand -- real process lifecycle", () => {
  it("runs a real short-lived process and reports its real exit code", async () => {
    const result = await wrapCommand([process.execPath, "-e", "process.exit(0)"], {
      adapterId: "manual",
      flags: DEFAULT_FLAGS_ENABLED,
      enabled: true,
    });
    expect(result.exitCode).toBe(0);
  });

  it("reports a nonzero real exit code faithfully", async () => {
    const result = await wrapCommand([process.execPath, "-e", "process.exit(7)"], {
      adapterId: "manual",
      flags: DEFAULT_FLAGS_ENABLED,
      enabled: true,
    });
    expect(result.exitCode).toBe(7);
  });

  it("emits the full lifecycle sequence when enabled and not kill-switched", async () => {
    const result = await wrapCommand([process.execPath, "-e", "process.exit(0)"], {
      adapterId: "manual",
      flags: DEFAULT_FLAGS_ENABLED,
      enabled: true,
    });
    expect(result.events.map((e) => e.eventType)).toEqual([
      "adapter_started",
      "session_started",
      "wait_state_started",
      "wait_state_ended",
      "adapter_stopped",
    ]);
    expect(result.events.at(-1)?.exitCode).toBe(0);
  });

  it("emits no lifecycle events when not enabled, but still runs the command", async () => {
    const result = await wrapCommand([process.execPath, "-e", "process.exit(0)"], {
      adapterId: "manual",
      flags: DEFAULT_FLAGS_ENABLED,
      enabled: false,
    });
    expect(result.events).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it("emits only kill_switch_active when enabled but kill-switched, and still runs the command", async () => {
    const result = await wrapCommand([process.execPath, "-e", "process.exit(0)"], {
      adapterId: "manual",
      flags: DEFAULT_FLAGS_DISABLED,
      enabled: true,
    });
    expect(result.events.map((e) => e.eventType)).toEqual(["kill_switch_active"]);
    expect(result.exitCode).toBe(0);
  });

  it("emits error_safe_code_only with spawn_enoent for a nonexistent command, never a raw message", async () => {
    const result = await wrapCommand(["promptprofit-definitely-does-not-exist-binary"], {
      adapterId: "manual",
      flags: DEFAULT_FLAGS_ENABLED,
      enabled: true,
    });
    expect(result.events.map((e) => e.eventType)).toContain("error_safe_code_only");
    const errorEvent = result.events.find((e) => e.eventType === "error_safe_code_only");
    expect(errorEvent?.errorCode).toBe("spawn_enoent");
  });

  it("never produces a forbidden field, and never echoes back the wrapped argv", async () => {
    const secretLookingArg = "api-key=super-secret-should-never-appear";
    const result = await wrapCommand([process.execPath, "-e", "process.exit(0)", secretLookingArg], {
      adapterId: "manual",
      flags: DEFAULT_FLAGS_ENABLED,
      enabled: true,
    });
    for (const event of result.events) {
      expect(findForbiddenFields(event)).toEqual([]);
      expect(JSON.stringify(event)).not.toContain(secretLookingArg);
    }
  });
});
