import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserMockAdapter } from "../adapters/browser-mock.adapter.js";

describe("BrowserMockAdapter", () => {
  let adapter: BrowserMockAdapter;

  beforeEach(() => {
    adapter = new BrowserMockAdapter();
  });

  it("has the correct adapter id", () => {
    expect(adapter.adapterId).toBe("browser_mock");
  });

  it("has the correct platform category", () => {
    expect(adapter.platformCategory).toBe("browser");
  });

  it("canActivate resolves to true", async () => {
    expect(await adapter.canActivate()).toBe(true);
  });

  it("advertises correct capabilities", () => {
    expect(adapter.capabilities.supportsViewabilityTracking).toBe(true);
    expect(adapter.capabilities.supportsClickTracking).toBe(true);
  });

  it("fires onWaitStateStart handler when simulated", async () => {
    const handler = vi.fn();
    await adapter.start();
    adapter.onWaitStateStart(handler);
    adapter.simulateWaitStateStart();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ adapterId: "browser_mock" });
  });

  it("fires onWaitStateEnd handler when simulated", async () => {
    const handler = vi.fn();
    await adapter.start();
    adapter.onWaitStateEnd(handler);
    adapter.simulateWaitStateEnd();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not fire handlers after stop", async () => {
    const handler = vi.fn();
    await adapter.start();
    adapter.onWaitStateStart(handler);
    await adapter.stop();
    adapter.simulateWaitStateStart();
    expect(handler).not.toHaveBeenCalled();
  });

  it("disposing a listener removes only that listener", async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    await adapter.start();
    const d1 = adapter.onWaitStateStart(h1);
    adapter.onWaitStateStart(h2);
    d1.dispose();
    adapter.simulateWaitStateStart();
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("getHealth returns healthy", () => {
    const health = adapter.getHealth();
    expect(health.status).toBe("healthy");
    expect(health.lastCheckedAt).toBeInstanceOf(Date);
  });

  it("verifyViewability returns isViewable true", () => {
    const result = adapter.verifyViewability();
    expect(result.isViewable).toBe(true);
    expect(result.visibleDurationMs).toBeGreaterThan(0);
  });
});
