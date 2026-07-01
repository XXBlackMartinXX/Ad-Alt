/**
 * DRYRUN-001 live diagnostics — internal-beta only.
 *
 * Purpose: make the real-ChatGPT runtime path observable to a human tester
 * WITHOUT reading any private page content. This exists specifically so the
 * next DRYRUN-001 rerun tells us exactly where the runtime path stops
 * (content script never loaded / platform not detected / adapter inactive /
 * wait-state never detected / ad decision missing / banner not visible)
 * instead of a single undifferentiated "no banner" report.
 *
 * PRIVACY RULE (hard requirement): every field here MUST be extension-owned
 * metadata only. FORBIDDEN: prompt text, response text, DOM text, page
 * content, page title, full URL, query string, conversation ID, cookies,
 * tokens, localStorage/sessionStorage values, screenshots, videos, traces,
 * storageState, or raw API keys. See FORBIDDEN_DIAGNOSTIC_FIELD_NAMES below
 * and dryrun-diagnostics.test.ts, which asserts the state object can never
 * contain any of them.
 *
 * BUILD-MODE GATING: this module's panel must be mounted ONLY from call
 * sites guarded by `if (PROMPTPROFIT_BUILD_MODE === "internal-beta")`.
 * Callers (chatgpt.ts, fixture-test.ts) are responsible for that guard —
 * this module does not self-gate its DOM methods, so it stays unit-testable
 * without a build-time constant. See getBuildMode() for the one place this
 * module itself reads the build-time constant (for display purposes only).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;
declare const PROMPTPROFIT_BUILD_MODE: string;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuildMode = "internal-beta" | "production" | "unknown";
export type PlatformDetectedState = "chatgpt" | "unknown";

export type LastErrorCode =
  | "none"
  | "content_script_not_loaded"
  | "platform_not_detected"
  | "adapter_not_active"
  | "wait_state_not_detected"
  | "missing_api_config"
  | "ad_decision_failed"
  | "banner_render_failed"
  | "banner_not_visible"
  | "kill_switch_active"
  | "unsupported_logged_out_state"
  | "unknown_error";

/**
 * All fields MUST be extension-owned booleans, enums, or timestamps only.
 * Never add a field that could carry page content, DOM text, or user data.
 */
export interface DryRunDiagnosticState {
  extension_loaded: boolean;
  build_mode: BuildMode;
  dry_run_demo_mode: boolean;
  content_script_loaded: boolean;
  platform_detected: PlatformDetectedState;
  adapter_active: boolean;
  /**
   * True once the internal-beta forced demo fallback (see chatgpt.ts) has
   * determined all preconditions hold and has begun rendering, independent
   * of wait-state detection. This is the deterministic path DRYRUN-001 relies
   * on -- it does not require a live ChatGPT generation to occur at all.
   */
  demo_fallback_active: boolean;
  /** True once the forced demo fallback banner has actually entered the DOM. */
  demo_fallback_rendered: boolean;
  wait_state_detected: boolean;
  wait_state_started_at: string | null;
  wait_state_duration_ms: number | null;
  ad_decision_requested: boolean;
  ad_decision_received: boolean;
  ad_decision_failed: boolean;
  missing_api_config: boolean;
  kill_switch_active: boolean;
  banner_render_attempted: boolean;
  banner_rendered: boolean;
  banner_visible: boolean;
  banner_closed: boolean;
  last_error_code: LastErrorCode;
}

/**
 * Field names that must NEVER appear on a DryRunDiagnosticState, even if a
 * future edit tries to add one. Used by dryrun-diagnostics.test.ts.
 */
export const FORBIDDEN_DIAGNOSTIC_FIELD_NAMES = [
  "promptText",
  "responseText",
  "aiResponse",
  "chatHistory",
  "domText",
  "pageContent",
  "pageTitle",
  "pageUrl",
  "fullUrl",
  "queryString",
  "conversationId",
  "cookies",
  "cookie",
  "authToken",
  "sessionCookie",
  "localStorage",
  "sessionStorage",
  "clipboardContent",
  "screenshotData",
  "screenshot",
  "video",
  "trace",
  "storageState",
  "apiKey",
  "rawApiKey",
] as const;

export const DEFAULT_DRYRUN_DIAGNOSTIC_STATE: DryRunDiagnosticState = {
  extension_loaded: false,
  build_mode: "unknown",
  dry_run_demo_mode: false,
  content_script_loaded: false,
  platform_detected: "unknown",
  adapter_active: false,
  demo_fallback_active: false,
  demo_fallback_rendered: false,
  wait_state_detected: false,
  wait_state_started_at: null,
  wait_state_duration_ms: null,
  ad_decision_requested: false,
  ad_decision_received: false,
  ad_decision_failed: false,
  missing_api_config: false,
  kill_switch_active: false,
  banner_render_attempted: false,
  banner_rendered: false,
  banner_visible: false,
  banner_closed: false,
  last_error_code: "none",
};

// ---------------------------------------------------------------------------
// computeStatusLabel — one human-readable line summarizing the state
// ---------------------------------------------------------------------------

/**
 * Reduces the full diagnostic state to a single tester-facing status line,
 * so a non-engineer can read the panel instead of guessing. Order matters:
 * each check is a necessary precondition for the ones below it.
 *
 * The forced demo fallback (demo_fallback_active/demo_fallback_rendered) is a
 * SEPARATE, deterministic path that does not depend on wait-state detection
 * or an ad-decision round-trip -- so those two later checks are skipped
 * whenever the fallback is in play, letting this function reach "Banner
 * visible" without ever requiring a real ChatGPT generation to occur.
 */
export function computeStatusLabel(state: DryRunDiagnosticState): string {
  if (!state.extension_loaded || !state.content_script_loaded) {
    return "Extension not loaded on this page";
  }
  if (state.platform_detected !== "chatgpt") {
    return "Platform not detected";
  }
  if (state.kill_switch_active) {
    return "Kill-switch active -- banner suppressed";
  }
  // Checked before banner_visible: once closed, banner_visible reverts to
  // false, and without this check first that would misreport a deliberate
  // user action as "not visible" (implying failure).
  if (state.banner_closed) {
    return "Banner visible; closed by user";
  }
  if (!state.adapter_active && !state.demo_fallback_active) {
    return "Adapter inactive";
  }
  if (!state.wait_state_detected && !state.demo_fallback_active && !state.demo_fallback_rendered) {
    return "Waiting for generation state";
  }
  if (!state.ad_decision_received && !state.demo_fallback_rendered) {
    if (state.missing_api_config) {
      return "Generation detected; API not configured";
    }
    if (state.ad_decision_failed) {
      return "Generation detected; ad decision failed";
    }
    return "Generation detected; ad decision missing";
  }
  if (!state.banner_render_attempted) {
    return "Ad decision received; banner not attempted";
  }
  if (!state.banner_rendered) {
    return "Banner attempted; render failed";
  }
  if (!state.banner_visible) {
    return "Banner attempted; not visible";
  }
  return "Banner visible";
}

// ---------------------------------------------------------------------------
// DryRunDiagnosticsState — pure state management (unit-testable without DOM)
// ---------------------------------------------------------------------------

export class DryRunDiagnosticsState {
  protected state: DryRunDiagnosticState = { ...DEFAULT_DRYRUN_DIAGNOSTIC_STATE };

  update(patch: Partial<DryRunDiagnosticState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChanged();
  }

  getState(): DryRunDiagnosticState {
    return { ...this.state };
  }

  getStatusLabel(): string {
    return computeStatusLabel(this.state);
  }

  // Subclasses override this to sync state to DOM.
  protected onStateChanged(): void {
    /* noop in base */
  }
}

// ---------------------------------------------------------------------------
// DryRunDiagnosticsPanel — DOM integration (requires browser context)
// ---------------------------------------------------------------------------

export const DRYRUN_DIAGNOSTICS_PANEL_ID = "promptprofit-dryrun-diagnostics";

export class DryRunDiagnosticsPanel extends DryRunDiagnosticsState {
  private el: HTMLElement | null = null;
  private collapsed = false;

  mount(): void {
    if (typeof document === "undefined") return;
    if (document.getElementById(DRYRUN_DIAGNOSTICS_PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = DRYRUN_DIAGNOSTICS_PANEL_ID;
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-label", "PromptProfit Dry-Run Diagnostics");
    // Positioned top-left, offset down from the very top edge to reduce the
    // chance of overlapping ChatGPT's own top toolbar. Never overlaps the
    // sponsored banner (bottom-right) or the legacy debug panel (bottom-left).
    // Does not block ChatGPT's UI: fixed size, no pointer-events outside the
    // small collapse control, does not cover the prompt input.
    panel.style.cssText = [
      "position:fixed",
      "top:60px",
      "left:16px",
      "background:rgba(17,24,39,0.94)",
      "color:#e5e7eb",
      "font-family:monospace",
      "font-size:11px",
      "padding:8px 10px",
      "border-radius:6px",
      "z-index:2147483645", // below the banner (647) and legacy debug panel (646)
      "min-width:220px",
      "max-width:280px",
      "line-height:1.6",
      "border:1px solid rgba(255,255,255,0.12)",
      "pointer-events:auto",
    ].join(";");
    document.body.appendChild(panel);
    this.el = panel;
    this.render();
  }

  unmount(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
    document.getElementById(DRYRUN_DIAGNOSTICS_PANEL_ID)?.remove();
  }

  protected override onStateChanged(): void {
    this.render();
  }

  private toggleCollapsed = (): void => {
    this.collapsed = !this.collapsed;
    this.render();
  };

  private render(): void {
    if (!this.el) return;
    const s = this.state;
    const label = computeStatusLabel(s);

    // Data attributes — safe for Playwright assertions, no page content.
    this.el.setAttribute("data-extension-loaded", String(s.extension_loaded));
    this.el.setAttribute("data-build-mode", s.build_mode);
    this.el.setAttribute("data-demo-mode", String(s.dry_run_demo_mode));
    this.el.setAttribute("data-content-script-loaded", String(s.content_script_loaded));
    this.el.setAttribute("data-platform-detected", s.platform_detected);
    this.el.setAttribute("data-adapter-active", String(s.adapter_active));
    this.el.setAttribute("data-demo-fallback-active", String(s.demo_fallback_active));
    this.el.setAttribute("data-demo-fallback-rendered", String(s.demo_fallback_rendered));
    this.el.setAttribute("data-wait-state-detected", String(s.wait_state_detected));
    this.el.setAttribute("data-ad-decision-received", String(s.ad_decision_received));
    this.el.setAttribute("data-banner-render-attempted", String(s.banner_render_attempted));
    this.el.setAttribute("data-banner-rendered", String(s.banner_rendered));
    this.el.setAttribute("data-banner-visible", String(s.banner_visible));
    this.el.setAttribute("data-banner-closed", String(s.banner_closed));
    this.el.setAttribute("data-kill-switch-active", String(s.kill_switch_active));
    this.el.setAttribute("data-last-error-code", s.last_error_code);
    this.el.setAttribute("data-status-label", label);
    this.el.setAttribute("data-collapsed", String(this.collapsed));

    const ok = (t: string) => `<span style='color:#86efac'>${t}</span>`;
    const err = (t: string) => `<span style='color:#f87171'>${t}</span>`;
    const dim = (t: string) => `<span style='color:#fde68a'>${t}</span>`;
    const yn = (v: boolean) => (v ? ok("yes") : "no");

    if (this.collapsed) {
      this.el.innerHTML = [
        "<b style='color:#93c5fd'>PromptProfit Dry-Run Diagnostics</b>",
        `<button data-dryrun-diag-toggle style='pointer-events:auto;float:right;background:none;border:none;color:#93c5fd;cursor:pointer;font-family:monospace;font-size:11px'>[+]</button>`,
        `<div>${dim(label)}</div>`,
      ].join("");
    } else {
      this.el.innerHTML = [
        `<div><b style='color:#93c5fd'>PromptProfit Dry-Run Diagnostics</b>` +
          `<button data-dryrun-diag-toggle style='pointer-events:auto;float:right;background:none;border:none;color:#93c5fd;cursor:pointer;font-family:monospace;font-size:11px'>[-]</button></div>`,
        `<div style='margin:4px 0;padding:4px 0;border-top:1px solid rgba(255,255,255,0.1);border-bottom:1px solid rgba(255,255,255,0.1)'>${dim(label)}</div>`,
        `extension loaded: ${yn(s.extension_loaded)}`,
        `demo mode: ${yn(s.dry_run_demo_mode)}`,
        `platform detected: ${s.platform_detected === "chatgpt" ? ok("chatgpt") : err("unknown")}`,
        `adapter active: ${yn(s.adapter_active)}`,
        `demo fallback: ${yn(s.demo_fallback_active)}${s.demo_fallback_rendered ? ok(" rendered") : ""}`,
        `wait-state detected: ${yn(s.wait_state_detected)}`,
        `ad decision received: ${yn(s.ad_decision_received)}`,
        `banner render attempted: ${yn(s.banner_render_attempted)}`,
        `banner visible: ${yn(s.banner_visible)}`,
        s.last_error_code !== "none" ? `last error: ${err(s.last_error_code)}` : "",
      ]
        .filter(Boolean)
        .join("<br>");
    }

    // Wire the collapse/hide control every render (innerHTML replaces the node).
    const toggleBtn = this.el.querySelector("[data-dryrun-diag-toggle]");
    toggleBtn?.addEventListener("click", this.toggleCollapsed);
  }
}

// ---------------------------------------------------------------------------
// Storage helpers — read-only, extension-owned keys only
// ---------------------------------------------------------------------------

/**
 * Reads the build-time constant injected by esbuild's `define`. Wrapped in
 * try/catch so this module stays safely importable in unit-test contexts
 * (vitest does not inject PROMPTPROFIT_BUILD_MODE) without throwing.
 */
export function getBuildMode(): BuildMode {
  try {
    // eslint-disable-next-line no-undef
    const raw: unknown = PROMPTPROFIT_BUILD_MODE;
    if (raw === "internal-beta") return "internal-beta";
    if (raw === "production") return "production";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function isDryRunDemoModeActive(): Promise<boolean> {
  try {
    const stored = (await chrome.storage.local.get("dryRunDemoMode")) as Record<string, unknown>;
    return stored["dryRunDemoMode"] === true;
  } catch {
    return false;
  }
}

export async function isDryRunDiagnosticsEnabled(): Promise<boolean> {
  try {
    const stored = (await chrome.storage.local.get("dryRunDiagnosticsEnabled")) as Record<
      string,
      unknown
    >;
    return stored["dryRunDiagnosticsEnabled"] === true;
  } catch {
    return false;
  }
}

export async function hasApiBaseUrlConfigured(): Promise<boolean> {
  try {
    const stored = (await chrome.storage.local.get("apiBaseUrl")) as Record<string, unknown>;
    return typeof stored["apiBaseUrl"] === "string" && stored["apiBaseUrl"].length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Visibility check — distinguishes "in the DOM" from "actually visible"
// ---------------------------------------------------------------------------

/**
 * Returns true only if `el` has non-zero rendered dimensions. Used to detect
 * the case where the banner was appended to the DOM (banner_rendered=true)
 * but is not actually visible on screen (e.g. hidden by host-page CSS,
 * zero-size due to a layout conflict). Never reads element text content.
 */
export function isElementVisible(el: Element | null): boolean {
  if (!el || typeof (el as HTMLElement).getBoundingClientRect !== "function") return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
