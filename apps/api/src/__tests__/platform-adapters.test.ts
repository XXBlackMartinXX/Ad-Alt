/**
 * Multi-platform adapter validation tests (Phase 5 — API hardening).
 *
 * Verifies:
 * 1. Browser and desktop adapter names are accepted by the event schema
 * 2. Unknown / sentinel adapter names are rejected
 * 3. An adapter kill-switch flag blocks event processing
 * 4. The /v1/ads/decision endpoint accepts browser adapter names
 * 5. Existing VS Code adapter names remain fully compatible
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// DB mock — identical generic chain mock from events.test.ts, extended with
// a controllable featureFlags source so kill-switch tests work correctly.
// ---------------------------------------------------------------------------

let mockFlagRows: Array<{ name: string; isEnabled: boolean }> = [];

vi.mock("@ad-alt/database", () => {
  function chain(val: unknown[] = []): any {
    const p: any = Promise.resolve(val);
    const methods = [
      "from", "where", "orderBy", "limit", "offset", "innerJoin", "leftJoin",
      "values", "set", "returning", "onConflictDoNothing", "onConflictDoUpdate",
      "for",
    ];
    methods.forEach((m) => { p[m] = () => chain(val); });
    return p;
  }

  // Fake valid API key record — inline to avoid hoisting issues with top-level consts
  const fakeKeyRecord = {
    id: "test-key-id",
    userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    revokedAt: null,
    expiresAt: null,
  };

  return {
    db: {
      select: () => ({
        from: (table: any) => {
          // Return fake valid key so auth middleware passes
          if (table?.__t === "apiKeys") {
            return { where: () => ({ limit: async () => [fakeKeyRecord] }) };
          }
          // Return controllable flag rows for featureFlags table
          if (table?.__t === "featureFlags") {
            return Promise.resolve(mockFlagRows);
          }
          return chain();
        },
      }),
      insert: () => chain(),
      update: () => chain(),
      execute: () => Promise.resolve({}),
    },
    apiKeys: { __t: "apiKeys" },
    users: {},
    impressionEvents: {},
    clickEvents: {},
    eventDeduplicationKeys: {},
    adDeliveryDecisions: {},
    campaigns: {},
    creatives: {},
    featureFlags: { __t: "featureFlags" },
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
    pipeline: vi.fn().mockReturnValue({ incr: vi.fn(), expire: vi.fn(), exec: vi.fn().mockResolvedValue([]) }),
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

import { createApp } from "../app.js";

const NOW = new Date().toISOString();
const UUID = () =>
  "550e8400-e29b-41d4-a716-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");

function makeEvent(adapterName: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId: UUID(),
    eventType: "impression_requested",
    deviceId: "dev_test123",
    sessionId: UUID(),
    userId: UUID(),
    extensionVersion: "0.1.0",
    adapterName,
    clientTimestamp: NOW,
    sequenceNumber: 0,
    adDecisionId: UUID(),
    campaignId: UUID(),
    creativeId: UUID(),
    ...overrides,
  };
}

async function postEvent(adapterName: string, extraFields: Record<string, unknown> = {}) {
  const app = createApp();
  return app.request("/v1/events", {
    method: "POST",
    body: JSON.stringify(makeEvent(adapterName, extraFields)),
    headers: { "content-type": "application/json", authorization: "Bearer any-key" },
  });
}

beforeEach(() => {
  // Default: no kill switches active
  mockFlagRows = [];
});

// ---------------------------------------------------------------------------
// Schema acceptance — valid adapter names
// ---------------------------------------------------------------------------

describe("POST /v1/events — valid adapter names accepted", () => {
  const validAdapters = [
    "ai_status_bar",
    "copilot_status",
    "browser_chatgpt",
    "browser_claude",
    "browser_gemini",
    "browser_mock",
    "desktop_chatgpt",
    "desktop_claude",
    "antigravity",
    "mock",
    "manual",
  ];

  for (const adapter of validAdapters) {
    it(`accepts adapterName="${adapter}"`, async () => {
      const res = await postEvent(adapter);
      // 200 = processed (no valid DB rows in mock so it returns accepted/invalid_decision)
      // 401 = auth header rejected (acceptable — schema parsed OK)
      expect([200, 401]).toContain(res.status);
    });
  }
});

// ---------------------------------------------------------------------------
// Schema rejection — invalid adapter names
// ---------------------------------------------------------------------------

describe("POST /v1/events — invalid adapter names rejected", () => {
  const invalidAdapters = [
    "unknown_disabled",
    "totally_unknown",
    "",
    "BROWSER_CHATGPT", // case-sensitive
    "browser-chatgpt", // wrong separator
  ];

  for (const adapter of invalidAdapters) {
    it(`rejects adapterName="${adapter}"`, async () => {
      const res = await postEvent(adapter);
      expect([400, 422, 401]).toContain(res.status);
      // If it returned 200, the schema accepted an invalid value — fail
      expect(res.status).not.toBe(200);
    });
  }
});

// ---------------------------------------------------------------------------
// Adapter kill-switch enforcement
// ---------------------------------------------------------------------------

describe("POST /v1/events — adapter kill-switch", () => {
  it("returns accepted with adapter_disabled when kill_switch_all_ads is on", async () => {
    mockFlagRows = [{ name: "kill_switch_all_ads", isEnabled: true }];
    const res = await postEvent("browser_chatgpt");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data?.["fraudDecision"]).toBe("adapter_disabled");
  });

  it("returns accepted with adapter_disabled when disable_adapter_{name} flag is on", async () => {
    mockFlagRows = [{ name: "disable_adapter_browser_claude", isEnabled: true }];
    const res = await postEvent("browser_claude");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data?.["fraudDecision"]).toBe("adapter_disabled");
  });

  it("returns accepted with adapter_disabled when kill_switch_{name} flag is on", async () => {
    mockFlagRows = [{ name: "kill_switch_browser_gemini", isEnabled: true }];
    const res = await postEvent("browser_gemini");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data?.["fraudDecision"]).toBe("adapter_disabled");
  });

  it("does NOT disable another adapter when only one is kill-switched", async () => {
    mockFlagRows = [{ name: "kill_switch_browser_claude", isEnabled: true }];
    const res = await postEvent("browser_chatgpt");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    // Should NOT be adapter_disabled for a different adapter
    expect(body.data?.["fraudDecision"]).not.toBe("adapter_disabled");
  });

  it("VS Code adapter still works when only browser adapters are disabled", async () => {
    mockFlagRows = [{ name: "kill_switch_browser_chatgpt", isEnabled: true }];
    const res = await postEvent("ai_status_bar");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data?.["fraudDecision"]).not.toBe("adapter_disabled");
  });
});

// ---------------------------------------------------------------------------
// /v1/ads/decision — multi-platform query validation
// ---------------------------------------------------------------------------

describe("GET /v1/ads/decision — browser adapter names", () => {
  const browserAdapters = ["browser_chatgpt", "browser_claude", "browser_gemini", "browser_mock"];

  for (const adapter of browserAdapters) {
    it(`accepts adapterName="${adapter}" in query`, async () => {
      const app = createApp();
      const res = await app.request(
        `/v1/ads/decision?deviceId=dev123&adapterName=${adapter}&extensionVersion=0.1.0`,
      );
      // 200/204 = processed; 401 = no auth but schema parsed OK; not 400/422
      expect([200, 204, 401]).toContain(res.status);
    });
  }

  it("still rejects unknown adapter name in ad-decision query", async () => {
    const app = createApp();
    const res = await app.request(
      "/v1/ads/decision?deviceId=dev123&adapterName=totally_made_up&extensionVersion=0.1.0",
    );
    expect([400, 422]).toContain(res.status);
  });
});
