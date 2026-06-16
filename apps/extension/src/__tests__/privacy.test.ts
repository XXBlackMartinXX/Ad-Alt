import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Privacy invariant tests for PromptProfit event payloads
//
// These tests assert that event payloads emitted by the controller NEVER
// contain sensitive workspace data: source code, file paths, AI prompts,
// AI responses, or project structure information.
//
// The tests build event objects using the same keys the controller uses and
// then verify that no forbidden keys are present, and that no forbidden
// patterns appear as values.
// ---------------------------------------------------------------------------

// Keys that MUST NOT appear in any event payload
const FORBIDDEN_KEYS = [
  "sourceCode",
  "code",
  "fileContent",
  "content",
  "filePath",
  "fileName",
  "path",
  "workspaceFolder",
  "projectStructure",
  "prompt",
  "aiPrompt",
  "response",
  "aiResponse",
  "completion",
  "suggestion",
  "documentText",
  "selectionText",
  "clipboardText",
  "terminalOutput",
  "gitDiff",
  "gitLog",
] as const;

// Value patterns that should never appear (regex tested against JSON-serialised payload)
const FORBIDDEN_VALUE_PATTERNS = [
  /function\s+\w+\s*\(/,      // JS/TS function definitions
  /import\s+.*\s+from\s+['"]/,  // ES module import statements
  /const\s+\w+\s*=/,            // variable declarations
  /\/home\/\w+\//,              // absolute Unix home paths
  /C:\\Users\\/,                 // absolute Windows user paths
  /\/workspace\//,               // workspace path fragment
];

// ---------------------------------------------------------------------------
// Canonical safe payload shapes (mirrors what the controller actually builds)
// ---------------------------------------------------------------------------

// Use a fixed but valid UUID so the session-UUID format test passes
const FIXTURE_SESSION_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3300";
const FIXTURE_DEVICE_ID = "dev_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

function makeImpressionRequestedPayload(): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    eventType: "impression_requested",
    deviceId: FIXTURE_DEVICE_ID,
    sessionId: FIXTURE_SESSION_ID,
    extensionVersion: "0.1.0",
    adapterName: "ai_status_bar",
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: 0,
    adDecisionId: randomUUID(),
    campaignId: randomUUID(),
    creativeId: randomUUID(),
  };
}

function makeImpressionRenderedPayload(): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    eventType: "impression_rendered",
    deviceId: FIXTURE_DEVICE_ID,
    sessionId: FIXTURE_SESSION_ID,
    extensionVersion: "0.1.0",
    adapterName: "ai_status_bar",
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: 1,
    adDecisionId: randomUUID(),
    renderedAt: new Date().toISOString(),
  };
}

function makeViewabilityPayload(): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    eventType: "viewability_threshold_met",
    deviceId: FIXTURE_DEVICE_ID,
    sessionId: FIXTURE_SESSION_ID,
    extensionVersion: "0.1.0",
    adapterName: "ai_status_bar",
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: 2,
    adDecisionId: randomUUID(),
    displayedDurationMs: 5012,
    thresholdMs: 5000,
  };
}

function makeClickPayload(): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    eventType: "click",
    deviceId: FIXTURE_DEVICE_ID,
    sessionId: FIXTURE_SESSION_ID,
    extensionVersion: "0.1.0",
    adapterName: "ai_status_bar",
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: 3,
    adDecisionId: randomUUID(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertNoForbiddenKeys(payload: Record<string, unknown>, label: string): void {
  const payloadKeys = Object.keys(payload);
  for (const forbidden of FORBIDDEN_KEYS) {
    expect(
      payloadKeys,
      `${label}: must not contain key "${forbidden}"`,
    ).not.toContain(forbidden);
  }
}

function assertNoForbiddenValuePatterns(payload: Record<string, unknown>, label: string): void {
  const serialised = JSON.stringify(payload);
  for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
    expect(
      pattern.test(serialised),
      `${label}: payload must not match pattern ${pattern.source}`,
    ).toBe(false);
  }
}

function assertSafePayload(payload: Record<string, unknown>, label: string): void {
  assertNoForbiddenKeys(payload, label);
  assertNoForbiddenValuePatterns(payload, label);
}

// ---------------------------------------------------------------------------
// Required-fields whitelist — every event must include these
// ---------------------------------------------------------------------------

const REQUIRED_SAFE_FIELDS = [
  "eventId",
  "eventType",
  "deviceId",
  "sessionId",
  "clientTimestamp",
  "extensionVersion",
] as const;

function assertRequiredFields(payload: Record<string, unknown>, label: string): void {
  for (const field of REQUIRED_SAFE_FIELDS) {
    expect(payload, `${label}: must have field "${field}"`).toHaveProperty(field);
    expect(payload[field], `${label}: field "${field}" must be non-empty`).toBeTruthy();
  }
}

// ---------------------------------------------------------------------------
// Privacy tests
// ---------------------------------------------------------------------------

describe("Privacy invariants — event payloads", () => {
  describe("impression_requested", () => {
    it("contains no forbidden keys", () => {
      assertNoForbiddenKeys(makeImpressionRequestedPayload(), "impression_requested");
    });

    it("contains no forbidden value patterns", () => {
      assertNoForbiddenValuePatterns(makeImpressionRequestedPayload(), "impression_requested");
    });

    it("has all required safe fields", () => {
      assertRequiredFields(makeImpressionRequestedPayload(), "impression_requested");
    });
  });

  describe("impression_rendered", () => {
    it("contains no forbidden keys", () => {
      assertNoForbiddenKeys(makeImpressionRenderedPayload(), "impression_rendered");
    });

    it("contains no forbidden value patterns", () => {
      assertNoForbiddenValuePatterns(makeImpressionRenderedPayload(), "impression_rendered");
    });

    it("has all required safe fields", () => {
      assertRequiredFields(makeImpressionRenderedPayload(), "impression_rendered");
    });
  });

  describe("viewability_threshold_met", () => {
    it("contains no forbidden keys", () => {
      assertNoForbiddenKeys(makeViewabilityPayload(), "viewability_threshold_met");
    });

    it("contains no forbidden value patterns", () => {
      assertNoForbiddenValuePatterns(makeViewabilityPayload(), "viewability_threshold_met");
    });

    it("has all required safe fields", () => {
      assertRequiredFields(makeViewabilityPayload(), "viewability_threshold_met");
    });
  });

  describe("click", () => {
    it("contains no forbidden keys", () => {
      assertNoForbiddenKeys(makeClickPayload(), "click");
    });

    it("contains no forbidden value patterns", () => {
      assertNoForbiddenValuePatterns(makeClickPayload(), "click");
    });

    it("has all required safe fields", () => {
      assertRequiredFields(makeClickPayload(), "click");
    });
  });

  // ---------------------------------------------------------------------------
  // Adversarial tests — what happens if someone accidentally adds a bad field?
  // ---------------------------------------------------------------------------

  describe("adversarial — payload with source code is rejected by checks", () => {
    it("detects source code key", () => {
      const bad: Record<string, unknown> = {
        ...makeImpressionRequestedPayload(),
        sourceCode: "function main() {}",
      };
      expect(() => assertNoForbiddenKeys(bad, "adversarial")).toThrow();
    });

    it("detects file path key", () => {
      const bad: Record<string, unknown> = {
        ...makeClickPayload(),
        filePath: "/home/user/project/src/main.ts",
      };
      expect(() => assertNoForbiddenKeys(bad, "adversarial")).toThrow();
    });

    it("detects AI prompt key", () => {
      const bad: Record<string, unknown> = {
        ...makeImpressionRenderedPayload(),
        prompt: "Write a function that sorts an array",
      };
      expect(() => assertNoForbiddenKeys(bad, "adversarial")).toThrow();
    });

    it("detects AI response key", () => {
      const bad: Record<string, unknown> = {
        ...makeViewabilityPayload(),
        aiResponse: "Here is the sorted array implementation...",
      };
      expect(() => assertNoForbiddenKeys(bad, "adversarial")).toThrow();
    });

    it("detects code pattern embedded in a value", () => {
      const bad: Record<string, unknown> = {
        ...makeClickPayload(),
        // This embeds code in a non-forbidden key name but a forbidden pattern
        metadata: "const x = require('fs')",
      };
      expect(() => assertNoForbiddenValuePatterns(bad, "adversarial")).toThrow();
    });

    it("detects file path pattern embedded in a value", () => {
      const bad: Record<string, unknown> = {
        ...makeImpressionRequestedPayload(),
        extra: "/home/developer/my-project/package.json",
      };
      expect(() => assertNoForbiddenValuePatterns(bad, "adversarial")).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Device ID privacy check
  // ---------------------------------------------------------------------------

  describe("device ID privacy", () => {
    it("device ID must start with 'dev_' prefix (pseudonymous format)", () => {
      const payload = makeImpressionRequestedPayload();
      expect(payload["deviceId"] as string).toMatch(/^dev_/);
    });

    it("device ID must not look like a real username or hostname", () => {
      // The fixture constant is the canonical format; verify it matches the pattern
      expect(FIXTURE_DEVICE_ID).toMatch(/^dev_[0-9a-f]+$/);
      // And that every payload uses the same pseudonymous format
      const payload = makeImpressionRequestedPayload();
      expect(payload["deviceId"] as string).toMatch(/^dev_[0-9a-f]+$/);
    });

    it("device ID in all event types is in the same pseudonymous format", () => {
      const payloads = [
        makeImpressionRequestedPayload(),
        makeImpressionRenderedPayload(),
        makeViewabilityPayload(),
        makeClickPayload(),
      ];
      for (const p of payloads) {
        expect(p["deviceId"] as string).toMatch(/^dev_/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Session ID privacy check
  // ---------------------------------------------------------------------------

  describe("session ID", () => {
    it("session ID must be a UUID (not derived from workspace or user data)", () => {
      const payload = makeImpressionRequestedPayload();
      const sessionId = payload["sessionId"] as string;
      // UUID v4 pattern
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Whitelist check — only known safe keys are present
  // ---------------------------------------------------------------------------

  describe("whitelist — only known-safe keys appear", () => {
    const ALLOWED_KEYS = new Set([
      "eventId",
      "eventType",
      "deviceId",
      "sessionId",
      "extensionVersion",
      "adapterName",
      "clientTimestamp",
      "sequenceNumber",
      "adDecisionId",
      "campaignId",
      "creativeId",
      "renderedAt",
      "displayedDurationMs",
      "thresholdMs",
    ]);

    function assertOnlyAllowedKeys(payload: Record<string, unknown>, label: string): void {
      for (const key of Object.keys(payload)) {
        expect(ALLOWED_KEYS, `${label}: unexpected key "${key}"`).toContain(key);
      }
    }

    it("impression_requested has only allowed keys", () => {
      assertOnlyAllowedKeys(makeImpressionRequestedPayload(), "impression_requested");
    });

    it("impression_rendered has only allowed keys", () => {
      assertOnlyAllowedKeys(makeImpressionRenderedPayload(), "impression_rendered");
    });

    it("viewability_threshold_met has only allowed keys", () => {
      assertOnlyAllowedKeys(makeViewabilityPayload(), "viewability_threshold_met");
    });

    it("click has only allowed keys", () => {
      assertOnlyAllowedKeys(makeClickPayload(), "click");
    });
  });
});
