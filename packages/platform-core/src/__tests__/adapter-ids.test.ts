import { describe, it, expect } from "vitest";
import {
  ALLOWED_ADAPTER_IDS,
  DISABLED_ADAPTER_ID,
  isAllowedAdapter,
  getPlatformCategory,
  VSCODE_ADAPTER_IDS,
  BROWSER_ADAPTER_IDS,
  DESKTOP_ADAPTER_IDS,
  DEV_ADAPTER_IDS,
} from "../adapter-ids.js";

describe("ALLOWED_ADAPTER_IDS", () => {
  it("contains all VS Code adapter IDs", () => {
    for (const id of VSCODE_ADAPTER_IDS) {
      expect(ALLOWED_ADAPTER_IDS).toContain(id);
    }
  });

  it("contains all browser adapter IDs", () => {
    for (const id of BROWSER_ADAPTER_IDS) {
      expect(ALLOWED_ADAPTER_IDS).toContain(id);
    }
  });

  it("contains all desktop adapter IDs", () => {
    for (const id of DESKTOP_ADAPTER_IDS) {
      expect(ALLOWED_ADAPTER_IDS).toContain(id);
    }
  });

  it("contains all dev adapter IDs", () => {
    for (const id of DEV_ADAPTER_IDS) {
      expect(ALLOWED_ADAPTER_IDS).toContain(id);
    }
  });

  it("does NOT contain the disabled sentinel", () => {
    expect(ALLOWED_ADAPTER_IDS).not.toContain(DISABLED_ADAPTER_ID);
  });
});

describe("isAllowedAdapter", () => {
  it("returns true for every value in ALLOWED_ADAPTER_IDS", () => {
    for (const id of ALLOWED_ADAPTER_IDS) {
      expect(isAllowedAdapter(id)).toBe(true);
    }
  });

  it("returns false for the disabled sentinel", () => {
    expect(isAllowedAdapter(DISABLED_ADAPTER_ID)).toBe(false);
  });

  it("returns false for completely unknown values", () => {
    expect(isAllowedAdapter("totally_unknown_platform")).toBe(false);
    expect(isAllowedAdapter("")).toBe(false);
  });
});

describe("getPlatformCategory", () => {
  it("categorises VS Code adapters as vscode", () => {
    for (const id of VSCODE_ADAPTER_IDS) {
      expect(getPlatformCategory(id)).toBe("vscode");
    }
  });

  it("categorises browser adapters as browser", () => {
    for (const id of BROWSER_ADAPTER_IDS) {
      expect(getPlatformCategory(id)).toBe("browser");
    }
  });

  it("categorises desktop adapters as desktop", () => {
    for (const id of DESKTOP_ADAPTER_IDS) {
      expect(getPlatformCategory(id)).toBe("desktop");
    }
  });

  it("categorises dev adapters as dev", () => {
    for (const id of DEV_ADAPTER_IDS) {
      expect(getPlatformCategory(id)).toBe("dev");
    }
  });

  it("returns unknown for the disabled sentinel and arbitrary strings", () => {
    expect(getPlatformCategory(DISABLED_ADAPTER_ID)).toBe("unknown");
    expect(getPlatformCategory("made_up_value")).toBe("unknown");
  });
});
