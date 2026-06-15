import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { logger } from "./logging.js";

export function errorHandler(err: Error, c: Context): Response {
  const requestId = c.get("requestId") as string | undefined;

  if (err instanceof HTTPException) {
    return c.json({ error: "http_error", message: err.message, requestId }, err.status);
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: "validation_error",
        message: "Invalid request data",
        details: err.errors,
        requestId,
      },
      400,
    );
  }

  logger.error({ requestId, err, msg: "unhandled_error" });
  return c.json(
    { error: "internal_error", message: "An unexpected error occurred", requestId },
    500,
  );
}
