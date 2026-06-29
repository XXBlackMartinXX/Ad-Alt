import { describe, it, expect } from "vitest";
import { validateBrowserEvent } from "../content/privacy-guard.js";

describe("validateBrowserEvent — browser-specific forbidden fields", () => {
  it("returns null for a clean event", () => {
    expect(validateBrowserEvent({
      eventId: "abc123",
      adapterName: "browser_chatgpt",
      deviceId: "dev_abc",
    })).toBeNull();
  });

  it("rejects pageTitle", () => {
    expect(validateBrowserEvent({ pageTitle: "My Chat" })).toMatch(/pageTitle/);
  });

  it("rejects pageUrl", () => {
    expect(validateBrowserEvent({ pageUrl: "https://chatgpt.com/c/abc" })).toMatch(/pageUrl/);
  });

  it("rejects pageContent", () => {
    expect(validateBrowserEvent({ pageContent: "some text" })).toMatch(/pageContent/);
  });

  it("rejects domText", () => {
    expect(validateBrowserEvent({ domText: "Hello AI" })).toMatch(/domText/);
  });

  it("rejects authToken", () => {
    expect(validateBrowserEvent({ authToken: "bearer xyz" })).toMatch(/authToken/);
  });

  it("rejects sessionCookie", () => {
    expect(validateBrowserEvent({ sessionCookie: "sess=abc" })).toMatch(/sessionCookie/);
  });

  it("rejects clipboardContent", () => {
    expect(validateBrowserEvent({ clipboardContent: "copied text" })).toMatch(/clipboardContent/);
  });

  it("rejects screenshotData", () => {
    expect(validateBrowserEvent({ screenshotData: "data:image/png;base64,..." })).toMatch(/screenshotData/);
  });
});
