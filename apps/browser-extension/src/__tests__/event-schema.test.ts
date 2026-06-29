import { describe, it, expect } from "vitest";
import { TelemetryEventSchema } from "@ad-alt/shared";

const NOW = new Date().toISOString();
const UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: UUID,
    eventType: "impression_requested",
    deviceId: "dev_abc123",
    sessionId: UUID,
    extensionVersion: "0.1.0",
    adapterName: "browser_chatgpt",
    clientTimestamp: NOW,
    sequenceNumber: 0,
    adDecisionId: UUID,
    campaignId: UUID,
    creativeId: UUID,
    ...overrides,
  };
}

describe("TelemetryEventSchema — browser adapter names", () => {
  const browserAdapters = ["browser_chatgpt", "browser_claude", "browser_gemini", "browser_mock"];

  for (const adapter of browserAdapters) {
    it(`accepts adapterName="${adapter}"`, () => {
      const result = TelemetryEventSchema.safeParse(makeEvent({ adapterName: adapter }));
      expect(result.success).toBe(true);
    });
  }

  it("rejects unknown browser adapter", () => {
    const result = TelemetryEventSchema.safeParse(makeEvent({ adapterName: "browser_bing" }));
    expect(result.success).toBe(false);
  });

  it("rejects empty adapterName", () => {
    const result = TelemetryEventSchema.safeParse(makeEvent({ adapterName: "" }));
    expect(result.success).toBe(false);
  });
});

describe("TelemetryEventSchema — forbidden privacy fields rejected", () => {
  it("rejects event with pageUrl", () => {
    const result = TelemetryEventSchema.safeParse(makeEvent({ pageUrl: "https://chatgpt.com/c/abc" }));
    // The schema doesn't allow unknown fields (strict), OR pageUrl must be absent
    // Either way the schema must not silently pass it through
    if (result.success) {
      expect((result.data as Record<string, unknown>)["pageUrl"]).toBeUndefined();
    }
  });
});
