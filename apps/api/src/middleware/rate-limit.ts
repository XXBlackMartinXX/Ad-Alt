import { createMiddleware } from "hono/factory";
import { rateLimitCheck } from "../redis.js";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";

export function rateLimit(options: {
  limit: number;
  windowSeconds: number;
  keyFn?: (c: Context) => string;
}) {
  return createMiddleware(async (c, next) => {
    const keyFn =
      options.keyFn ??
      ((ctx: Context) => {
        const ip =
          ctx.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
          ctx.req.header("x-real-ip") ??
          "unknown";
        return `rl:${ctx.req.path}:${ip}`;
      });

    const key = keyFn(c);
    const { allowed, remaining } = await rateLimitCheck(
      key,
      options.limit,
      options.windowSeconds,
    );

    c.header("X-RateLimit-Limit", String(options.limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Window", String(options.windowSeconds));

    if (!allowed) {
      throw new HTTPException(429, { message: "Rate limit exceeded" });
    }
    await next();
  });
}
