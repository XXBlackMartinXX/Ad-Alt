import { describe, it, expect } from "vitest";
import {
  DryRunDiagnosticsState,
  DEFAULT_DRYRUN_DIAGNOSTIC_STATE,
  FORBIDDEN_DIAGNOSTIC_FIELD_NAMES,
  computeStatusLabel,
  getBuildMode,
  type DryRunDiagnosticState,
} from "../diagnostics/dryrun-diagnostics.js";

describe("DryRunDiagnosticsState -- defaults", () => {
  it("starts with extension_loaded false", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState().extension_loaded).toBe(false);
  });

  it("starts with build_mode unknown", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState().build_mode).toBe("unknown");
  });

  it("starts with dry_run_demo_mode false", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState().dry_run_demo_mode).toBe(false);
  });

  it("starts with platform_detected unknown", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState().platform_detected).toBe("unknown");
  });

  it("starts with wait_state_started_at null", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState().wait_state_started_at).toBeNull();
  });

  it("starts with wait_state_duration_ms null", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState().wait_state_duration_ms).toBeNull();
  });

  it("starts with last_error_code none", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState().last_error_code).toBe("none");
  });

  it("starts with demo_fallback_active false", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState().demo_fallback_active).toBe(false);
  });

  it("starts with demo_fallback_rendered false", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState().demo_fallback_rendered).toBe(false);
  });

  it("default state matches DEFAULT_DRYRUN_DIAGNOSTIC_STATE", () => {
    const s = new DryRunDiagnosticsState();
    expect(s.getState()).toEqual(DEFAULT_DRYRUN_DIAGNOSTIC_STATE);
  });
});

describe("DryRunDiagnosticsState -- update()", () => {
  it("update() sets extension_loaded", () => {
    const s = new DryRunDiagnosticsState();
    s.update({ extension_loaded: true });
    expect(s.getState().extension_loaded).toBe(true);
  });

  it("update() sets platform_detected to chatgpt", () => {
    const s = new DryRunDiagnosticsState();
    s.update({ platform_detected: "chatgpt" });
    expect(s.getState().platform_detected).toBe("chatgpt");
  });

  it("update() sets wait_state_started_at as an ISO timestamp", () => {
    const s = new DryRunDiagnosticsState();
    const iso = new Date(0).toISOString();
    s.update({ wait_state_started_at: iso });
    expect(s.getState().wait_state_started_at).toBe(iso);
  });

  it("update() sets wait_state_duration_ms as a number", () => {
    const s = new DryRunDiagnosticsState();
    s.update({ wait_state_duration_ms: 1234 });
    expect(s.getState().wait_state_duration_ms).toBe(1234);
  });

  it("partial update leaves other fields unchanged", () => {
    const s = new DryRunDiagnosticsState();
    s.update({ extension_loaded: true, adapter_active: true });
    s.update({ wait_state_detected: true });
    const state = s.getState();
    expect(state.extension_loaded).toBe(true);
    expect(state.adapter_active).toBe(true);
    expect(state.wait_state_detected).toBe(true);
  });

  it("getState() returns a copy, not the internal reference", () => {
    const s = new DryRunDiagnosticsState();
    const copy = s.getState();
    copy.extension_loaded = true;
    expect(s.getState().extension_loaded).toBe(false);
  });

  it("last_error_code accepts every documented enum value", () => {
    const allowed: DryRunDiagnosticState["last_error_code"][] = [
      "none",
      "content_script_not_loaded",
      "platform_not_detected",
      "adapter_not_active",
      "wait_state_not_detected",
      "missing_api_config",
      "ad_decision_failed",
      "banner_render_failed",
      "banner_not_visible",
      "kill_switch_active",
      "unsupported_logged_out_state",
      "unknown_error",
    ];
    const s = new DryRunDiagnosticsState();
    for (const code of allowed) {
      s.update({ last_error_code: code });
      expect(s.getState().last_error_code).toBe(code);
    }
  });
});

describe("DryRunDiagnosticsState -- privacy safety", () => {
  it("state keys contain no forbidden field names", () => {
    const s = new DryRunDiagnosticsState();
    const keys = Object.keys(s.getState());
    for (const forbidden of FORBIDDEN_DIAGNOSTIC_FIELD_NAMES) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("DEFAULT_DRYRUN_DIAGNOSTIC_STATE contains no forbidden field names", () => {
    const keys = Object.keys(DEFAULT_DRYRUN_DIAGNOSTIC_STATE);
    for (const forbidden of FORBIDDEN_DIAGNOSTIC_FIELD_NAMES) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("state values after heavy mutation still contain no forbidden field names", () => {
    const s = new DryRunDiagnosticsState();
    s.update({
      extension_loaded: true,
      build_mode: "internal-beta",
      dry_run_demo_mode: true,
      content_script_loaded: true,
      platform_detected: "chatgpt",
      adapter_active: true,
      demo_fallback_active: true,
      demo_fallback_rendered: true,
      wait_state_detected: true,
      wait_state_started_at: new Date(0).toISOString(),
      wait_state_duration_ms: 500,
      ad_decision_requested: true,
      ad_decision_received: true,
      banner_render_attempted: true,
      banner_rendered: true,
      banner_visible: true,
      banner_closed: true,
      last_error_code: "none",
    });
    const keys = Object.keys(s.getState());
    for (const forbidden of FORBIDDEN_DIAGNOSTIC_FIELD_NAMES) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("all state values are booleans, strings from a closed enum, numbers, or null -- never arbitrary strings that could carry content", () => {
    const s = new DryRunDiagnosticsState();
    s.update({
      wait_state_started_at: new Date(0).toISOString(),
      wait_state_duration_ms: 42,
    });
    const state = s.getState();
    for (const [key, value] of Object.entries(state)) {
      const isBoolean = typeof value === "boolean";
      const isNumberOrNull = typeof value === "number" || value === null;
      const isKnownEnumField = key === "build_mode" || key === "platform_detected" || key === "last_error_code";
      const isTimestampField = key === "wait_state_started_at";
      expect(isBoolean || isNumberOrNull || isKnownEnumField || isTimestampField).toBe(true);
    }
  });

  it("wait_state_started_at, when set, is a valid ISO-8601 timestamp string (not free text)", () => {
    const s = new DryRunDiagnosticsState();
    const iso = new Date(0).toISOString();
    s.update({ wait_state_started_at: iso });
    const value = s.getState().wait_state_started_at;
    expect(value).not.toBeNull();
    expect(() => new Date(value as string).toISOString()).not.toThrow();
    expect(new Date(value as string).toISOString()).toBe(iso);
  });
});

describe("computeStatusLabel", () => {
  const base = (): DryRunDiagnosticState => ({ ...DEFAULT_DRYRUN_DIAGNOSTIC_STATE });

  it("reports not loaded when extension_loaded is false", () => {
    expect(computeStatusLabel(base())).toBe("Extension not loaded on this page");
  });

  it("reports platform not detected", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    expect(computeStatusLabel(state)).toBe("Platform not detected");
  });

  it("reports kill-switch active before adapter checks", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.kill_switch_active = true;
    expect(computeStatusLabel(state)).toBe("Kill-switch active -- banner suppressed");
  });

  it("reports adapter inactive", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    expect(computeStatusLabel(state)).toBe("Adapter inactive");
  });

  it("reports waiting for generation state", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.adapter_active = true;
    expect(computeStatusLabel(state)).toBe("Waiting for generation state");
  });

  it("reports ad decision missing after wait-state detected", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.adapter_active = true;
    state.wait_state_detected = true;
    expect(computeStatusLabel(state)).toBe("Generation detected; ad decision missing");
  });

  it("reports missing API config distinctly from a generic decision failure", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.adapter_active = true;
    state.wait_state_detected = true;
    state.missing_api_config = true;
    expect(computeStatusLabel(state)).toBe("Generation detected; API not configured");
  });

  it("reports ad decision failed distinctly", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.adapter_active = true;
    state.wait_state_detected = true;
    state.ad_decision_failed = true;
    expect(computeStatusLabel(state)).toBe("Generation detected; ad decision failed");
  });

  it("reports banner attempted but not visible", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.adapter_active = true;
    state.wait_state_detected = true;
    state.ad_decision_received = true;
    state.banner_render_attempted = true;
    state.banner_rendered = true;
    expect(computeStatusLabel(state)).toBe("Banner attempted; not visible");
  });

  it("reports banner visible when everything works", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.adapter_active = true;
    state.wait_state_detected = true;
    state.ad_decision_received = true;
    state.banner_render_attempted = true;
    state.banner_rendered = true;
    state.banner_visible = true;
    expect(computeStatusLabel(state)).toBe("Banner visible");
  });

  it("reports banner visible via the forced demo fallback with no wait-state and no adapter_active", () => {
    // This is the deterministic DRYRUN-001 fallback path: adapter_active and
    // wait_state_detected are both still false (no real generation ever
    // occurred), yet the banner is up because demo_fallback_active/rendered
    // bypass those preconditions.
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.demo_fallback_active = true;
    state.demo_fallback_rendered = true;
    state.banner_render_attempted = true;
    state.banner_rendered = true;
    state.banner_visible = true;
    expect(computeStatusLabel(state)).toBe("Banner visible");
  });

  it("reports a distinct pending state while the forced fallback is active but not yet rendered", () => {
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.demo_fallback_active = true;
    // demo_fallback_rendered still false, banner_render_attempted still false
    expect(computeStatusLabel(state)).not.toBe("Waiting for generation state");
    expect(computeStatusLabel(state)).not.toBe("Adapter inactive");
  });

  it("reports 'closed by user' instead of 'not visible' after the banner is closed", () => {
    // Regression test: banner_closed must be checked before banner_visible,
    // since closing the banner correctly resets banner_visible to false —
    // without this ordering, a deliberate close would misreport as a failure.
    const state = base();
    state.extension_loaded = true;
    state.content_script_loaded = true;
    state.platform_detected = "chatgpt";
    state.adapter_active = true;
    state.wait_state_detected = true;
    state.ad_decision_received = true;
    state.banner_render_attempted = true;
    state.banner_rendered = true;
    state.banner_visible = false;
    state.banner_closed = true;
    expect(computeStatusLabel(state)).toBe("Banner visible; closed by user");
  });
});

describe("getBuildMode", () => {
  it("returns 'unknown' when PROMPTPROFIT_BUILD_MODE is not defined (e.g. under vitest)", () => {
    // vitest does not inject the esbuild `define` constant, so this proves
    // the module is safely importable/testable outside the bundler.
    expect(getBuildMode()).toBe("unknown");
  });
});
