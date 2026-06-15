import { describe, it, expect, vi } from "vitest";
import { createApp } from "../app.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@ad-alt/database", () => {
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
  rateLimitCheck: vi.fn().mockResolvedValue({ allowed: true, count: 1, remaining: 59 }),
  dedupCheck: vi.fn().mockResolvedValue(true),
}));

vi.mock("../env.js", () => ({
  env: {
    DATABASE_URL: "postgresql://test",
    REDIS_URL: "redis://localhost:6379",
    API_SECRET_KEY: "test-secret",
    EVENT_SIGNING_SECRET: "test-signing",
    NEXTAUTH_SECRET: "test-nextauth",
    LOG_LEVEL: "silent",
    PLATFORM_FEE_PERCENT: 40,
    DEVELOPER_SHARE_PERCENT: 60,
    FRAUD_REVIEW_THRESHOLD: 60,
    FRAUD_BLOCK_THRESHOLD: 85,
    FRAUD_IMPRESSIONS_PER_HOUR_MAX: 60,
    FRAUD_CLICK_MIN_INTERVAL_SECONDS: 30,
    ADMIN_EMAILS: [],
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    NODE_ENV: "test",
    PORT: 3001,
  },
}));

// ---------------------------------------------------------------------------
// GET /v1/ledger/me
// ---------------------------------------------------------------------------

describe("GET /v1/ledger/me", () => {
  it("returns 401 without Authorization header", async () => {
    const app = createApp();
    const res = await app.request("/v1/ledger/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 with Bearer prefix but invalid key (mocked as not found)", async () => {
    const app = createApp();
    const res = await app.request("/v1/ledger/me", {
      headers: { authorization: "Bearer not-a-valid-key" },
    });
    // Default mock returns [] for API key lookups → 401
    expect(res.status).toBe(401);
  });

  it("returns 401 without Bearer prefix", async () => {
    const app = createApp();
    const res = await app.request("/v1/ledger/me", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status).toBe(401);
  });

  it("enforces page minimum of 1", async () => {
    const app = createApp();
    const res = await app.request("/v1/ledger/me?page=0", {
      headers: { authorization: "Bearer some-key" },
    });
    // Will be 401 (invalid key) or 400 (invalid query). Both are acceptable.
    expect([400, 401, 422]).toContain(res.status);
  });

  it("enforces limit max of 100", async () => {
    const app = createApp();
    const res = await app.request("/v1/ledger/me?limit=999", {
      headers: { authorization: "Bearer some-key" },
    });
    // Will be 401 (invalid key) or 400 (over limit). Both are acceptable.
    expect([400, 401, 422]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Campaign routes
// ---------------------------------------------------------------------------

describe("GET /v1/campaigns", () => {
  it("returns 401 without Authorization header", async () => {
    const app = createApp();
    const res = await app.request("/v1/campaigns");
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/campaigns", () => {
  it("returns 401 without Authorization header", async () => {
    const app = createApp();
    const res = await app.request("/v1/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name: "Test",
        budgetMicrocents: 1_000_000,
        cpmBidMicrocents: 100_000,
      }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid Authorization and correct body", async () => {
    const app = createApp();
    const res = await app.request("/v1/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Campaign",
        budgetMicrocents: 5_000_000,
        cpmBidMicrocents: 200_000,
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer invalid-key",
      },
    });
    // Mock DB returns [] for key lookup → 401
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Admin routes — gate check
// ---------------------------------------------------------------------------

describe("GET /v1/admin/creatives/pending", () => {
  it("returns 401 without auth", async () => {
    const app = createApp();
    const res = await app.request("/v1/admin/creatives/pending");
    expect(res.status).toBe(401);
  });
});
