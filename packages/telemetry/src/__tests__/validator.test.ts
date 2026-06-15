import { describe, it, expect, beforeEach } from "vitest";
import { EventValidator } from "../validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    eventType: "impression_requested",
    deviceId: "device-abc-123",
    sessionId: "550e8400-e29b-41d4-a716-446655440001",
    extensionVersion: "0.2.0",
    adapterName: "copilot_status",
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: 0,
    adDecisionId: "550e8400-e29b-41d4-a716-446655440002",
    campaignId: "550e8400-e29b-41d4-a716-446655440003",
    creativeId: "550e8400-e29b-41d4-a716-446655440004",
    ...overrides,
  };
}

function makeRendered(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    eventType: "impression_rendered",
    deviceId: "device-abc-123",
    sessionId: "550e8400-e29b-41d4-a716-446655440001",
    extensionVersion: "0.2.0",
    adapterName: "copilot_status",
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: 1,
    adDecisionId: "550e8400-e29b-41d4-a716-446655440002",
    renderedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeViewability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    eventType: "viewability_threshold_met",
    deviceId: "device-abc-123",
    sessionId: "550e8400-e29b-41d4-a716-446655440001",
    extensionVersion: "0.2.0",
    adapterName: "copilot_status",
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: 2,
    adDecisionId: "550e8400-e29b-41d4-a716-446655440002",
    displayedDurationMs: 5000,
    thresholdMs: 5000,
    ...overrides,
  };
}

function makeClick(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    eventType: "click",
    deviceId: "device-abc-123",
    sessionId: "550e8400-e29b-41d4-a716-446655440001",
    extensionVersion: "0.2.0",
    adapterName: "copilot_status",
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: 3,
    adDecisionId: "550e8400-e29b-41d4-a716-446655440002",
    creativeId: "550e8400-e29b-41d4-a716-446655440004",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EventValidator", () => {
  let validator: EventValidator;

  beforeEach(() => {
    validator = new EventValidator();
  });

  // -------------------------------------------------------------------------
  // Happy paths — one for each event type
  // -------------------------------------------------------------------------

  describe("valid events", () => {
    it("accepts a valid impression_requested event", () => {
      const result = validator.validate(makeBase());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe("impression_requested");
      }
    });

    it("accepts a valid impression_rendered event", () => {
      const result = validator.validate(makeRendered());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe("impression_rendered");
      }
    });

    it("accepts a valid viewability_threshold_met event", () => {
      const result = validator.validate(makeViewability());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe("viewability_threshold_met");
      }
    });

    it("accepts a valid click event", () => {
      const result = validator.validate(makeClick());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe("click");
      }
    });

    it("accepts events with an optional userId present", () => {
      const result = validator.validate(
        makeBase({ userId: "550e8400-e29b-41d4-a716-446655440099" })
      );
      expect(result.success).toBe(true);
    });

    it("accepts device IDs with underscores and hyphens", () => {
      const result = validator.validate(makeBase({ deviceId: "dev_ABC-123_x9" }));
      expect(result.success).toBe(true);
    });

    it("accepts device IDs that are exactly 64 characters", () => {
      const id = "a".repeat(64);
      const result = validator.validate(makeBase({ deviceId: id }));
      expect(result.success).toBe(true);
    });

    it("accepts a timestamp just within the 5-minute future window", () => {
      const ts = new Date(Date.now() + 4 * 60 * 1000).toISOString();
      const result = validator.validate(makeBase({ clientTimestamp: ts }));
      expect(result.success).toBe(true);
    });

    it("accepts a timestamp just within the 1-hour past window", () => {
      const ts = new Date(Date.now() - 59 * 60 * 1000).toISOString();
      const result = validator.validate(makeBase({ clientTimestamp: ts }));
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Forbidden fields
  // -------------------------------------------------------------------------

  describe("forbidden fields", () => {
    const forbiddenCases: Array<[string, string]> = [
      ["sourceCode", "function hello() {}"],
      ["filePath", "/home/user/project/src/app.ts"],
      ["fileName", "app.ts"],
      ["promptText", "write me a function that..."],
      ["aiResponse", "Here is the function you asked for..."],
      ["fileContent", "const x = 1;"],
      ["projectPath", "/home/user/project"],
      ["chatHistory", "[]"],
      ["terminalContent", "$ npm install"],
      ["projectStructure", "{}"],
      ["workspacePath", "/home/user/workspace"],
      ["gitRemote", "git@github.com:user/repo.git"],
      ["envVariables", "{}"],
      ["apiKey", "sk-abc123"],
      ["secret", "mysecret"],
      ["password", "hunter2"],
      ["token", "Bearer abc"],
    ];

    it.each(forbiddenCases)(
      "rejects payload containing forbidden field '%s'",
      (field, value) => {
        const result = validator.validate(makeBase({ [field]: value }));
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors[0]).toContain(field);
        }
      }
    );

    it("reports all forbidden fields found when multiple are present", () => {
      const result = validator.validate(
        makeBase({ sourceCode: "x", filePath: "/tmp/x.ts" })
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]).toContain("sourceCode");
        expect(result.errors[0]).toContain("filePath");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Timestamp validation
  // -------------------------------------------------------------------------

  describe("timestamp validation", () => {
    it("rejects a timestamp more than 5 minutes in the future", () => {
      const ts = new Date(Date.now() + 6 * 60 * 1000).toISOString();
      const result = validator.validate(makeBase({ clientTimestamp: ts }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]).toContain("future");
      }
    });

    it("rejects a timestamp more than 1 hour in the past", () => {
      const ts = new Date(Date.now() - 61 * 60 * 1000).toISOString();
      const result = validator.validate(makeBase({ clientTimestamp: ts }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]).toContain("past");
      }
    });

    it("rejects a non-datetime string for clientTimestamp", () => {
      const result = validator.validate(makeBase({ clientTimestamp: "not-a-date" }));
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Device ID validation
  // -------------------------------------------------------------------------

  describe("deviceId validation", () => {
    it("rejects an empty deviceId", () => {
      const result = validator.validate(makeBase({ deviceId: "" }));
      expect(result.success).toBe(false);
    });

    it("rejects a deviceId longer than 64 characters", () => {
      const result = validator.validate(makeBase({ deviceId: "a".repeat(65) }));
      expect(result.success).toBe(false);
    });

    it("rejects a deviceId with spaces", () => {
      const result = validator.validate(makeBase({ deviceId: "device id" }));
      expect(result.success).toBe(false);
    });

    it("rejects a deviceId with special characters", () => {
      const result = validator.validate(makeBase({ deviceId: "device@#$" }));
      expect(result.success).toBe(false);
    });

    it("rejects a deviceId with dots", () => {
      const result = validator.validate(makeBase({ deviceId: "device.name" }));
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Sequence number validation
  // -------------------------------------------------------------------------

  describe("sequenceNumber validation", () => {
    it("accepts sequenceNumber of 0", () => {
      const result = validator.validate(makeBase({ sequenceNumber: 0 }));
      expect(result.success).toBe(true);
    });

    it("accepts large sequenceNumbers", () => {
      const result = validator.validate(makeBase({ sequenceNumber: 999_999 }));
      expect(result.success).toBe(true);
    });

    it("rejects negative sequenceNumbers", () => {
      const result = validator.validate(makeBase({ sequenceNumber: -1 }));
      expect(result.success).toBe(false);
    });

    it("rejects non-integer sequenceNumbers", () => {
      const result = validator.validate(makeBase({ sequenceNumber: 1.5 }));
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Schema / Zod validation fallthrough
  // -------------------------------------------------------------------------

  describe("schema validation", () => {
    it("rejects null payload", () => {
      const result = validator.validate(null);
      expect(result.success).toBe(false);
    });

    it("rejects non-object payload", () => {
      const result = validator.validate("not an object");
      expect(result.success).toBe(false);
    });

    it("rejects payload with unknown eventType", () => {
      const result = validator.validate(makeBase({ eventType: "unknown_type" }));
      expect(result.success).toBe(false);
    });

    it("rejects payload missing required field (eventId)", () => {
      const payload = makeBase();
      delete payload["eventId"];
      const result = validator.validate(payload);
      expect(result.success).toBe(false);
    });

    it("rejects impression_requested missing adDecisionId", () => {
      const payload = makeBase();
      delete payload["adDecisionId"];
      const result = validator.validate(payload);
      expect(result.success).toBe(false);
    });

    it("rejects viewability_threshold_met with displayedDurationMs below minimum (3000ms)", () => {
      const result = validator.validate(makeViewability({ displayedDurationMs: 2999 }));
      expect(result.success).toBe(false);
    });

    it("rejects viewability_threshold_met with displayedDurationMs above maximum (300,000ms)", () => {
      const result = validator.validate(makeViewability({ displayedDurationMs: 300_001 }));
      expect(result.success).toBe(false);
    });

    it("rejects click event missing creativeId", () => {
      const payload = makeClick();
      delete payload["creativeId"];
      const result = validator.validate(payload);
      expect(result.success).toBe(false);
    });

    it("rejects event with invalid adapterName", () => {
      const result = validator.validate(makeBase({ adapterName: "unknown_adapter" }));
      expect(result.success).toBe(false);
    });

    it("returns multiple error paths when multiple Zod errors occur", () => {
      const result = validator.validate(makeBase({ eventId: "not-a-uuid", adapterName: "bad" }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(1);
      }
    });
  });
});
