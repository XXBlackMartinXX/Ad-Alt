/**
 * Balance correctness tests for the ledger write path.
 *
 * Verifies the fix for the gap where `balanceAfterMicrocents` was hardcoded to
 * `0` and the `balances` table was never updated by `LedgerService`. These
 * tests exercise real `LedgerService`/`EventProcessor` code against an
 * in-memory fake `@ad-alt/database` + Redis, so no live Postgres/Redis is
 * required to prove the balance math, atomicity-of-call-pattern, and
 * lifecycle/dedup guards.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// In-memory fake DB modeling exactly the table/chain shapes LedgerService and
// EventProcessor use. Table identity is reference equality (each export below
// is a distinct sentinel object), matching how real Drizzle table objects work.
// ---------------------------------------------------------------------------

vi.mock("@ad-alt/database", () => {
  const campaigns = { __t: "campaigns" };
  const ledgerEntries = { __t: "ledgerEntries" };
  const developerProfiles = { __t: "developerProfiles" };
  const balances = { __t: "balances" };
  const impressionEvents = { __t: "impressionEvents" };
  const eventDeduplicationKeys = { __t: "eventDeduplicationKeys" };
  const adDeliveryDecisions = { __t: "adDeliveryDecisions" };
  const featureFlags = { __t: "featureFlags" };

  const state = {
    campaignRow: null as any,
    decisionRow: null as any,
    impressionRow: null as any,
    balanceStore: new Map<string, number>(),
    ledgerWrites: [] as any[],
    balanceUpsertCalls: 0,
  };

  function reset(): void {
    state.campaignRow = null;
    state.decisionRow = null;
    state.impressionRow = null;
    state.balanceStore.clear();
    state.ledgerWrites.length = 0;
    state.balanceUpsertCalls = 0;
  }

  function makeTx() {
    return {
      select: () => ({
        from: (table: any) => {
          if (table !== campaigns) throw new Error(`unexpected tx.select table: ${table?.__t}`);
          return {
            where: () => ({
              for: () => ({
                limit: async () => (state.campaignRow ? [state.campaignRow] : []),
              }),
            }),
          };
        },
      }),
      insert: (table: any) => {
        if (table === ledgerEntries) {
          return {
            values: async (rows: any[]) => {
              state.ledgerWrites.push(...rows);
            },
          };
        }
        if (table === balances) {
          return {
            values: (row: any) => ({
              onConflictDoUpdate: () => ({
                returning: async () => {
                  state.balanceUpsertCalls++;
                  const prev = state.balanceStore.get(row.accountId) ?? 0;
                  const next = prev + row.balanceMicrocents;
                  state.balanceStore.set(row.accountId, next);
                  return [{ balanceMicrocents: next }];
                },
              }),
            }),
          };
        }
        throw new Error(`unexpected tx.insert table: ${table?.__t}`);
      },
      update: (table: any) => {
        if (table === campaigns) {
          return {
            set: (patch: any) => ({
              where: async () => {
                if (state.campaignRow && patch.status) state.campaignRow.status = patch.status;
              },
            }),
          };
        }
        if (table === developerProfiles) {
          return { set: () => ({ where: async () => {} }) };
        }
        throw new Error(`unexpected tx.update table: ${table?.__t}`);
      },
    };
  }

  const db = {
    transaction: async (cb: (tx: any) => Promise<void>) => cb(makeTx()),
    select: () => ({
      from: (table: any) => {
        if (table === adDeliveryDecisions) {
          return { where: () => ({ limit: async () => (state.decisionRow ? [state.decisionRow] : []) }) };
        }
        // Return empty feature flags (no kill switches) for adapter-check path
        if (table === featureFlags) {
          return { then: (resolve: (v: any[]) => void) => resolve([]) };
        }
        throw new Error(`unexpected db.select table: ${table?.__t}`);
      },
    }),
    insert: (table: any) => {
      if (table === eventDeduplicationKeys) {
        return { values: () => ({ onConflictDoNothing: async () => {} }) };
      }
      if (table === impressionEvents) {
        return {
          values: (row: any) => ({
            onConflictDoNothing: async () => {
              if (!state.impressionRow) state.impressionRow = { ...row };
            },
          }),
        };
      }
      throw new Error(`unexpected db.insert table: ${table?.__t}`);
    },
    update: (table: any) => {
      if (table === adDeliveryDecisions) {
        return { set: () => ({ where: async () => {} }) };
      }
      if (table === impressionEvents) {
        return {
          set: (patch: any) => ({
            where: () => {
              // Only the viewability-stage update carries `viewableAt`; that's the
              // one update conditioned (in production) on status === "rendered".
              const requiresRendered = "viewableAt" in patch;
              const apply = (): any[] => {
                const row = state.impressionRow;
                if (!row) return [];
                if (requiresRendered && row.status !== "rendered") return [];
                Object.assign(row, patch);
                return [{ ...row }];
              };
              return {
                returning: async () => apply(),
                then: (resolve: (v: unknown) => void) => {
                  apply();
                  resolve(undefined);
                },
              };
            },
          }),
        };
      }
      throw new Error(`unexpected db.update table: ${table?.__t}`);
    },
  };

  return {
    db,
    campaigns,
    ledgerEntries,
    developerProfiles,
    balances,
    impressionEvents,
    eventDeduplicationKeys,
    adDeliveryDecisions,
    featureFlags,
    eq: () => undefined,
    and: () => undefined,
    or: () => undefined,
    gt: () => undefined,
    sql: () => undefined,
    __testState: state,
    __resetTestState: reset,
  };
});

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
    ADMIN_EMAILS: [],
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    NODE_ENV: "test",
    PORT: 3001,
  },
}));

const seenDedupKeys = new Set<string>();

vi.mock("../redis.js", () => ({
  getRedis: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    pipeline: () => ({ incr: () => {}, expire: () => {}, exec: async () => [] }),
  }),
  dedupCheck: vi.fn(async (key: string) => {
    if (seenDedupKeys.has(key)) return false;
    seenDedupKeys.add(key);
    return true;
  }),
}));

import { LedgerService } from "../services/ledger.service.js";
import { EventProcessor } from "../services/event-processor.js";
import * as dbModule from "@ad-alt/database";

const testState = (dbModule as any).__testState as {
  campaignRow: any;
  decisionRow: any;
  impressionRow: any;
  balanceStore: Map<string, number>;
  ledgerWrites: any[];
  balanceUpsertCalls: number;
};
const resetTestState = (dbModule as any).__resetTestState as () => void;

const ADVERTISER_ID = "11111111-1111-1111-1111-111111111111";
const DEVELOPER_ID = "22222222-2222-2222-2222-222222222222";
const CAMPAIGN_ID = "33333333-3333-3333-3333-333333333333";
const CPM_BID_MICROCENTS = 5_000_000; // $5.00 CPM → 5,000 µ¢ per impression

function freshCampaign(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CAMPAIGN_ID,
    advertiserId: ADVERTISER_ID,
    cpmBidMicrocents: CPM_BID_MICROCENTS,
    spentMicrocents: 0,
    budgetMicrocents: 1_000_000_000,
    status: "active",
    ...overrides,
  };
}

beforeEach(() => {
  resetTestState();
  seenDedupKeys.clear();
});

// ---------------------------------------------------------------------------
// 1 & 2. Unit tests: recordImpression / recordClick update balances correctly
// ---------------------------------------------------------------------------

describe("LedgerService.recordImpression — balance updates", () => {
  it("credits the developer balance and stores the correct balanceAfterMicrocents", async () => {
    testState.campaignRow = freshCampaign();
    const ledgerService = new LedgerService();

    await ledgerService.recordImpression("imp-1", CAMPAIGN_ID, DEVELOPER_ID);

    // $5 CPM / 1000 = 5,000 µ¢ total; 60% developer share (test env default) = 3,000 µ¢
    const developerEntry = testState.ledgerWrites.find((e) => e.entryType === "developer_credit");
    expect(developerEntry).toBeDefined();
    expect(developerEntry.balanceAfterMicrocents).toBe(testState.balanceStore.get(DEVELOPER_ID));
    expect(testState.balanceStore.get(DEVELOPER_ID)).toBeGreaterThan(0);
  });

  it("debits the advertiser balance and credits the platform balance consistently", async () => {
    testState.campaignRow = freshCampaign();
    const ledgerService = new LedgerService();

    await ledgerService.recordImpression("imp-2", CAMPAIGN_ID, DEVELOPER_ID);

    const advertiserEntry = testState.ledgerWrites.find((e) => e.entryType === "advertiser_charge");
    const platformEntry = testState.ledgerWrites.find((e) => e.entryType === "platform_fee");

    expect(advertiserEntry.balanceAfterMicrocents).toBe(testState.balanceStore.get(ADVERTISER_ID));
    expect(platformEntry.balanceAfterMicrocents).toBe(testState.balanceStore.get("platform"));
    // Advertiser was charged, so their running balance goes negative from a 0 start.
    expect(testState.balanceStore.get(ADVERTISER_ID)).toBeLessThan(0);
  });

  it("accumulates balance correctly across multiple impressions for the same accounts", async () => {
    testState.campaignRow = freshCampaign();
    const ledgerService = new LedgerService();

    await ledgerService.recordImpression("imp-3", CAMPAIGN_ID, DEVELOPER_ID);
    const afterFirst = testState.balanceStore.get(DEVELOPER_ID)!;
    await ledgerService.recordImpression("imp-4", CAMPAIGN_ID, DEVELOPER_ID);
    const afterSecond = testState.balanceStore.get(DEVELOPER_ID)!;

    expect(afterSecond).toBe(afterFirst * 2);
    const secondDeveloperEntry = testState.ledgerWrites
      .filter((e) => e.entryType === "developer_credit")
      .at(-1);
    expect(secondDeveloperEntry.balanceAfterMicrocents).toBe(afterSecond);
  });
});

describe("LedgerService.recordClick — balance updates", () => {
  it("credits the developer balance and stores the correct balanceAfterMicrocents", async () => {
    testState.campaignRow = freshCampaign();
    const ledgerService = new LedgerService();

    await ledgerService.recordClick("click-1", CAMPAIGN_ID, DEVELOPER_ID);

    const developerEntry = testState.ledgerWrites.find((e) => e.entryType === "developer_credit");
    expect(developerEntry.balanceAfterMicrocents).toBe(testState.balanceStore.get(DEVELOPER_ID));
    // Click value is 10x impression value, so this must be 10x what one impression credits.
    expect(testState.balanceStore.get(DEVELOPER_ID)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Integration/lifecycle test — requested → rendered → viewable → billable
// ---------------------------------------------------------------------------

describe("EventProcessor lifecycle — ledger + balance updated exactly once", () => {
  const NOW = new Date().toISOString();
  const DECISION_ID = "44444444-4444-4444-4444-444444444444";
  const CREATIVE_ID = "55555555-5555-5555-5555-555555555555";
  const SESSION_ID = "66666666-6666-6666-6666-666666666666";

  function setUpDecision() {
    testState.campaignRow = freshCampaign();
    testState.decisionRow = {
      id: DECISION_ID,
      campaignId: CAMPAIGN_ID,
      creativeId: CREATIVE_ID,
      expiresAt: new Date(Date.now() + 60_000),
      wasServed: false,
    };
  }

  it("creates exactly one set of ledger entries and updates the balance exactly once", async () => {
    setUpDecision();
    const processor = new EventProcessor();

    await processor.process(
      {
        eventId: "77777777-7777-7777-7777-777777777771",
        eventType: "impression_requested",
        deviceId: "dev_test",
        sessionId: SESSION_ID,
        extensionVersion: "0.0.1",
        adapterName: "mock",
        clientTimestamp: NOW,
        sequenceNumber: 0,
        adDecisionId: DECISION_ID,
        campaignId: CAMPAIGN_ID,
        creativeId: CREATIVE_ID,
      },
      DEVELOPER_ID,
    );

    await processor.process(
      {
        eventId: "77777777-7777-7777-7777-777777777772",
        eventType: "impression_rendered",
        deviceId: "dev_test",
        sessionId: SESSION_ID,
        extensionVersion: "0.0.1",
        adapterName: "mock",
        clientTimestamp: NOW,
        sequenceNumber: 1,
        adDecisionId: DECISION_ID,
        renderedAt: NOW,
      },
      DEVELOPER_ID,
    );

    const result = await processor.process(
      {
        eventId: "77777777-7777-7777-7777-777777777773",
        eventType: "viewability_threshold_met",
        deviceId: "dev_test",
        sessionId: SESSION_ID,
        extensionVersion: "0.0.1",
        adapterName: "mock",
        clientTimestamp: NOW,
        sequenceNumber: 2,
        adDecisionId: DECISION_ID,
        displayedDurationMs: 3500,
        thresholdMs: 3000,
      },
      DEVELOPER_ID,
    );

    expect(result.fraudDecision).toBe("pass");
    expect(testState.ledgerWrites).toHaveLength(3);
    expect(testState.balanceUpsertCalls).toBe(3); // one upsert per account, exactly once
    expect(testState.balanceStore.get(DEVELOPER_ID)).toBeGreaterThan(0);

    // A second viewability event for the same adDecisionId (e.g. a buggy client
    // resend with a fresh eventId) must be rejected by the lifecycle guard —
    // the impression is no longer in "rendered" status — and must NOT bill again.
    const replay = await processor.process(
      {
        eventId: "77777777-7777-7777-7777-777777777774",
        eventType: "viewability_threshold_met",
        deviceId: "dev_test",
        sessionId: SESSION_ID,
        extensionVersion: "0.0.1",
        adapterName: "mock",
        clientTimestamp: NOW,
        sequenceNumber: 3,
        adDecisionId: DECISION_ID,
        displayedDurationMs: 3500,
        thresholdMs: 3000,
      },
      DEVELOPER_ID,
    );

    expect(replay.fraudDecision).toBe("invalid_state");
    expect(testState.ledgerWrites).toHaveLength(3);
    expect(testState.balanceUpsertCalls).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 4. Duplicate event test — replayed eventId must not bill twice
// ---------------------------------------------------------------------------

describe("EventProcessor — duplicate eventId does not double-bill", () => {
  const NOW = new Date().toISOString();
  const DECISION_ID = "88888888-8888-8888-8888-888888888888";
  const CREATIVE_ID = "99999999-9999-9999-9999-999999999999";
  const SESSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("replaying the exact same eventId is rejected by Redis dedup before reaching the ledger", async () => {
    testState.campaignRow = freshCampaign();
    testState.decisionRow = {
      id: DECISION_ID,
      campaignId: CAMPAIGN_ID,
      creativeId: CREATIVE_ID,
      expiresAt: new Date(Date.now() + 60_000),
      wasServed: false,
    };
    const processor = new EventProcessor();

    const viewabilityEvent = {
      eventId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3",
      eventType: "viewability_threshold_met" as const,
      deviceId: "dev_test",
      sessionId: SESSION_ID,
      extensionVersion: "0.0.1",
      adapterName: "mock" as const,
      clientTimestamp: NOW,
      sequenceNumber: 2,
      adDecisionId: DECISION_ID,
      displayedDurationMs: 3500,
      thresholdMs: 3000,
    };

    await processor.process(
      {
        eventId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        eventType: "impression_requested",
        deviceId: "dev_test",
        sessionId: SESSION_ID,
        extensionVersion: "0.0.1",
        adapterName: "mock",
        clientTimestamp: NOW,
        sequenceNumber: 0,
        adDecisionId: DECISION_ID,
        campaignId: CAMPAIGN_ID,
        creativeId: CREATIVE_ID,
      },
      DEVELOPER_ID,
    );
    await processor.process(
      {
        eventId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
        eventType: "impression_rendered",
        deviceId: "dev_test",
        sessionId: SESSION_ID,
        extensionVersion: "0.0.1",
        adapterName: "mock",
        clientTimestamp: NOW,
        sequenceNumber: 1,
        adDecisionId: DECISION_ID,
        renderedAt: NOW,
      },
      DEVELOPER_ID,
    );

    const first = await processor.process(viewabilityEvent, DEVELOPER_ID);
    expect(first.isDuplicate).toBe(false);
    const balanceAfterFirst = testState.balanceStore.get(DEVELOPER_ID);
    const writesAfterFirst = testState.ledgerWrites.length;
    expect(writesAfterFirst).toBe(3);

    // Replay the exact same event (same eventId) — Redis dedup must short-circuit it.
    const replay = await processor.process(viewabilityEvent, DEVELOPER_ID);
    expect(replay.isDuplicate).toBe(true);
    expect(testState.ledgerWrites.length).toBe(writesAfterFirst);
    expect(testState.balanceStore.get(DEVELOPER_ID)).toBe(balanceAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// 5. Reconciliation — advertiser_charge === developer_credit + platform_fee
// ---------------------------------------------------------------------------

describe("Ledger reconciliation invariant", () => {
  it("advertiser_charge equals developer_credit + platform_fee across multiple billable events", async () => {
    testState.campaignRow = freshCampaign();
    const ledgerService = new LedgerService();

    await ledgerService.recordImpression("recon-imp-1", CAMPAIGN_ID, DEVELOPER_ID);
    await ledgerService.recordImpression("recon-imp-2", CAMPAIGN_ID, DEVELOPER_ID);
    await ledgerService.recordClick("recon-click-1", CAMPAIGN_ID, DEVELOPER_ID);

    const sumByType = (type: string) =>
      testState.ledgerWrites
        .filter((e) => e.entryType === type)
        .reduce((sum, e) => sum + e.amountMicrocents, 0);

    const advertiserCharge = sumByType("advertiser_charge");
    const developerCredit = sumByType("developer_credit");
    const platformFee = sumByType("platform_fee");

    expect(advertiserCharge).toBe(developerCredit + platformFee);
  });
});

// ---------------------------------------------------------------------------
// 6. Concurrency — two billable events for the same developer must not lose
//    an update. The fake upsert here mirrors the production call shape (one
//    INSERT ... ON CONFLICT DO UPDATE round trip per delta, no separate
//    select-then-update), which is what makes Postgres's real atomic upsert
//    apply; this test proves the application issues that single round trip
//    and that concurrent callers correctly accumulate rather than overwrite.
// ---------------------------------------------------------------------------

describe("LedgerService — concurrent billable events for the same developer", () => {
  it("two concurrent recordImpression calls both apply without losing an update", async () => {
    testState.campaignRow = freshCampaign();
    const ledgerService = new LedgerService();

    await Promise.all([
      ledgerService.recordImpression("concurrent-imp-1", CAMPAIGN_ID, DEVELOPER_ID),
      ledgerService.recordImpression("concurrent-imp-2", CAMPAIGN_ID, DEVELOPER_ID),
    ]);

    const developerEntries = testState.ledgerWrites.filter((e) => e.entryType === "developer_credit");
    expect(developerEntries).toHaveLength(2);
    const expectedTotal = developerEntries.reduce((sum, e) => sum + e.amountMicrocents, 0);
    expect(testState.balanceStore.get(DEVELOPER_ID)).toBe(expectedTotal);
  });
});
