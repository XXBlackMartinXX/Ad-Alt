/**
 * Tests that verify the adapter ID constants in @ad-alt/shared are well-formed
 * and self-consistent. These run without any platform-core dependency so they
 * can execute from a clean install without pre-building any other package.
 */

import { describe, it, expect } from "vitest";
import {
  VSCODE_ADAPTER_IDS,
  BROWSER_ADAPTER_IDS,
  DESKTOP_ADAPTER_IDS,
  DEV_ADAPTER_IDS,
  ALLOWED_ADAPTER_IDS,
  DISABLED_ADAPTER_ID,
  ADAPTER_ENUM_VALUES,
  getPlatformCategory,
  isAllowedAdapter,
} from "../schemas/adapters.js";

describe("shared adapter constants — structure", () => {
  it("ALLOWED_ADAPTER_IDS contains every VSCODE adapter", () => {
    for (const id of VSCODE_ADAPTER_IDS) {
      expect(ALLOWED_ADAPTER_IDS).toContain(id);
    }
  });

  it("ALLOWED_ADAPTER_IDS contains every BROWSER adapter", () => {
    for (const id of BROWSER_ADAPTER_IDS) {
      expect(ALLOWED_ADAPTER_IDS).toContain(id);
    }
  });

  it("ALLOWED_ADAPTER_IDS contains every DESKTOP adapter", () => {
    for (const id of DESKTOP_ADAPTER_IDS) {
      expect(ALLOWED_ADAPTER_IDS).toContain(id);
    }
  });

  it("ALLOWED_ADAPTER_IDS contains every DEV adapter", () => {
    for (const id of DEV_ADAPTER_IDS) {
      expect(ALLOWED_ADAPTER_IDS).toContain(id);
    }
  });

  it("ALLOWED_ADAPTER_IDS does NOT contain the disabled sentinel", () => {
    expect(ALLOWED_ADAPTER_IDS).not.toContain(DISABLED_ADAPTER_ID);
  });

  it("ADAPTER_ENUM_VALUES contains exactly the same IDs as ALLOWED_ADAPTER_IDS", () => {
    expect(ADAPTER_ENUM_VALUES).toHaveLength(ALLOWED_ADAPTER_IDS.length);
    for (const id of ALLOWED_ADAPTER_IDS) {
      expect(ADAPTER_ENUM_VALUES).toContain(id);
    }
  });

  it("ADAPTER_ENUM_VALUES has at least one element (satisfies z.enum() requirement)", () => {
    expect(ADAPTER_ENUM_VALUES.length).toBeGreaterThan(0);
  });
});

describe("shared adapter constants — isAllowedAdapter", () => {
  it("returns true for every value in ALLOWED_ADAPTER_IDS", () => {
    for (const id of ALLOWED_ADAPTER_IDS) {
      expect(isAllowedAdapter(id)).toBe(true);
    }
  });

  it("returns false for the disabled sentinel", () => {
    expect(isAllowedAdapter(DISABLED_ADAPTER_ID)).toBe(false);
  });

  it("returns false for unknown strings", () => {
    expect(isAllowedAdapter("browser_bing")).toBe(false);
    expect(isAllowedAdapter("")).toBe(false);
  });
});

describe("shared adapter constants — getPlatformCategory", () => {
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
    expect(getPlatformCategory("made_up_adapter")).toBe("unknown");
  });
});

describe("shared adapter constants — browser_chatgpt present as expected", () => {
  it("browser_chatgpt is in BROWSER_ADAPTER_IDS", () => {
    expect(BROWSER_ADAPTER_IDS).toContain("browser_chatgpt");
  });

  it("browser_chatgpt is in ADAPTER_ENUM_VALUES (accepted by TelemetryEventSchema)", () => {
    expect(ADAPTER_ENUM_VALUES).toContain("browser_chatgpt");
  });
});
