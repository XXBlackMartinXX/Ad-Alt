import { describe, it, expect } from "vitest";
import { DebugPanelState } from "../content/debug-panel.js";

const FORBIDDEN_FIELD_NAMES = [
  "pageUrl",
  "pageTitle",
  "domText",
  "pageContent",
  "cookies",
  "authToken",
  "sessionCookie",
  "screenshotData",
  "clipboardContent",
  "sourceCode",
  "fileContent",
  "promptText",
  "aiResponse",
  "chatHistory",
];

describe("DebugPanelState — defaults", () => {
  it("adapter is inactive by default", () => {
    const panel = new DebugPanelState();
    expect(panel.getState().adapterActive).toBe(false);
  });

  it("wait-state is false by default", () => {
    const panel = new DebugPanelState();
    expect(panel.getState().waitStateDetected).toBe(false);
  });

  it("sponsored moment is not rendered by default", () => {
    const panel = new DebugPanelState();
    expect(panel.getState().sponsoredMomentRendered).toBe(false);
  });

  it("lastEventType is null by default (debug mode off)", () => {
    const panel = new DebugPanelState();
    expect(panel.getState().lastEventType).toBeNull();
  });

  it("kill-switch is off by default", () => {
    const panel = new DebugPanelState();
    expect(panel.getState().killSwitchEnabled).toBe(false);
  });

  it("api is not configured by default", () => {
    const panel = new DebugPanelState();
    expect(panel.getState().apiConfigured).toBe(false);
  });
});

describe("DebugPanelState — state updates", () => {
  it("update() activates adapter", () => {
    const panel = new DebugPanelState();
    panel.update({ adapterActive: true });
    expect(panel.getState().adapterActive).toBe(true);
  });

  it("update() sets wait-state detected", () => {
    const panel = new DebugPanelState();
    panel.update({ waitStateDetected: true });
    expect(panel.getState().waitStateDetected).toBe(true);
  });

  it("update() marks banner rendered", () => {
    const panel = new DebugPanelState();
    panel.update({ sponsoredMomentRendered: true });
    expect(panel.getState().sponsoredMomentRendered).toBe(true);
  });

  it("update() records last event type", () => {
    const panel = new DebugPanelState();
    panel.update({ lastEventType: "impression_rendered" });
    expect(panel.getState().lastEventType).toBe("impression_rendered");
  });

  it("update() sets kill-switch active", () => {
    const panel = new DebugPanelState();
    panel.update({ killSwitchEnabled: true });
    expect(panel.getState().killSwitchEnabled).toBe(true);
  });

  it("update() marks API configured", () => {
    const panel = new DebugPanelState();
    panel.update({ apiConfigured: true });
    expect(panel.getState().apiConfigured).toBe(true);
  });

  it("partial update leaves other fields unchanged", () => {
    const panel = new DebugPanelState();
    panel.update({ adapterActive: true, killSwitchEnabled: false });
    panel.update({ waitStateDetected: true });
    const s = panel.getState();
    expect(s.adapterActive).toBe(true);       // unchanged from first update
    expect(s.killSwitchEnabled).toBe(false);  // unchanged from first update
    expect(s.waitStateDetected).toBe(true);   // set in second update
  });
});

describe("DebugPanelState — privacy safety", () => {
  it("getState() returns a copy, not the internal reference", () => {
    const panel = new DebugPanelState();
    const s1 = panel.getState();
    s1.adapterActive = true; // mutate the copy
    expect(panel.getState().adapterActive).toBe(false); // internal state unchanged
  });

  it("state keys contain no forbidden field names", () => {
    const panel = new DebugPanelState();
    const stateKeys = Object.keys(panel.getState());
    for (const forbidden of FORBIDDEN_FIELD_NAMES) {
      expect(stateKeys).not.toContain(forbidden);
    }
  });

  it("lastEventType value reflects event type name only, not page content", () => {
    const panel = new DebugPanelState();
    const ALLOWED_TYPES = [
      "impression_requested",
      "impression_rendered",
      "viewability_threshold_met",
      "click",
      null,
    ];
    panel.update({ lastEventType: "impression_rendered" });
    expect(ALLOWED_TYPES).toContain(panel.getState().lastEventType);
  });

  it("DebugPanelState constructor exposes no forbidden fields", () => {
    const panel = new DebugPanelState();
    for (const field of FORBIDDEN_FIELD_NAMES) {
      expect((panel as unknown as Record<string, unknown>)[field]).toBeUndefined();
    }
  });
});
