import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PromptProfitController } from "../controller";
import {
  resetVscodeMock,
  setConfig,
  getCreatedStatusBarItems,
  setShowInformationMessageImpl,
} from "./test-utils/vscode-mock";
import type * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Fake ExtensionContext -- in-memory secrets/globalState, nothing real.
// ---------------------------------------------------------------------------

function createFakeContext() {
  const secrets = new Map<string, string>();
  const globalState = new Map<string, unknown>();

  const context = {
    subscriptions: { push: (..._items: unknown[]) => {} },
    secrets: {
      get: async (key: string) => secrets.get(key),
      store: async (key: string, value: string) => {
        secrets.set(key, value);
      },
      delete: async (key: string) => {
        secrets.delete(key);
      },
    },
    globalState: {
      get: (key: string) => globalState.get(key),
      update: async (key: string, value: unknown) => {
        globalState.set(key, value);
      },
    },
  };

  return { context: context as unknown as vscode.ExtensionContext, secrets, globalState };
}

// ---------------------------------------------------------------------------
// Fetch mock -- switches behavior by URL so ApiClient's real code runs
// end-to-end against controllable responses. Never any real network call.
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const FLAGS_ENABLED = { killSwitchEnabled: false, disabledAdapters: [] as string[], flags: {} };
const FLAGS_KILL_SWITCHED = { killSwitchEnabled: true, disabledAdapters: [] as string[], flags: {} };

const AD_DECISION = {
  adDecisionId: "decision-1",
  campaignId: "campaign-1",
  creativeId: "creative-1",
  headline: "Test headline",
  body: null,
  displayUrl: "example.com",
  cpmBidMicrocents: "100",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

function makeFetchMock(opts: { flags: typeof FLAGS_ENABLED; adDecision?: typeof AD_DECISION | null }) {
  const eventPayloads: unknown[] = [];
  const fn = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.includes("/v1/flags")) return jsonResponse(200, { data: opts.flags });
    if (url.includes("/v1/ads/decision")) {
      const decision = opts.adDecision ?? null;
      return decision === null ? jsonResponse(204, {}) : jsonResponse(200, { data: decision });
    }
    if (url.includes("/v1/events")) {
      eventPayloads.push(JSON.parse(String(options?.body)));
      return jsonResponse(200, {});
    }
    return jsonResponse(404, {});
  });
  return { fn, eventPayloads };
}

describe("PromptProfitController", () => {
  beforeEach(() => {
    resetVscodeMock();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not start the adapter when the kill switch is enabled", async () => {
    const { fn } = makeFetchMock({ flags: FLAGS_KILL_SWITCHED });
    vi.stubGlobal("fetch", fn);

    const { context, secrets } = createFakeContext();
    secrets.set("promptprofit.apiKey", "test-key");
    setConfig("enabled", true);
    setConfig("adapter", "mock");

    const controller = new PromptProfitController(context);
    await controller.initialize();

    // Advance well past a mock-adapter cycle -- if the adapter had started,
    // a status bar item would have become visible with ad content by now.
    await vi.advanceTimersByTimeAsync(20_000);

    const items = getCreatedStatusBarItems();
    expect(items.every((i) => !i.visible || !String(i.text).includes("Test headline"))).toBe(true);

    controller.dispose();
  });

  it("does not start the adapter when disabled in configuration", async () => {
    const { fn } = makeFetchMock({ flags: FLAGS_ENABLED, adDecision: AD_DECISION });
    vi.stubGlobal("fetch", fn);

    const { context, secrets } = createFakeContext();
    secrets.set("promptprofit.apiKey", "test-key");
    setConfig("enabled", false);
    setConfig("adapter", "mock");

    const controller = new PromptProfitController(context);
    await controller.initialize();

    await vi.advanceTimersByTimeAsync(20_000);

    const items = getCreatedStatusBarItems();
    expect(items.every((i) => !i.visible || !String(i.text).includes("Test headline"))).toBe(true);

    controller.dispose();
  });

  it("does not start the adapter when no API key is configured", async () => {
    const { fn } = makeFetchMock({ flags: FLAGS_ENABLED, adDecision: AD_DECISION });
    vi.stubGlobal("fetch", fn);

    const { context } = createFakeContext(); // no api key stored
    setConfig("enabled", true);
    setConfig("adapter", "mock");

    const controller = new PromptProfitController(context);
    await controller.initialize();

    await vi.advanceTimersByTimeAsync(20_000);

    const items = getCreatedStatusBarItems();
    expect(items.every((i) => !i.visible || !String(i.text).includes("Test headline"))).toBe(true);

    controller.dispose();
  });

  it("starts the adapter and renders an ad when enabled, API-key present, and not kill-switched", async () => {
    const { fn } = makeFetchMock({ flags: FLAGS_ENABLED, adDecision: AD_DECISION });
    vi.stubGlobal("fetch", fn);

    const { context, secrets } = createFakeContext();
    secrets.set("promptprofit.apiKey", "test-key");
    setConfig("enabled", true);
    setConfig("adapter", "mock");

    const controller = new PromptProfitController(context);
    await controller.initialize();

    // MockAdapter's default cycle is 15s.
    await vi.advanceTimersByTimeAsync(15_000);
    // Allow the async onWaitStateStart handler chain (fetch calls) to settle.
    await vi.advanceTimersByTimeAsync(0);

    const items = getCreatedStatusBarItems();
    expect(items.some((i) => i.visible && String(i.text).includes("Test headline"))).toBe(true);

    controller.dispose();
  });

  it("enqueued events never contain forbidden fields and only use the documented allowed keys", async () => {
    const { fn, eventPayloads } = makeFetchMock({ flags: FLAGS_ENABLED, adDecision: AD_DECISION });
    vi.stubGlobal("fetch", fn);

    const { context, secrets } = createFakeContext();
    secrets.set("promptprofit.apiKey", "test-key");
    setConfig("enabled", true);
    setConfig("adapter", "mock");

    const controller = new PromptProfitController(context);
    await controller.initialize();

    await vi.advanceTimersByTimeAsync(15_000); // wait-state starts -> impression events enqueued
    await vi.advanceTimersByTimeAsync(600); // EventQueue's 500ms debounce

    expect(eventPayloads.length).toBeGreaterThan(0);

    const ALLOWED_KEYS = new Set([
      "eventId",
      "eventType",
      "deviceId",
      "sessionId",
      "extensionVersion",
      "adapterName",
      "clientTimestamp",
      "sequenceNumber",
      "adDecisionId",
      "campaignId",
      "creativeId",
      "renderedAt",
      "displayedDurationMs",
      "thresholdMs",
    ]);
    const FORBIDDEN_KEYS = [
      "sourceCode",
      "code",
      "fileContent",
      "filePath",
      "workspaceFolder",
      "prompt",
      "aiResponse",
      "documentText",
      "selectionText",
      "clipboardText",
      "terminalOutput",
    ];

    for (const payload of eventPayloads) {
      const keys = Object.keys(payload as Record<string, unknown>);
      for (const key of keys) {
        expect(ALLOWED_KEYS.has(key), `unexpected key "${key}" in enqueued event`).toBe(true);
      }
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(keys).not.toContain(forbidden);
      }
      expect((payload as Record<string, unknown>)["deviceId"]).toMatch(/^dev_/);
    }

    controller.dispose();
  });

  it("enable() shows a consent dialog and only starts the adapter if the user accepts", async () => {
    const { fn } = makeFetchMock({ flags: FLAGS_ENABLED, adDecision: AD_DECISION });
    vi.stubGlobal("fetch", fn);

    const { context, secrets } = createFakeContext();
    secrets.set("promptprofit.apiKey", "test-key");
    setConfig("enabled", false);
    setConfig("adapter", "mock");
    setShowInformationMessageImpl(async () => "Cancel");

    const controller = new PromptProfitController(context);
    await controller.initialize();
    await controller.enable();

    await vi.advanceTimersByTimeAsync(20_000);

    const items = getCreatedStatusBarItems();
    expect(items.every((i) => !i.visible || !String(i.text).includes("Test headline"))).toBe(true);

    controller.dispose();
  });

  it("enable() starts the adapter once the user accepts the consent dialog", async () => {
    const { fn } = makeFetchMock({ flags: FLAGS_ENABLED, adDecision: AD_DECISION });
    vi.stubGlobal("fetch", fn);

    const { context, secrets } = createFakeContext();
    secrets.set("promptprofit.apiKey", "test-key");
    setConfig("enabled", false);
    setConfig("adapter", "mock");
    setShowInformationMessageImpl(async () => "Enable PromptProfit");

    const controller = new PromptProfitController(context);
    await controller.initialize();
    await controller.enable();

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(0);

    const items = getCreatedStatusBarItems();
    expect(items.some((i) => i.visible && String(i.text).includes("Test headline"))).toBe(true);

    controller.dispose();
  });

  it("disable() stops the adapter and hides the status bar", async () => {
    const { fn } = makeFetchMock({ flags: FLAGS_ENABLED, adDecision: AD_DECISION });
    vi.stubGlobal("fetch", fn);

    const { context, secrets } = createFakeContext();
    secrets.set("promptprofit.apiKey", "test-key");
    setConfig("enabled", true);
    setConfig("adapter", "mock");

    const controller = new PromptProfitController(context);
    await controller.initialize();

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(0);

    let items = getCreatedStatusBarItems();
    expect(items.some((i) => i.visible)).toBe(true);

    await controller.disable();
    items = getCreatedStatusBarItems();
    expect(items.every((i) => !i.visible)).toBe(true);

    // No further ad should render even after another full mock-adapter cycle.
    await vi.advanceTimersByTimeAsync(20_000);
    items = getCreatedStatusBarItems();
    expect(items.every((i) => !i.visible)).toBe(true);

    controller.dispose();
  });
});
