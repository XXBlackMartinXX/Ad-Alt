import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdStatusBar } from "../status-bar";
import { resetVscodeMock, getCreatedStatusBarItems } from "./test-utils/vscode-mock";

const AD_INFO = {
  headline: "Test headline",
  displayUrl: "example.com",
  adDecisionId: "decision-1",
  creativeId: "creative-1",
};

function firstStatusBarItem() {
  const item = getCreatedStatusBarItems()[0];
  if (!item) throw new Error("expected a status bar item to have been created");
  return item;
}

describe("AdStatusBar", () => {
  beforeEach(() => {
    resetVscodeMock();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates exactly one underlying VS Code status bar item", () => {
    new AdStatusBar();
    expect(getCreatedStatusBarItems()).toHaveLength(1);
  });

  it("showAd renders only the fields provided in AdInfo -- nothing else", () => {
    const bar = new AdStatusBar();
    bar.showAd(AD_INFO);

    const item = firstStatusBarItem();
    expect(item.visible).toBe(true);
    expect(item.text).toContain(AD_INFO.headline);
    expect(item.text).toContain(AD_INFO.displayUrl);
    expect(item.text).not.toContain(AD_INFO.adDecisionId);
    expect(item.text).not.toContain(AD_INFO.creativeId);
  });

  it("showAd wires the click command with only the decision/creative IDs as arguments", () => {
    const bar = new AdStatusBar();
    bar.showAd(AD_INFO);

    const item = firstStatusBarItem();
    const command = item.command as { command: string; arguments: unknown[] };
    expect(command.command).toBe("promptprofit._handleAdClick");
    expect(command.arguments).toEqual([AD_INFO.adDecisionId, AD_INFO.creativeId]);
  });

  it("showSignedOut renders a sign-in prompt, not ad content", () => {
    const bar = new AdStatusBar();
    bar.showSignedOut();

    const item = firstStatusBarItem();
    expect(item.visible).toBe(true);
    expect(item.text).toContain("Sign in");
    expect(item.command).toBe("promptprofit.signIn");
  });

  it("showEarning renders the given amount text and auto-hides after 3 seconds", () => {
    const bar = new AdStatusBar();
    bar.showEarning("$0.01");

    const item = firstStatusBarItem();
    expect(item.visible).toBe(true);
    expect(item.text).toContain("$0.01");

    vi.advanceTimersByTime(2999);
    expect(item.visible).toBe(true);

    vi.advanceTimersByTime(1);
    expect(item.visible).toBe(false);
  });

  it("hide() hides the item and clears its text", () => {
    const bar = new AdStatusBar();
    bar.showAd(AD_INFO);
    bar.hide();

    const item = firstStatusBarItem();
    expect(item.visible).toBe(false);
    expect(item.text).toBe("");
  });

  it("dispose() disposes the underlying status bar item", () => {
    const bar = new AdStatusBar();
    bar.showAd(AD_INFO);
    bar.dispose();

    const item = firstStatusBarItem();
    expect(item.visible).toBe(false);
  });
});
