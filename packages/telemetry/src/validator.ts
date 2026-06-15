import {
  TelemetryEventSchema,
  TELEMETRY_FORBIDDEN_FIELDS,
  type TelemetryEvent,
} from "@ad-alt/shared";

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

export class EventValidator {
  private static readonly DEVICE_ID_PATTERN = /^[a-zA-Z0-9_\-]{1,64}$/;
  /** 5 minutes: acceptable clock skew from the future */
  private static readonly MAX_FUTURE_MS = 5 * 60 * 1000;
  /** 1 hour: oldest event we will accept */
  private static readonly MAX_PAST_MS = 60 * 60 * 1000;

  validate(rawPayload: unknown): ValidationResult<TelemetryEvent> {
    // 1. Check for forbidden fields in raw object
    if (typeof rawPayload === "object" && rawPayload !== null) {
      const keys = Object.keys(rawPayload as object);
      const forbidden = keys.filter((k) =>
        (TELEMETRY_FORBIDDEN_FIELDS as readonly string[]).includes(k)
      );
      if (forbidden.length > 0) {
        return {
          success: false,
          errors: [`Forbidden fields in payload: ${forbidden.join(", ")}`],
        };
      }
    }

    // 2. Parse with Zod
    const result = TelemetryEventSchema.safeParse(rawPayload);
    if (!result.success) {
      return {
        success: false,
        errors: result.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`
        ),
      };
    }

    const event = result.data;

    // 3. Timestamp validation
    const clientTs = new Date(event.clientTimestamp).getTime();
    const now = Date.now();
    if (clientTs > now + EventValidator.MAX_FUTURE_MS) {
      return {
        success: false,
        errors: ["clientTimestamp is too far in the future"],
      };
    }
    if (clientTs < now - EventValidator.MAX_PAST_MS) {
      return {
        success: false,
        errors: ["clientTimestamp is too far in the past"],
      };
    }

    // 4. Sequence number must be non-negative (Zod schema enforces nonnegative, but belt-and-suspenders)
    if (event.sequenceNumber < 0) {
      return {
        success: false,
        errors: ["sequenceNumber must be non-negative"],
      };
    }

    // 5. Device ID format
    if (!EventValidator.DEVICE_ID_PATTERN.test(event.deviceId)) {
      return { success: false, errors: ["deviceId format invalid"] };
    }

    return { success: true, data: event };
  }
}
