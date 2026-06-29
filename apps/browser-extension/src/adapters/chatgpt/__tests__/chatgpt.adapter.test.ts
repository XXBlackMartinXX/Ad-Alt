import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatGPTAdapter } from "../chatgpt.adapter.js";
import type { ChatGPTAdapterDeps } from "../chatgpt.adapter.js";
import type { IChatGPTWaitStateDetector } from "../chatgpt.wait-state.js";
import type { IChatGPTRenderer } from "../chatgpt.renderer.js";
import type { SponsoredMoment } from "@ad-alt/platform-core";

function makeMockDetector(): IChatGPTWaitStateDetector & {
  simulateStart: () => void;
  simulateEnd: () => void;
} {
  let startCb: ((d: Date) => void) | null = null;
  let endCb: (() => void) | null = null;
  return {
    start: vi.fn((onStart, onEnd) => {
      startCb = onStart;
      endCb = onEnd;
    }),
    stop: vi.fn(),
    simulateStart: () => startCb?.(new Date()),
    simulateEnd: () => endCb?.(),
  };
}

function makeMockRenderer(): IChatGPTRenderer & { _hasElement: boolean } {
  let hasElement = false;
  return {
    render: vi.fn(() => { hasElement = true; }),
    remove: vi.fn(() => { hasElement = false; }),
    getElement: vi.fn(() => (hasElement ? ({} as Element) : null)),
    get _hasElement() { return hasElement; },
  };
}

const MOMENT: SponsoredMoment = {
  adDecisionId: "550e8400-e29b-41d4-a716-446655440000",
  creativeId: "550e8400-e29b-41d4-a716-446655440001",
  headline: "Test headline",
  displayUrl: "example.com",
  expiresAt: Date.now() + 60_000,
};

function makeAdapter(hostnameOverride = "chatgpt.com", extra?: Partial<ChatGPTAdapterDeps>) {
  const detector = makeMockDetector();
  const renderer = makeMockRenderer();
  const adapter = new ChatGPTAdapter({
    detector,
    renderer,
    getHostname: () => hostnameOverride,
    ...extra,
  });
  return { adapter, detector, renderer };
}

describe("ChatGPTAdapter — identity", () => {
  it("has the correct adapter id", () => {
    const { adapter } = makeAdapter();
    expect(adapter.adapterId).toBe("browser_chatgpt");
  });

  it("has the correct platform category", () => {
    const { adapter } = makeAdapter();
    expect(adapter.platformCategory).toBe("browser");
  });

  it("advertises viewability and click tracking", () => {
    const { adapter } = makeAdapter();
    expect(adapter.capabilities.supportsViewabilityTracking).toBe(true);
    expect(adapter.capabilities.supportsClickTracking).toBe(true);
  });
});

describe("ChatGPTAdapter — canActivate", () => {
  it("resolves true on chatgpt.com", async () => {
    const { adapter } = makeAdapter("chatgpt.com");
    expect(await adapter.canActivate()).toBe(true);
  });

  it("resolves true on chat.openai.com", async () => {
    const { adapter } = makeAdapter("chat.openai.com");
    expect(await adapter.canActivate()).toBe(true);
  });

  it("resolves false on gemini.google.com", async () => {
    const { adapter } = makeAdapter("gemini.google.com");
    expect(await adapter.canActivate()).toBe(false);
  });

  it("resolves false on claude.ai", async () => {
    const { adapter } = makeAdapter("claude.ai");
    expect(await adapter.canActivate()).toBe(false);
  });

  it("resolves false on empty hostname", async () => {
    const { adapter } = makeAdapter("");
    expect(await adapter.canActivate()).toBe(false);
  });
});

describe("ChatGPTAdapter — wait-state handlers", () => {
  let adapter: ChatGPTAdapter;
  let detector: ReturnType<typeof makeMockDetector>;

  beforeEach(() => {
    ({ adapter, detector } = makeAdapter());
  });

  it("fires onWaitStateStart handler when detector fires", async () => {
    const handler = vi.fn();
    await adapter.start();
    adapter.onWaitStateStart(handler);
    detector.simulateStart();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ adapterId: "browser_chatgpt" });
  });

  it("wait-state start event contains a Date startedAt", async () => {
    const handler = vi.fn();
    await adapter.start();
    adapter.onWaitStateStart(handler);
    detector.simulateStart();
    const event = handler.mock.calls[0]?.[0] as { startedAt: unknown };
    expect(event.startedAt).toBeInstanceOf(Date);
  });

  it("fires onWaitStateEnd handler when detector fires", async () => {
    const handler = vi.fn();
    await adapter.start();
    adapter.onWaitStateEnd(handler);
    detector.simulateEnd();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not fire handlers after stop", async () => {
    const handler = vi.fn();
    await adapter.start();
    adapter.onWaitStateStart(handler);
    await adapter.stop();
    detector.simulateStart();
    expect(handler).not.toHaveBeenCalled();
  });

  it("disposing a start listener removes only that listener", async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    await adapter.start();
    const d1 = adapter.onWaitStateStart(h1);
    adapter.onWaitStateStart(h2);
    d1.dispose();
    detector.simulateStart();
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("disposing an end listener removes only that listener", async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    await adapter.start();
    const d1 = adapter.onWaitStateEnd(h1);
    adapter.onWaitStateEnd(h2);
    d1.dispose();
    detector.simulateEnd();
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("second start() call after start is a no-op", async () => {
    await adapter.start();
    await adapter.start();
    expect((detector.start as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe("ChatGPTAdapter — health", () => {
  it("getHealth returns inactive before start", () => {
    const { adapter } = makeAdapter();
    const h = adapter.getHealth();
    expect(h.status).toBe("inactive");
    expect(h.lastCheckedAt).toBeInstanceOf(Date);
  });

  it("getHealth returns healthy after start", async () => {
    const { adapter } = makeAdapter();
    await adapter.start();
    expect(adapter.getHealth().status).toBe("healthy");
  });

  it("getHealth returns inactive after stop", async () => {
    const { adapter } = makeAdapter();
    await adapter.start();
    await adapter.stop();
    expect(adapter.getHealth().status).toBe("inactive");
  });
});

describe("ChatGPTAdapter — rendering", () => {
  let adapter: ChatGPTAdapter;
  let renderer: ReturnType<typeof makeMockRenderer>;

  beforeEach(() => {
    ({ adapter, renderer } = makeAdapter());
  });

  it("renderSponsoredMoment calls renderer when active", async () => {
    await adapter.start();
    await adapter.renderSponsoredMoment(MOMENT);
    expect(renderer.render).toHaveBeenCalledWith(MOMENT);
  });

  it("renderSponsoredMoment is a no-op when adapter is not active", async () => {
    await adapter.renderSponsoredMoment(MOMENT);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("removeSponsoredMoment calls renderer.remove", async () => {
    await adapter.start();
    await adapter.renderSponsoredMoment(MOMENT);
    await adapter.removeSponsoredMoment();
    expect(renderer.remove).toHaveBeenCalled();
  });

  it("stop calls renderer.remove", async () => {
    await adapter.start();
    await adapter.renderSponsoredMoment(MOMENT);
    await adapter.stop();
    expect(renderer.remove).toHaveBeenCalled();
  });
});

describe("ChatGPTAdapter — viewability", () => {
  it("verifyViewability returns no_element when nothing rendered", () => {
    const { adapter } = makeAdapter();
    const result = adapter.verifyViewability();
    expect(result.isViewable).toBe(false);
    expect(result.notViewableReason).toBe("no_element");
  });

  it("verifyViewability returns isViewable true after rendering", async () => {
    const { adapter } = makeAdapter();
    await adapter.start();
    await adapter.renderSponsoredMoment(MOMENT);
    const result = adapter.verifyViewability();
    expect(result.isViewable).toBe(true);
  });

  it("verifyViewability returns no_element after remove", async () => {
    const { adapter } = makeAdapter();
    await adapter.start();
    await adapter.renderSponsoredMoment(MOMENT);
    await adapter.removeSponsoredMoment();
    expect(adapter.verifyViewability().isViewable).toBe(false);
  });
});
