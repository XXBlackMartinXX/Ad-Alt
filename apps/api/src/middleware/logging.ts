import { createMiddleware } from "hono/factory";
import pino from "pino";
import { env } from "../env.js";

export const logger = pino({ level: env.LOG_LEVEL });

export const requestLogger = createMiddleware(async (c, next) => {
  const start = Date.now();
  const requestId = c.get("requestId") as string | undefined;

  logger.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    msg: "request_start",
  });

  await next();

  const duration = Date.now() - start;
  logger.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: duration,
    msg: "request_end",
  });
});
