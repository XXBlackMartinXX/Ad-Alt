import { createMiddleware } from "hono/factory";
import { randomUUID } from "crypto";

export const requestId = createMiddleware(async (c, next) => {
  const id = c.req.header("x-request-id") ?? randomUUID();
  c.set("requestId", id);
  c.header("X-Request-ID", id);
  await next();
});
