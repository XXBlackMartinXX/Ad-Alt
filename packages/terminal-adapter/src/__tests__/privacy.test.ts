import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildLifecycleEvent, newSessionId, LIFECYCLE_EVENT_TYPES, FORBIDDEN_FIELDS } from "../lifecycle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..");

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return listSourceFiles(full);
    }
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

const NON_TEST_SOURCE_FILES = listSourceFiles(SRC_DIR);

describe("privacy: every producible event is clean", () => {
  it("produces zero forbidden fields for every lifecycle event type", () => {
    for (const eventType of LIFECYCLE_EVENT_TYPES) {
      const event = buildLifecycleEvent({
        eventType,
        adapterId: "manual",
        sessionId: newSessionId(),
        durationMs: 1234,
        exitCode: 0,
        errorCode: "unknown_safe_error",
      });
      const json = JSON.stringify(event);
      for (const forbidden of FORBIDDEN_FIELDS) {
        expect(json).not.toContain(`"${forbidden}"`);
      }
    }
  });
});

describe("privacy: static source scan (excludes tests)", () => {
  it("never requires/imports http, https, or net (no network I/O in this package)", () => {
    for (const file of NON_TEST_SOURCE_FILES) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, `${file} must not import node:http`).not.toMatch(/from ["']node:http["']/);
      expect(src, `${file} must not import node:https`).not.toMatch(/from ["']node:https["']/);
      expect(src, `${file} must not import node:net`).not.toMatch(/from ["']node:net["']/);
    }
  });

  it("never uses a forbidden field name as an object key outside lifecycle.ts's own declarations", () => {
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELDS.join("|")})["']?\\s*:`, "g");
    for (const file of NON_TEST_SOURCE_FILES) {
      if (file.endsWith("lifecycle.ts")) continue; // owns the denylist declaration itself
      const src = fs.readFileSync(file, "utf8");
      const matches = [...src.matchAll(fieldKeyRe)];
      expect(matches, `${file} must not construct a forbidden field: ${JSON.stringify(matches.map((m) => m[1]))}`).toHaveLength(0);
    }
  });

  it("only wrap.ts spawns a child process (child_process usage is isolated)", () => {
    for (const file of NON_TEST_SOURCE_FILES) {
      if (file.endsWith("wrap.ts")) continue;
      const src = fs.readFileSync(file, "utf8");
      expect(src, `${file} must not import node:child_process`).not.toMatch(/node:child_process/);
    }
  });
});
