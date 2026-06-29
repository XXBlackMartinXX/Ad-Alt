import { describe, it, expect } from "vitest";
import {
  TELEMETRY_FORBIDDEN_FIELDS,
  findForbiddenFields,
  isPrivacySafe,
} from "../privacy-guard.js";

describe("TELEMETRY_FORBIDDEN_FIELDS", () => {
  it("includes original VS Code forbidden fields", () => {
    const required = [
      "sourceCode", "fileContent", "filePath", "fileName",
      "projectPath", "promptText", "aiResponse", "chatHistory",
      "terminalContent", "projectStructure", "workspacePath",
      "gitRemote", "envVariables", "apiKey", "secret", "password", "token",
    ];
    for (const field of required) {
      expect(TELEMETRY_FORBIDDEN_FIELDS).toContain(field as never);
    }
  });

  it("includes browser-specific forbidden fields", () => {
    const browserFields = ["pageTitle", "pageUrl", "pageContent", "domText",
      "clipboardContent", "screenshotData", "cookieData", "authToken", "sessionCookie"];
    for (const field of browserFields) {
      expect(TELEMETRY_FORBIDDEN_FIELDS).toContain(field as never);
    }
  });
});

describe("findForbiddenFields", () => {
  it("returns empty array for a safe event", () => {
    const safeEvent = {
      eventId: "abc-123",
      eventType: "impression_requested",
      deviceId: "dev_abc",
      adapterName: "browser_chatgpt",
    };
    expect(findForbiddenFields(safeEvent)).toEqual([]);
  });

  it("detects promptText in the event", () => {
    const leakyEvent = {
      eventId: "abc-123",
      eventType: "impression_requested",
      promptText: "write a function that...",
    };
    const found = findForbiddenFields(leakyEvent);
    expect(found).toContain("promptText");
  });

  it("detects multiple forbidden fields", () => {
    const leakyEvent = {
      eventId: "abc",
      fileContent: "some code",
      aiResponse: "here is the answer",
      pageUrl: "https://chat.openai.com/c/abc123",
    };
    const found = findForbiddenFields(leakyEvent);
    expect(found).toContain("fileContent");
    expect(found).toContain("aiResponse");
    expect(found).toContain("pageUrl");
    expect(found.length).toBe(3);
  });
});

describe("isPrivacySafe", () => {
  it("returns true for a clean event", () => {
    expect(isPrivacySafe({ eventType: "click", deviceId: "dev_abc" })).toBe(true);
  });

  it("returns false if any forbidden field is present", () => {
    expect(isPrivacySafe({ sourceCode: "const x = 1" })).toBe(false);
    expect(isPrivacySafe({ domText: "Ask me anything" })).toBe(false);
  });
});
