import { Hono } from "hono";
import { requireApiKey } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { EventProcessor } from "../services/event-processor.js";
import { EventValidator } from "@ad-alt/telemetry";
import { logger } from "../middleware/logging.js";
import type { AppEnv } from "../types.js";

const eventProcessor = new EventProcessor();
const validator = new EventValidator();

export const eventsRoutes = new Hono<AppEnv>();

eventsRoutes.use("/v1/events", requireApiKey);
eventsRoutes.use(
  "/v1/events",
  rateLimit({
    limit: 300,
    windowSeconds: 60,
    keyFn: (c) => `rl:events:${(c.get("userId") as string | undefined) ?? "anon"}`,
  }),
);

eventsRoutes.post("/v1/events", async (c) => {
  const requestId = c.get("requestId") as string;
  const userId = c.get("userId") as string;
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: "invalid_json", message: "Request body must be valid JSON", requestId },
      400,
    );
  }

  const validation = validator.validate(body);
  if (!validation.success) {
    return c.json(
      {
        error: "validation_error",
        message: "Event validation failed",
        details: validation.errors,
        requestId,
      },
      400,
    );
  }

  const event = validation.data;
  const result = await eventProcessor.process(event, userId);

  if (result.isDuplicate) {
    // Return 200 for duplicates — extension should not retry
    return c.json({ data: { status: "duplicate", eventId: event.eventId }, requestId });
  }

  logger.info({
    requestId,
    eventId: event.eventId,
    eventType: event.eventType,
    msg: "event_ingested",
  });
  return c.json({
    data: {
      status: "accepted",
      eventId: event.eventId,
      ...(result.fraudDecision !== undefined && { fraudDecision: result.fraudDecision }),
    },
    requestId,
  });
});
