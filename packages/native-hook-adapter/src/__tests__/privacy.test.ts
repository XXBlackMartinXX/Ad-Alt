import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeHookEvent } from "../normalizer.js";
import { findForbiddenFields, FORBIDDEN_FIELDS } from "../forbidden-fields.js";
import { CLAUDE_CODE_HOOK_EVENTS, CODEX_HOOK_EVENTS } from "../types.js";

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

describe("privacy: every known event type normalizes cleanly for every platform", () => {
  const cases: Array<{ platform: "claude_code" | "codex_cli" | "codex_ide"; events: readonly string[] }> = [
    { platform: "claude_code", events: CLAUDE_CODE_HOOK_EVENTS },
    { platform: "codex_cli", events: CODEX_HOOK_EVENTS },
    { platform: "codex_ide", events: CODEX_HOOK_EVENTS },
  ];

  for (const { platform, events } of cases) {
    for (const hookEventType of events) {
      it(`${platform} / ${hookEventType} produces zero forbidden fields even with hostile extra keys`, () => {
        const hostile = {
          hook_event_name: hookEventType,
          tool_input: { command: "leak-me", secret: "sk-fake-12345" },
          tool_response: { output: "leaked output content" },
          prompt: "leak this prompt",
          response: "leak this response",
          "input-messages": ["leak"],
          "last-assistant-message": "leak",
        };
        const event = normalizeHookEvent({
          platform,
          rawText: JSON.stringify(hostile),
          adapterVersion: "0.0.1",
          repoCommit: "deadbeef",
          killSwitchActive: false,
          dryRun: false,
        });
        expect(event.hookEventType).toBe(hookEventType);
        expect(findForbiddenFields(event)).toEqual([]);
        const json = JSON.stringify(event);
        for (const forbidden of FORBIDDEN_FIELDS) {
          expect(json).not.toContain(`"${forbidden}"`);
        }
        expect(json).not.toContain("leak");
        expect(json).not.toContain("sk-fake");
      });
    }
  }
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

  it("never calls console/process.std*.write with a raw payload variable", () => {
    for (const file of NON_TEST_SOURCE_FILES) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, `${file} must not log rawText`).not.toMatch(/console\.\w+\(\s*(input\.)?rawText/);
      expect(src, `${file} must not log a variable named raw\\b`).not.toMatch(/console\.\w+\(\s*raw\b/);
    }
  });

  it("never uses a forbidden field name as an object key outside forbidden-fields.ts's own declaration", () => {
    const fieldKeyRe = new RegExp(`["']?(${FORBIDDEN_FIELDS.join("|")})["']?\\s*:`, "g");
    for (const file of NON_TEST_SOURCE_FILES) {
      if (file.endsWith("forbidden-fields.ts")) continue;
      const src = fs.readFileSync(file, "utf8");
      const matches = [...src.matchAll(fieldKeyRe)];
      expect(matches, `${file} must not construct a forbidden field: ${JSON.stringify(matches.map((m) => m[1]))}`).toHaveLength(0);
    }
  });
});
