/**
 * Content script for ChatGPT (chatgpt.com, chat.openai.com).
 *
 * Uses ChatGPTAdapter for wait-state detection and sponsored moment rendering,
 * and ad-event-sender for privacy-safe telemetry.
 *
 * PRIVACY RULE: Never reads page content, user input, AI response text, cookies,
 * or any data beyond the structural DOM signals defined in chatgpt.selectors.ts.
 * All telemetry contains only backend-assigned identifiers and extension metadata.
 */

import { ChatGPTAdapter } from "../adapters/chatgpt/chatgpt.adapter.js";
import { ViewabilityObserver } from "./viewability-observer.js";
import { DebugPanel, isDebugModeEnabled, isApiConfigured } from "./debug-panel.js";
import {
  DryRunDiagnosticsPanel,
  isDryRunDemoModeActive,
  isDryRunDiagnosticsEnabled,
  hasApiBaseUrlConfigured,
  isElementVisible,
} from "../diagnostics/dryrun-diagnostics.js";
import {
  sendImpressionRequested,
  sendImpressionRendered,
  sendViewabilityThresholdMet,
} from "./ad-event-sender.js";
import { VIEWABILITY_THRESHOLDS } from "@ad-alt/platform-core";
import type { SponsoredMoment } from "@ad-alt/platform-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;
// Injected at build time by esbuild define (see scripts/bundle.mjs). Gating on
// this literal directly (rather than through a function call) is required so
// esbuild's minifier can dead-code-eliminate these branches in production —
// see scripts/audit-browser-extension-zip.js Check 3b, which verifies this.
declare const PROMPTPROFIT_BUILD_MODE: string;

// ---------------------------------------------------------------------------
// Internal-beta forced demo fallback (DRYRUN-001)
// ---------------------------------------------------------------------------
// The normal path below (adapter.start() -> wait-state detector -> ad-decision
// round-trip -> render) depends on live ChatGPT selector matching, generation
// timing, and a service-worker round-trip -- none of which are reliable
// enough for a deterministic internal-beta dry-run. See
// docs/internal-beta/dry-runs/DRYRUN-001_DEFINITIVE_BANNER_FIX.md.
//
// The fallback below renders a hardcoded placeholder locally, with NO
// dependency on wait-state detection, apiBaseUrl, or the ad-decision API --
// only extension-owned storage reads and one already-required kill-switch
// check. Fully gated behind PROMPTPROFIT_BUILD_MODE === "internal-beta" and
// never present in a production build (see Check 3b in
// scripts/audit-browser-extension-zip.js).

/** Minimum time the forced fallback banner stays up unless the user closes it. */
const FORCED_FALLBACK_MIN_DISPLAY_MS = 12_000;

const FORCED_DEMO_MOMENT: SponsoredMoment = {
  adDecisionId: "demo-forced-00000000-0000-0000-0000-000000000001",
  campaignId: "demo-forced-00000000-0000-0000-0000-000000000002",
  creativeId: "demo-forced-00000000-0000-0000-0000-000000000003",
  headline: "[PromptProfit Demo] Sponsored Headline Placeholder",
  body: "Internal dry-run placeholder. Not a real advertisement.",
  displayUrl: "demo.promptprofit.internal",
  expiresAt: 0, // overwritten at render time
};

/**
 * Resolves once document.body exists, or after timeoutMs elapses. With
 * `run_at: "document_idle"` this should resolve immediately in practice;
 * this exists only as a defensive guard against the rare case where the
 * content script executes before body is attached. Never reads page content.
 */
function waitForDocumentBody(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.body) {
      resolve(true);
      return;
    }
    const start = Date.now();
    const poll = () => {
      if (document.body) {
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        resolve(false);
      } else {
        setTimeout(poll, 50);
      }
    };
    poll();
  });
}

void (async () => {
  const bodyReady = await waitForDocumentBody(5_000);
  const adapter = new ChatGPTAdapter();

  // --------------------------------------------------------------------
  // Live dry-run diagnostics (internal-beta only).
  //
  // Mounted BEFORE the canActivate() early return so a platform-detection
  // or activation failure is itself visible to the tester instead of a
  // silent no-op. Every branch below is gated on the literal
  // PROMPTPROFIT_BUILD_MODE constant (not a function call) so esbuild's
  // minifier can dead-code-eliminate this in a production build. That is
  // enforced, not just claimed: scripts/audit-browser-extension-zip.js
  // Check 3b decompresses the actual shipped JS and fails a public-release
  // ZIP if any of this source text is still present.
  // --------------------------------------------------------------------
  const diagnostics: DryRunDiagnosticsPanel | null =
    PROMPTPROFIT_BUILD_MODE === "internal-beta" ? new DryRunDiagnosticsPanel() : null;

  if (!bodyReady) {
    // No document.body ever appeared -- there is nothing to mount a panel or
    // banner into. Fail closed silently, matching this file's existing
    // fail-closed convention for unreachable/unavailable dependencies.
    return;
  }

  if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
    diagnostics?.update({ extension_loaded: true, content_script_loaded: true, build_mode: "internal-beta" });
    const [demoActive, diagnosticsEnabled] = await Promise.all([
      isDryRunDemoModeActive(),
      isDryRunDiagnosticsEnabled(),
    ]);
    diagnostics?.update({ dry_run_demo_mode: demoActive });
    if (diagnosticsEnabled) diagnostics?.mount();
  }

  const canActivate = await adapter.canActivate();
  if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
    diagnostics?.update({
      platform_detected: canActivate ? "chatgpt" : "unknown",
      last_error_code: canActivate ? "none" : "platform_not_detected",
    });
  }
  if (!canActivate) return;

  const debugMode = await isDebugModeEnabled();
  const debugPanel = new DebugPanel();
  if (debugMode) {
    debugPanel.mount();
    debugPanel.update({ apiConfigured: await isApiConfigured() });
  }

  // Kill-switch check — fail closed if service worker unreachable
  try {
    const resp = (await chrome.runtime.sendMessage({
      type: "CHECK_ADAPTER_STATUS",
      adapterId: adapter.adapterId,
    })) as { disabled: boolean } | undefined;
    if (resp?.disabled) {
      debugPanel.update({ killSwitchEnabled: true, lastErrorCode: "kill_switch_active" });
      if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
        diagnostics?.update({ kill_switch_active: true, last_error_code: "kill_switch_active" });
      }
      return;
    }
  } catch {
    debugPanel.update({ lastErrorCode: "service_worker_unreachable" });
    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
      diagnostics?.update({ last_error_code: "unknown_error" });
    }
    return;
  }

  await adapter.start();
  debugPanel.update({ adapterActive: true, killSwitchEnabled: false });
  if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
    diagnostics?.update({ adapter_active: true, kill_switch_active: false });
  }

  // --------------------------------------------------------------------
  // Forced internal-beta demo fallback (DRYRUN-001).
  //
  // Deliberately independent of wait-state detection: renders immediately
  // once demo mode is confirmed on, with no dependency on the ad-decision
  // API, apiBaseUrl, or ChatGPT's live DOM selectors. `forcedFallbackActive`
  // both (a) protects this banner's minimum display window from being torn
  // down by a real (possibly fleeting) wait-state-end event, and (b)
  // prevents the normal wait-state path from rendering a duplicate banner
  // while this one is still showing.
  // --------------------------------------------------------------------
  let forcedFallbackActive = false;
  if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
    const demoActive = await isDryRunDemoModeActive();
    diagnostics?.update({ dry_run_demo_mode: demoActive });
    if (demoActive) {
      diagnostics?.update({ demo_fallback_active: true, banner_render_attempted: true });
      const moment: SponsoredMoment = {
        ...FORCED_DEMO_MOMENT,
        expiresAt: Date.now() + FORCED_FALLBACK_MIN_DISPLAY_MS + 60_000,
      };
      await adapter.renderSponsoredMoment(moment, () => {
        // User explicitly dismissed the fallback banner — stop protecting it
        // so the normal wait-state path can render again on a future cycle.
        forcedFallbackActive = false;
        diagnostics?.update({ banner_closed: true, banner_visible: false });
      });
      const fallbackEl = document.getElementById("promptprofit-sponsored-banner");
      const rendered = fallbackEl !== null;
      const visible = isElementVisible(fallbackEl);
      forcedFallbackActive = rendered;
      diagnostics?.update({
        demo_fallback_rendered: rendered,
        ad_decision_requested: true,
        ad_decision_received: rendered,
        banner_rendered: rendered,
        banner_visible: visible,
        last_error_code: !rendered ? "banner_render_failed" : !visible ? "banner_not_visible" : "none",
      });
      if (rendered) {
        setTimeout(() => {
          // Only auto-hide if still the same fallback banner and not already
          // closed by the user (forcedFallbackActive would be false then).
          if (forcedFallbackActive && document.getElementById("promptprofit-sponsored-banner")) {
            forcedFallbackActive = false;
            void adapter.removeSponsoredMoment();
            diagnostics?.update({ banner_visible: false });
          }
        }, FORCED_FALLBACK_MIN_DISPLAY_MS);
      }
    }
  }

  const viewabilityObserver = new ViewabilityObserver();
  let waitStateStartedAtMs: number | null = null;

  adapter.onWaitStateStart(async (event) => {
    debugPanel.update({ waitStateDetected: true });
    waitStateStartedAtMs = event.startedAt.getTime();
    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
      diagnostics?.update({
        wait_state_detected: true,
        wait_state_started_at: event.startedAt.toISOString(),
      });
    }

    // The forced fallback banner is already showing this exact demo content —
    // skip re-fetching/re-rendering to avoid a duplicate banner or duplicate
    // telemetry. wait_state_detected above is still recorded correctly.
    if (forcedFallbackActive) return;

    // Request an ad decision from the service-worker (which calls the API)
    debugPanel.update({ adDecisionRequested: true });
    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") diagnostics?.update({ ad_decision_requested: true });
    let decision: SponsoredMoment | null = null;
    try {
      const resp = (await chrome.runtime.sendMessage({
        type: "GET_AD_DECISION",
        adapterId: adapter.adapterId,
      })) as { decision: SponsoredMoment | null } | undefined;
      decision = resp?.decision ?? null;
    } catch {
      // Service worker unreachable — show no ad, fail closed
      debugPanel.update({ lastErrorCode: "service_worker_unreachable" });
      if (PROMPTPROFIT_BUILD_MODE === "internal-beta") diagnostics?.update({ last_error_code: "unknown_error" });
      return;
    }

    if (!decision) {
      debugPanel.update({ lastErrorCode: "no_decision" });
      if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
        // Distinguish "nobody configured an API and demo mode is off" (a setup
        // gap) from "demo mode or a configured API is present but still
        // returned nothing" (a genuine runtime failure) — this is exactly the
        // ambiguity that made DRYRUN-001 hard to diagnose from a single
        // undifferentiated "no banner" report.
        const [demoActive, apiConfigured] = await Promise.all([
          isDryRunDemoModeActive(),
          hasApiBaseUrlConfigured(),
        ]);
        if (!demoActive && !apiConfigured) {
          diagnostics?.update({ missing_api_config: true, last_error_code: "missing_api_config" });
        } else {
          diagnostics?.update({ ad_decision_failed: true, last_error_code: "ad_decision_failed" });
        }
      }
      return;
    }

    debugPanel.update({ adDecisionReceived: true, lastErrorCode: null });
    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
      diagnostics?.update({
        ad_decision_received: true,
        last_error_code: "none",
        wait_state_duration_ms:
          waitStateStartedAtMs !== null ? Date.now() - waitStateStartedAtMs : null,
      });
    }

    // Fire impression_requested before rendering (campaignId required by schema).
    void sendImpressionRequested(decision, adapter.adapterId);
    debugPanel.update({ lastEventType: "impression_requested" });

    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") diagnostics?.update({ banner_render_attempted: true });
    await adapter.renderSponsoredMoment(decision, () => {
      if (PROMPTPROFIT_BUILD_MODE === "internal-beta") diagnostics?.update({ banner_closed: true });
    });
    debugPanel.update({ sponsoredMomentRendered: true });

    const bannerEl = document.getElementById("promptprofit-sponsored-banner");
    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
      const rendered = bannerEl !== null;
      const visible = isElementVisible(bannerEl);
      diagnostics?.update({
        banner_rendered: rendered,
        banner_visible: visible,
        last_error_code: !rendered ? "banner_render_failed" : !visible ? "banner_not_visible" : "none",
      });
    }

    // Fire impression_rendered immediately after the banner enters the DOM.
    void sendImpressionRendered(decision, adapter.adapterId);
    debugPanel.update({ lastEventType: "impression_rendered" });

    // Start viewability tracking — always uses production threshold.
    // chatgpt.ts never reads testViewabilityThresholdMs from storage.
    if (bannerEl) {
      const capturedDecision = decision;
      viewabilityObserver.observe(bannerEl, (durationMs) => {
        void sendViewabilityThresholdMet(
          capturedDecision,
          adapter.adapterId,
          durationMs,
          VIEWABILITY_THRESHOLDS.BILLABLE_DURATION_MS,
        );
        debugPanel.update({ lastEventType: "viewability_threshold_met" });
      });
      // Note: no billableThresholdMs arg — always uses production default.
    }
  });

  adapter.onWaitStateEnd(async () => {
    viewabilityObserver.stop();
    debugPanel.update({ waitStateDetected: false, sponsoredMomentRendered: false });
    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
      diagnostics?.update({ wait_state_detected: false });
    }
    // Protect the forced fallback banner from being torn down by a real
    // (possibly very short) wait-state ending before its minimum display
    // window elapses — this is the exact "banner flashes then vanishes"
    // failure mode this fallback exists to eliminate.
    if (forcedFallbackActive) return;
    await adapter.removeSponsoredMoment();
  });

  window.addEventListener("beforeunload", () => {
    viewabilityObserver.stop();
    debugPanel.unmount();
    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") diagnostics?.unmount();
    void adapter.stop();
  });
})();
