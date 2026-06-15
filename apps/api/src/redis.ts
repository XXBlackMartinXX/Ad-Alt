import { Redis } from "ioredis";
import { env } from "./env.js";

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    _redis.on("error", (err: Error) => {
      console.error("Redis error:", err.message);
    });
  }
  return _redis;
}

export async function rateLimitCheck(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number; remaining: number }> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, windowSeconds, "NX");
  const results = await pipeline.exec();
  const count = (results?.[0]?.[1] as number) ?? 0;
  return {
    allowed: count <= limit,
    count,
    remaining: Math.max(0, limit - count),
  };
}

export async function dedupCheck(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
  return result === "OK"; // true = first time seen, false = duplicate
}
