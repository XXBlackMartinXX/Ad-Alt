import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAdapter } from "../mock.adapter";
import type * as vscode from "vscode";

const FAKE_CONTEXT = {} as vscode.ExtensionContext;

describe("MockAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("has the expected adapter name", () => {
    const adapter = new MockAdapter();
    expect(adapter.name).toBe("mock");
  });

  it("fires a synthetic wait-state on each cycle", () => {
    const adapter = new MockAdapter(1000);
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(1000);
    expect(onStart).toHaveBeenCalledOnce();

    adapter.deactivate();
  });

  it("the synthetic wait-state event contains only startedAt and adapterName", () => {
    const adapter = new MockAdapter(1000);
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(1000);
    const event = onStart.mock.calls[0]?.[0];
    expect(Object.keys(event).sort()).toEqual(["adapterName", "startedAt"]);
    expect(event.adapterName).toBe("mock");
    expect(event.startedAt).toBeInstanceOf(Date);

    adapter.deactivate();
  });

  it("ends the synthetic wait-state 8 seconds after it starts", () => {
    const adapter = new MockAdapter(1000);
    const onEnd = vi.fn();
    adapter.onWaitStateEnd(onEnd);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(1000); // start
    expect(onEnd).not.toHaveBeenCalled();

    vi.advanceTimersByTime(8000); // end
    expect(onEnd).toHaveBeenCalledOnce();

    adapter.deactivate();
  });

  it("repeats the cycle indefinitely while active", () => {
    const adapter = new MockAdapter(1000);
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(onStart).toHaveBeenCalledTimes(3);

    adapter.deactivate();
  });

  it("deactivate() stops future cycles", () => {
    const adapter = new MockAdapter(1000);
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(1000);
    expect(onStart).toHaveBeenCalledOnce();

    adapter.deactivate();
    vi.advanceTimersByTime(5000);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("dispose() is equivalent to deactivate()", () => {
    const adapter = new MockAdapter(1000);
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);
    adapter.dispose();

    vi.advanceTimersByTime(5000);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("disposing an end-listener subscription removes only that listener", () => {
    const adapter = new MockAdapter(1000);
    const h1 = vi.fn();
    const h2 = vi.fn();
    const d1 = adapter.onWaitStateEnd(h1);
    adapter.onWaitStateEnd(h2);
    adapter.activate(FAKE_CONTEXT);

    d1.dispose();
    vi.advanceTimersByTime(9000); // start + 8s end

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();

    adapter.deactivate();
  });
});
