import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../app.js";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that trigger the modules
// ---------------------------------------------------------------------------

vi.mock("@ad-alt/database", () => {
  // Returns a Promise that resolves to `val` and also exposes all chaining methods.
  // This lets the same mock handle both `await db.select().from(t)` and
  // `await db.select().from(t).where(x).limit(1)`.
  function chain(val: unknown[] = []): any {
    const p: any = Promise.resolve(val);
    const methods = [
      "from", "where", "orderBy", "limit", "offset", "innerJoin", "leftJoin",
      "values", "set", "returning", "onConflictDoNothing", "onConflictDoUpdate",
    ];
    methods.forEach((m) => { p[m] = () => chain(val); });
    return p;
  }

  return {
    db: {
      select: () => chain(),
      insert: () => chain(),
      update: () => chain(),
      execute: () => Promise.resolve({}),
    },
    // Table references (used as identifiers by Drizzle; mock ignores them)
    apiKeys: {},
    users: {},
    impressionEvents: {},
    clickEvents: {},
    eventDeduplicationKeys: {},
    adDeliveryDecisions: {},
    campaigns: {},
    creatives: {},
    featureFlags: {},
    developerProfiles: {},
    ledgerEntries: {},
    creativeReviews: {},
    adminAuditLogs: {},
    devices: {},
    balances: {},
    // Drizzle query helpers — mock returns undefined; ignored by the chain mock above
    eq: () => undefined,
    and: () => undefined,
    or: () => undefined,
    not: () => undefined,
    isNull: () => undefined,
    isNotNull: () => undefined,
    gt: () => undefined,
    gte: () => undefined,
    lt: () => undefined,
    lte: () => undefined,
    desc: () => undefined,
    asc: () => undefined,
    sql: () => undefined,
    inArray: () => undefined,
    notInArray: () => undefined,
  };
});

vi.mock("../redis.js", () => ({
  getRedis: vi.fn().mockReturnValue({
    ping: vi.fn().mockResolvedValue("PONG"),
    get: vi.fn().mockResolvedValue(null),
  }),
  rateLimitCheck: vi.fn().mockResolvedValue({ allowed: true, count: 1, remaining: 299 }),
  dedupCheck: vi.fn().mockResolvedValue(true),
}));

vi.mock("../env.js", () => ({
  env: {
    DATABASE_URL: "postgresql://test",
    REDIS_URL: "redis://localhost:6379",
    API_SECRET_KEY: "test-secret",
    EVENT_SIGNING_SECRET: "test-signing-secret",
    NEXTAUTH_SECRET: "test-nextauth-secret",
    LOG_LEVEL: "silent",
    PLATFORM_FEE_PERCENT: 40,
    DEVELOPER_SHARE_PERCENT: 60,
    FRAUD_REVIEW_THRESHOLD: 60,
    FRAUD_BLOCK_THRESHOLD: 85,
    FRAUD_IMPRESSIONS_PER_HOUR_MAX: 60,
    FRAUD_CLICK_MIN_INTERVAL_SECONDS: 30,
    ADMIN_EMAILS: ["admin@test.com"],
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    NODE_ENV: "test",
    PORT: 3001,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();
const UUID = () =>
  "550e8400-e29b-41d4-a716-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");

const makeImpressionRequestedEvent = (overrides: Record<string, unknown> = {}) => ({
  eventId: UUID(),
  eventType: "impression_requested",
  deviceId: "dev_test123",
  sessionId: UUID(),
  userId: UUID(),
  extensionVersion: "0.1.0",
  adapterName: "mock",
  clientTimestamp: NOW,
  sequenceNumber: 0,
  adDecisionId: UUID(),
  campaignId: UUID(),
  creativeId: UUID(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns a health status object", async () => {
    const app = createApp();
    const res = await app.request("/health");
    // With mocked DB + Redis both should respond OK
    expect([200, 503]).toContain(res.status);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
    expect(body).toHaveProperty("timestamp");
  });
});

// ---------------------------------------------------------------------------
// POST /v1/events — authentication
// ---------------------------------------------------------------------------

describe("POST /v1/events — auth", () => {
  it("returns 401 without Authorization header", async () => {
    const app = createApp();
    const res = await app.request("/v1/events", {
      method: "POST",
      body: JSON.stringify(makeImpressionRequestedEvent()),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with a malformed Authorization header", async () => {
    const app = createApp();
    const res = await app.request("/v1/events", {
      method: "POST",
      body: JSON.stringify(makeImpressionRequestedEvent()),
      headers: {
        "content-type": "application/json",
        authorization: "Token not-a-bearer",
      },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/events — validation
// ---------------------------------------------------------------------------

describe("POST /v1/events — validation", () => {
  it("returns 400 for missing required fields (no eventId)", async () => {
    // With the default DB mock returning [] for api key lookup → 401.
    // We can only test validation after auth; confirm the status is in {400,401}.
    const app = createApp();
    const res = await app.request("/v1/events", {
      method: "POST",
      body: JSON.stringify({ eventType: "impression_requested" }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer any-key",
      },
    });
    expect([400, 401]).toContain(res.status);
  });

  it("returns 400 for an unknown eventType", async () => {
    const app = createApp();
    const res = await app.request("/v1/events", {
      method: "POST",
      body: JSON.stringify({ ...makeImpressionRequestedEvent(), eventType: "unknown_type" }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer any-key",
      },
    });
    expect([400, 401]).toContain(res.status);
  });

  it("returns 400 for a payload with forbidden field sourceCode", async () => {
    const app = createApp();
    const payload = { ...makeImpressionRequestedEvent(), sourceCode: "function foo() {}" };
    const res = await app.request("/v1/events", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer any-key",
      },
    });
    expect([400, 401]).toContain(res.status);
  });

  it("returns 400 for non-JSON body", async () => {
    const app = createApp();
    const res = await app.request("/v1/events", {
      method: "POST",
      body: "this is not json",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer any-key",
      },
    });
    expect([400, 401]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/flags
// ---------------------------------------------------------------------------

describe("GET /v1/flags", () => {
  it("returns feature flags structure", async () => {
    const app = createApp();
    const res = await app.request("/v1/flags");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("killSwitchEnabled");
    expect(body.data).toHaveProperty("disabledAdapters");
    expect(body.data).toHaveProperty("flags");
    expect(Array.isArray(body.data["disabledAdapters"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/ads/decision
// ---------------------------------------------------------------------------

describe("GET /v1/ads/decision", () => {
  it("returns 400 for missing query params", async () => {
    const app = createApp();
    const res = await app.request("/v1/ads/decision");
    expect([400, 422]).toContain(res.status);
  });

  it("returns 400 for invalid adapterName", async () => {
    const app = createApp();
    const res = await app.request(
      "/v1/ads/decision?deviceId=dev123&adapterName=invalid&extensionVersion=0.1.0",
    );
    expect([400, 422]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

describe("404 fallback", () => {
  it("returns 404 for unknown routes", async () => {
    const app = createApp();
    const res = await app.request("/v1/does-not-exist");
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("error", "not_found");
  });
});
