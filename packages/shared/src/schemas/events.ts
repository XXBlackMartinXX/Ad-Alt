import { z } from "zod";

// ---------------------------------------------------------------------------
// Privacy guardrails
// ---------------------------------------------------------------------------

/**
 * Forbidden fields that must NEVER appear in telemetry schemas.
 * The telemetry-privacy test asserts these keys are absent from every schema.
 */
export const TELEMETRY_FORBIDDEN_FIELDS = [
  "sourceCode",
  "fileContent",
  "filePath",
  "fileName",
  "projectPath",
  "promptText",
  "aiResponse",
  "chatHistory",
  "terminalContent",
  "projectStructure",
  "workspacePath",
  "gitRemote",
  "envVariables",
  "apiKey",
  "secret",
  "password",
  "token",
] as const;

// ---------------------------------------------------------------------------
// Base schema shared by every telemetry event
// ---------------------------------------------------------------------------

const BaseEventSchema = z.object({
  /** UUID v4 used as an idempotency key; server deduplicates on this value */
  eventId: z.string().uuid(),
  /** Discriminator field used to route events to the correct handler */
  eventType: z.string(),
  /** Pseudonymous device identifier supplied by the extension; never linked to IP */
  deviceId: z.string().min(1).max(64),
  /** Extension session identifier, rotated hourly for privacy */
  sessionId: z.string().uuid(),
  /** Authenticated user ID; absent when the developer has not signed in */
  userId: z.string().uuid().optional(),
  /** Semver string of the VS Code extension */
  extensionVersion: z.string(),
  /** Which wait-state adapter generated this event */
  adapterName: z.enum([
    // VS Code extension adapters
    "ai_status_bar",
    "copilot_status",
    // Browser extension adapters
    "browser_chatgpt",
    "browser_claude",
    "browser_gemini",
    "browser_mock",
    // Desktop adapters (planned — not yet implemented)
    "desktop_chatgpt",
    "desktop_claude",
    "antigravity",
    // Dev/test adapters
    "mock",
    "manual",
  ]),
  /** Wall-clock time on the client when the event occurred */
  clientTimestamp: z.string().datetime(),
  /** Monotonically increasing counter within the current session */
  sequenceNumber: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Concrete event schemas
// ---------------------------------------------------------------------------

/** Extension detected a wait-state and requested an ad from the backend */
export const ImpressionRequestedEventSchema = BaseEventSchema.extend({
  eventType: z.literal("impression_requested"),
  /** The ad decision UUID returned by the backend's /ad-decision endpoint */
  adDecisionId: z.string().uuid(),
  campaignId: z.string().uuid(),
  creativeId: z.string().uuid(),
});

/** Ad text was injected into the status bar / webview and is now visible */
export const ImpressionRenderedEventSchema = BaseEventSchema.extend({
  eventType: z.literal("impression_rendered"),
  adDecisionId: z.string().uuid(),
  /** Wall-clock time (client) when the creative became visible */
  renderedAt: z.string().datetime(),
});

/** Ad was continuously visible for at least IMPRESSION_VIEWABILITY_THRESHOLD_MS */
export const ViewabilityEventSchema = BaseEventSchema.extend({
  eventType: z.literal("viewability_threshold_met"),
  adDecisionId: z.string().uuid(),
  /** Total milliseconds the ad was displayed; must be >= 3000 and <= 5 minutes */
  displayedDurationMs: z.number().int().min(3000).max(300_000),
  /** The threshold the client used (mirrors IMPRESSION_VIEWABILITY_THRESHOLD_MS) */
  thresholdMs: z.number().int().min(3000),
});

/**
 * Developer clicked the ad CTA.
 * The destination URL is NOT sent from the client; the server resolves it via
 * the adDecisionId to prevent click-URL leakage in telemetry payloads.
 */
export const ClickEventSchema = BaseEventSchema.extend({
  eventType: z.literal("click"),
  adDecisionId: z.string().uuid(),
  creativeId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Discriminated union of all valid events
// ---------------------------------------------------------------------------

export const TelemetryEventSchema = z.discriminatedUnion("eventType", [
  ImpressionRequestedEventSchema,
  ImpressionRenderedEventSchema,
  ViewabilityEventSchema,
  ClickEventSchema,
]);

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type ImpressionRequestedEvent = z.infer<typeof ImpressionRequestedEventSchema>;
export type ImpressionRenderedEvent = z.infer<typeof ImpressionRenderedEventSchema>;
export type ViewabilityEvent = z.infer<typeof ViewabilityEventSchema>;
export type ClickEvent = z.infer<typeof ClickEventSchema>;
