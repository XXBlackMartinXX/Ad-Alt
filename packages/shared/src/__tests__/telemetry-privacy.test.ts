import { describe, it, expect } from "vitest";
import {
  TELEMETRY_FORBIDDEN_FIELDS,
  TelemetryEventSchema,
  ImpressionRequestedEventSchema,
  ImpressionRenderedEventSchema,
  ViewabilityEventSchema,
  ClickEventSchema,
} from "../schemas/events.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Helper: recursively extract all field keys from a Zod schema
// ---------------------------------------------------------------------------

function extractKeys(schema: z.ZodTypeAny, depth = 0): string[] {
  if (depth > 10) return [];
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape);
  }
  if (schema instanceof z.ZodDiscriminatedUnion) {
    return [...schema.options.values()].flatMap((opt: z.ZodTypeAny) =>
      extractKeys(opt, depth + 1),
    );
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return extractKeys(schema.unwrap(), depth + 1);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Privacy: forbidden field presence
// ---------------------------------------------------------------------------

describe("Telemetry privacy: forbidden fields", () => {
  const schemas = [
    { name: "TelemetryEvent (union)", schema: TelemetryEventSchema },
    { name: "ImpressionRequested", schema: ImpressionRequestedEventSchema },
    { name: "ImpressionRendered", schema: ImpressionRenderedEventSchema },
    { name: "ViewabilityEvent", schema: ViewabilityEventSchema },
    { name: "ClickEvent", schema: ClickEventSchema },
  ];

  for (const forbidden of TELEMETRY_FORBIDDEN_FIELDS) {
    it(`must not contain forbidden field "${forbidden}" in any telemetry schema`, () => {
      for (const { name, schema } of schemas) {
        const keys = extractKeys(schema);
        expect(keys, `Schema "${name}" must not contain "${forbidden}"`).not.toContain(
          forbidden,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Functional: valid and invalid event parsing
// ---------------------------------------------------------------------------

describe("Telemetry event validation", () => {
  it("accepts a valid impression_requested event", () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      eventType: "impression_requested",
      deviceId: "dev_abc123",
      sessionId: "550e8400-e29b-41d4-a716-446655440001",
      userId: "550e8400-e29b-41d4-a716-446655440002",
      extensionVersion: "0.1.0",
      adapterName: "ai_status_bar",
      clientTimestamp: new Date().toISOString(),
      sequenceNumber: 0,
      adDecisionId: "550e8400-e29b-41d4-a716-446655440003",
      campaignId: "550e8400-e29b-41d4-a716-446655440004",
      creativeId: "550e8400-e29b-41d4-a716-446655440005",
    };
    expect(() => ImpressionRequestedEventSchema.parse(event)).not.toThrow();
  });

  it("rejects a viewability event with duration below minimum", () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      eventType: "viewability_threshold_met",
      deviceId: "dev_abc123",
      sessionId: "550e8400-e29b-41d4-a716-446655440001",
      extensionVersion: "0.1.0",
      adapterName: "mock",
      clientTimestamp: new Date().toISOString(),
      sequenceNumber: 1,
      adDecisionId: "550e8400-e29b-41d4-a716-446655440003",
      displayedDurationMs: 1000, // below 3000ms minimum
      thresholdMs: 5000,
    };
    expect(() => ViewabilityEventSchema.parse(event)).toThrow();
  });

  it("rejects a click event missing required adDecisionId", () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      eventType: "click",
      deviceId: "dev_abc123",
      sessionId: "550e8400-e29b-41d4-a716-446655440001",
      extensionVersion: "0.1.0",
      adapterName: "mock",
      clientTimestamp: new Date().toISOString(),
      sequenceNumber: 2,
      // missing adDecisionId
      creativeId: "550e8400-e29b-41d4-a716-446655440005",
    };
    expect(() => ClickEventSchema.parse(event)).toThrow();
  });
});
