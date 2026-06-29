import { describe, it, expect } from "vitest";
import { detectPlatformFromHostname } from "../content/platform-detector.js";

describe("detectPlatformFromHostname", () => {
  it("identifies chatgpt.com as browser_chatgpt", () => {
    expect(detectPlatformFromHostname("chatgpt.com")).toEqual({
      adapterId: "browser_chatgpt",
      platformName: "ChatGPT",
    });
  });

  it("identifies chat.openai.com as browser_chatgpt", () => {
    expect(detectPlatformFromHostname("chat.openai.com")).toEqual({
      adapterId: "browser_chatgpt",
      platformName: "ChatGPT",
    });
  });

  it("identifies claude.ai as browser_claude", () => {
    expect(detectPlatformFromHostname("claude.ai")).toEqual({
      adapterId: "browser_claude",
      platformName: "Claude",
    });
  });

  it("identifies gemini.google.com as browser_gemini", () => {
    expect(detectPlatformFromHostname("gemini.google.com")).toEqual({
      adapterId: "browser_gemini",
      platformName: "Gemini",
    });
  });

  it("returns null for unknown hostname", () => {
    expect(detectPlatformFromHostname("unknown.example.com")).toBeNull();
  });

  it("returns null for empty hostname", () => {
    expect(detectPlatformFromHostname("")).toBeNull();
  });

  it("is case-sensitive — CHATGPT.COM is not a match", () => {
    expect(detectPlatformFromHostname("CHATGPT.COM")).toBeNull();
  });
});
