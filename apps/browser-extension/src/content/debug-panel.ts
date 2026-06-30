/**
 * Extension debug panel — opt-in overlay showing adapter state.
 *
 * Only mounted when debugMode === true in chrome.storage.local.
 * Shows ONLY extension-internal state; never reads or displays page content,
 * DOM text, URLs, cookies, auth tokens, or any user-derived data.
 *
 * Element ID: "promptprofit-debug-panel"
 * Each state field is also reflected as a data attribute for safe Playwright
 * assertions that do not read ChatGPT content.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * All fields MUST be extension-internal state only.
 * Forbidden: page content, DOM text, URLs, cookies, auth tokens, user data.
 */
export interface DebugState {
  adapterActive: boolean;
  waitStateDetected: boolean;
  sponsoredMomentRendered: boolean;
  /** Last event type sent — impression_requested / impression_rendered /
   *  viewability_threshold_met / click, or null if no event yet. */
  lastEventType: string | null;
  killSwitchEnabled: boolean;
  apiConfigured: boolean;
  /** True once the adapter sent a GET_AD_DECISION message to the service worker. */
  adDecisionRequested: boolean;
  /** True once a non-null SponsoredMoment was received from the service worker. */
  adDecisionReceived: boolean;
  /**
   * Safe error code — identifies failure mode without leaking page content.
   * Allowed values: "service_worker_unreachable" | "kill_switch_active" |
   * "no_decision" | "banner_render_failed" | null (no error).
   */
  lastErrorCode: string | null;
}

const DEFAULT_STATE: DebugState = {
  adapterActive: false,
  waitStateDetected: false,
  sponsoredMomentRendered: false,
  lastEventType: null,
  killSwitchEnabled: false,
  apiConfigured: false,
  adDecisionRequested: false,
  adDecisionReceived: false,
  lastErrorCode: null,
};

export const DEBUG_PANEL_ID = "promptprofit-debug-panel";

// ---------------------------------------------------------------------------
// DebugPanelState — pure state management (unit-testable without DOM)
// ---------------------------------------------------------------------------

export class DebugPanelState {
  protected state: DebugState = { ...DEFAULT_STATE };

  update(patch: Partial<DebugState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChanged();
  }

  getState(): DebugState {
    return { ...this.state };
  }

  // Subclasses override this to sync state to DOM.
  protected onStateChanged(): void { /* noop in base */ }
}

// ---------------------------------------------------------------------------
// DebugPanel — DOM integration (requires browser context)
// ---------------------------------------------------------------------------

export class DebugPanel extends DebugPanelState {
  private el: HTMLElement | null = null;

  mount(): void {
    if (typeof document === "undefined") return;
    if (document.getElementById(DEBUG_PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = DEBUG_PANEL_ID;
    panel.setAttribute("aria-label", "PromptProfit Debug Panel");
    panel.setAttribute("data-promptprofit-debug", "true");
    panel.style.cssText = [
      "position:fixed",
      "bottom:16px",
      "left:16px",
      "background:rgba(17,24,39,0.92)",
      "color:#d1d5db",
      "font-family:monospace",
      "font-size:11px",
      "padding:8px 12px",
      "border-radius:6px",
      "z-index:2147483646",
      "min-width:240px",
      "line-height:1.7",
      "pointer-events:none",
      "border:1px solid rgba(255,255,255,0.1)",
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
    document.getElementById(DEBUG_PANEL_ID)?.remove();
  }

  protected override onStateChanged(): void {
    this.render();
  }

  private render(): void {
    if (!this.el) return;
    const s = this.state;

    // Update data attributes — safe for Playwright assertions
    this.el.setAttribute("data-adapter-active",      String(s.adapterActive));
    this.el.setAttribute("data-wait-state",           String(s.waitStateDetected));
    this.el.setAttribute("data-banner-rendered",      String(s.sponsoredMomentRendered));
    this.el.setAttribute("data-last-event",           s.lastEventType ?? "");
    this.el.setAttribute("data-kill-switch",          String(s.killSwitchEnabled));
    this.el.setAttribute("data-api-configured",       String(s.apiConfigured));
    this.el.setAttribute("data-decision-requested",   String(s.adDecisionRequested));
    this.el.setAttribute("data-decision-received",    String(s.adDecisionReceived));
    this.el.setAttribute("data-last-error",           s.lastErrorCode ?? "");

    // Text rendering — only extension-internal state, no page content
    const ok  = (t: string) => `<span style='color:#86efac'>${t}</span>`;
    const err = (t: string) => `<span style='color:#f87171'>${t}</span>`;
    const dim = (t: string) => `<span style='color:#fde68a'>${t}</span>`;

    this.el.innerHTML = [
      "<b style='color:#93c5fd'>PP Debug</b>",
      `adapter: ${s.adapterActive ? ok("active") : err("inactive")}`,
      `wait-state: ${s.waitStateDetected ? ok("yes") : "no"}`,
      `banner: ${s.sponsoredMomentRendered ? ok("rendered") : "none"}`,
      `decision: ${s.adDecisionRequested ? (s.adDecisionReceived ? ok("received") : dim("requested…")) : "—"}`,
      `last event: ${dim(s.lastEventType ?? "—")}`,
      `kill-switch: ${s.killSwitchEnabled ? err("ON") : "off"}`,
      `api: ${s.apiConfigured ? ok("configured") : err("missing")}`,
      s.lastErrorCode ? `error: ${err(s.lastErrorCode)}` : "",
    ].filter(Boolean).join("<br>");
  }
}

// ---------------------------------------------------------------------------
// Helper — read debugMode from chrome.storage.local
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

export async function isDebugModeEnabled(): Promise<boolean> {
  try {
    const stored = (await chrome.storage.local.get("debugMode")) as Record<string, unknown>;
    return stored["debugMode"] === true;
  } catch {
    return false;
  }
}

export async function isApiConfigured(): Promise<boolean> {
  try {
    const stored = (await chrome.storage.local.get("apiBaseUrl")) as Record<string, unknown>;
    return typeof stored["apiBaseUrl"] === "string" && stored["apiBaseUrl"].length > 0;
  } catch {
    return false;
  }
}
