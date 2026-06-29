import { describe, it, expect } from "vitest";
import { validateBrowserEvent } from "../../../content/privacy-guard.js";
import { TelemetryEventSchema } from "@ad-alt/shared";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const NOW = new Date().toISOString();

const CLEAN_EVENT = {
  eventId: UUID,
  eventType: "impression_requested" as const,
  deviceId: "dev_abc123",
  sessionId: UUID,
  extensionVersion: "0.1.0",
  adapterName: "browser_chatgpt" as const,
  clientTimestamp: NOW,
  sequenceNumber: 0,
  adDecisionId: UUID,
  campaignId: UUID,
  creativeId: UUID,
};

describe("ChatGPT adapter — privacy guard (browser forbidden fields)", () => {
  it("accepts a clean chatgpt event via validateBrowserEvent", () => {
    expect(validateBrowserEvent(CLEAN_EVENT)).toBeNull();
  });

  const FORBIDDEN = [
    "pageTitle",
    "pageUrl",
    "pageContent",
    "domText",
    "clipboardContent",
    "screenshotData",
    "cookieData",
    "authToken",
    "sessionCookie",
    "referrer",
    "userAgent",
  ];

  for (const field of FORBIDDEN) {
    it(`rejects event containing forbidden field: ${field}`, () => {
      const event = { ...CLEAN_EVENT, [field]: "leaked-value" };
      const result = validateBrowserEvent(event);
      expect(result).not.toBeNull();
      expect(result).toContain(field);
    });
  }
});

describe("ChatGPT adapter — TelemetryEventSchema enforcement", () => {
  it("accepts browser_chatgpt as adapterName", () => {
    const result = TelemetryEventSchema.safeParse(CLEAN_EVENT);
    expect(result.success).toBe(true);
  });

  it("strips or rejects pageUrl in strict schema", () => {
    const result = TelemetryEventSchema.safeParse({ ...CLEAN_EVENT, pageUrl: "https://chatgpt.com/c/abc" });
    if (result.success) {
      expect((result.data as Record<string, unknown>)["pageUrl"]).toBeUndefined();
    } else {
      expect(result.success).toBe(false);
    }
  });

  it("rejects browser_bing as adapterName", () => {
    const result = TelemetryEventSchema.safeParse({ ...CLEAN_EVENT, adapterName: "browser_bing" });
    expect(result.success).toBe(false);
  });
});
