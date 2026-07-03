import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AiStatusBarAdapter } from "../ai-status-bar.adapter";
import {
  resetVscodeMock,
  fireDidChangeTextDocument,
  fireDidChangeTextEditorSelection,
  fireDidChangeActiveTerminal,
} from "../../__tests__/test-utils/vscode-mock";
import type * as vscode from "vscode";

// A minimal fake ExtensionContext -- activate() only reads it via `void
// context`, so an empty object cast is sufficient and honest (nothing real
// is needed from it for this adapter).
const FAKE_CONTEXT = {} as vscode.ExtensionContext;

describe("AiStatusBarAdapter", () => {
  beforeEach(() => {
    resetVscodeMock();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("has the expected adapter name", () => {
    const adapter = new AiStatusBarAdapter();
    expect(adapter.name).toBe("ai_status_bar");
  });

  it("does not declare a wait-state immediately on activation", () => {
    const adapter = new AiStatusBarAdapter();
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    expect(onStart).not.toHaveBeenCalled();
    adapter.deactivate();
  });

  it("declares a wait-state after 3s of no activity (idle threshold)", () => {
    const adapter = new AiStatusBarAdapter();
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(2999);
    expect(onStart).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onStart).toHaveBeenCalledOnce();

    adapter.deactivate();
  });

  it("wait-state event contains only startedAt and adapterName -- no editor/selection/terminal data", () => {
    const adapter = new AiStatusBarAdapter();
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(3000);

    expect(onStart).toHaveBeenCalledOnce();
    const event = onStart.mock.calls[0]?.[0];
    expect(Object.keys(event).sort()).toEqual(["adapterName", "startedAt"]);
    expect(event.adapterName).toBe("ai_status_bar");
    expect(event.startedAt).toBeInstanceOf(Date);

    adapter.deactivate();
  });

  it("a text-document activity event resets the idle timer and does not trigger a wait-state", () => {
    const adapter = new AiStatusBarAdapter();
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(2000);
    fireDidChangeTextDocument();
    vi.advanceTimersByTime(2000); // total 4000ms since activation, but only 2000ms since last activity

    expect(onStart).not.toHaveBeenCalled();
    adapter.deactivate();
  });

  it("a text-editor-selection activity event also resets the idle timer", () => {
    const adapter = new AiStatusBarAdapter();
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(2000);
    fireDidChangeTextEditorSelection();
    vi.advanceTimersByTime(2000);

    expect(onStart).not.toHaveBeenCalled();
    adapter.deactivate();
  });

  it("an active-terminal change also resets the idle timer", () => {
    const adapter = new AiStatusBarAdapter();
    const onStart = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(2000);
    fireDidChangeActiveTerminal();
    vi.advanceTimersByTime(2000);

    expect(onStart).not.toHaveBeenCalled();
    adapter.deactivate();
  });

  it("activity during an active wait-state ends it immediately", () => {
    const adapter = new AiStatusBarAdapter();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.onWaitStateEnd(onEnd);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(3000);
    expect(onStart).toHaveBeenCalledOnce();

    fireDidChangeTextDocument();
    expect(onEnd).toHaveBeenCalledOnce();

    adapter.deactivate();
  });

  it("a wait-state auto-ends after the 60s maximum duration with no activity", () => {
    const adapter = new AiStatusBarAdapter();
    const onEnd = vi.fn();
    adapter.onWaitStateEnd(onEnd);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(3000); // wait-state starts
    expect(onEnd).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000); // MAX_WAIT_STATE_MS elapses
    expect(onEnd).toHaveBeenCalledOnce();

    adapter.deactivate();
  });

  it("deactivate() ends an in-progress wait-state and stops future detection", () => {
    const adapter = new AiStatusBarAdapter();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    adapter.onWaitStateStart(onStart);
    adapter.onWaitStateEnd(onEnd);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(3000);
    expect(onStart).toHaveBeenCalledOnce();

    adapter.deactivate();
    expect(onEnd).toHaveBeenCalledOnce();

    // No further timers should fire after deactivation.
    vi.advanceTimersByTime(120_000);
    expect(onStart).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("dispose() is equivalent to deactivate()", () => {
    const adapter = new AiStatusBarAdapter();
    const onEnd = vi.fn();
    adapter.onWaitStateEnd(onEnd);
    adapter.activate(FAKE_CONTEXT);

    vi.advanceTimersByTime(3000);
    adapter.dispose();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("disposing a start-listener subscription removes only that listener", () => {
    const adapter = new AiStatusBarAdapter();
    const h1 = vi.fn();
    const h2 = vi.fn();
    const d1 = adapter.onWaitStateStart(h1);
    adapter.onWaitStateStart(h2);
    adapter.activate(FAKE_CONTEXT);

    d1.dispose();
    vi.advanceTimersByTime(3000);

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();

    adapter.deactivate();
  });
});
