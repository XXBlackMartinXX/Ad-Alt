/**
 * TEST-ONLY content script for local fixture pages. Never included in production builds.
 *
 * Runs on http://127.0.0.1:PORT/* during E2E tests (see dist-test/manifest.json).
 * Loads the ChatGPTAdapter with a hostname override so it activates on local fixture
 * pages rather than on chatgpt.com, enabling full adapter integration testing without
 * a real ChatGPT session.
 *
 * PRIVACY RULE: Inherits all privacy rules from ChatGPTAdapter and ad-event-sender —
 * this script never reads page content, user input, DOM text, cookies, auth tokens,
 * page URL/title, or any data beyond structural DOM signals.
 *
 * TEST THRESHOLD: Reads `testViewabilityThresholdMs` from chrome.storage.local.
 * When set, it overrides the production BILLABLE_DURATION_MS for the viewability
 * observer — allowing E2E tests to complete in milliseconds rather than 5 seconds.
 * This key is ONLY written by the test harness (configureExtensionStorage) and
 * is ONLY read by this file. chatgpt.ts (production) never touches it.
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
// Injected at build time by esbuild define. bundle-test.mjs always sets this
// to "internal-beta" so the diagnostics panel can be exercised in E2E tests.
declare const PROMPTPROFIT_BUILD_MODE: string;

// Mirrors the forced internal-beta demo fallback in chatgpt.ts exactly, so
// e2e/dryrun-selftest.smoke.spec.ts and e2e/dryrun-diagnostics.smoke.spec.ts
// exercise the identical deterministic behavior shipped to testers.
const FORCED_FALLBACK_MIN_DISPLAY_MS = 12_000;

const FORCED_DEMO_MOMENT: SponsoredMoment = {
  adDecisionId: "demo-forced-00000000-0000-0000-0000-000000000001",
  campaignId: "demo-forced-00000000-0000-0000-0000-000000000002",
  creativeId: "demo-forced-00000000-0000-0000-0000-000000000003",
  headline: "[PromptProfit Demo] Sponsored Headline Placeholder",
  body: "Internal dry-run placeholder. Not a real advertisement.",
  displayUrl: "demo.promptprofit.internal",
  expiresAt: 0,
};

void (async () => {
  // Override getHostname so canActivate() passes on the local fixture origin.
  const adapter = new ChatGPTAdapter({
    getHostname: () => "chatgpt.com",
  });

  // Read test-only viewability threshold. Undefined = use production value.
  // SAFETY: only fixture-test.ts reads this key. chatgpt.ts never does.
  let testViewabilityThresholdMs: number | undefined;
  try {
    const stored = (await chrome.storage.local.get("testViewabilityThresholdMs")) as Record<string, unknown>;
    const raw = stored["testViewabilityThresholdMs"];
    if (typeof raw === "number" && raw > 0) {
      testViewabilityThresholdMs = raw;
    }
  } catch {
    // Ignore storage errors — fall back to production threshold.
  }

  // Optionally mount debug panel (only if debugMode is enabled in storage).
  const debugMode = await isDebugModeEnabled();
  const debugPanel = new DebugPanel();
  if (debugMode) {
    debugPanel.mount();
    debugPanel.update({
      apiConfigured: await isApiConfigured(),
    });
  }

  // Dry-run diagnostics panel (exercised by e2e/dryrun-diagnostics.smoke.spec.ts).
  // bundle-test.mjs always sets PROMPTPROFIT_BUILD_MODE to "internal-beta".
  const diagnostics: DryRunDiagnosticsPanel | null =
    PROMPTPROFIT_BUILD_MODE === "internal-beta" ? new DryRunDiagnosticsPanel() : null;
  if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
    diagnostics?.update({ extension_loaded: true, content_script_loaded: true, build_mode: "internal-beta" });
    const [demoActive, diagnosticsEnabled] = await Promise.all([
      isDryRunDemoModeActive(),
      isDryRunDiagnosticsEnabled(),
    ]);
    diagnostics?.update({ dry_run_demo_mode: demoActive, platform_detected: "chatgpt" });
    if (diagnosticsEnabled) diagnostics?.mount();
  }

  // Kill-switch check — fail closed if service worker is unreachable.
  let killSwitchEnabled = false;
  try {
    const resp = (await chrome.runtime.sendMessage({
      type: "CHECK_ADAPTER_STATUS",
      adapterId: adapter.adapterId,
    })) as { disabled: boolean } | undefined;
    killSwitchEnabled = resp?.disabled ?? true;
    if (killSwitchEnabled) {
      debugPanel.update({ killSwitchEnabled: true, lastErrorCode: "kill_switch_active" });
      if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
        diagnostics?.update({ kill_switch_active: true, last_error_code: "kill_switch_active" });
      }
      return;
    }
  } catch {
    debugPanel.update({ lastErrorCode: "service_worker_unreachable" });
    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") diagnostics?.update({ last_error_code: "unknown_error" });
    return;
  }

  await adapter.start();
  debugPanel.update({ adapterActive: true, killSwitchEnabled });
  if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
    diagnostics?.update({ adapter_active: true, kill_switch_active: false });
  }

  // Forced internal-beta demo fallback — see chatgpt.ts for full rationale.
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
  // Test-only: timer handle used when IntersectionObserver is bypassed.
  let testViewabilityTimer: ReturnType<typeof setTimeout> | null = null;
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

    if (forcedFallbackActive) return;

    // Request an ad decision from the service-worker (which calls the mock API).
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
      // Service worker unreachable — show no ad, fail closed.
      debugPanel.update({ lastErrorCode: "service_worker_unreachable" });
      if (PROMPTPROFIT_BUILD_MODE === "internal-beta") diagnostics?.update({ last_error_code: "unknown_error" });
      return;
    }

    if (!decision) {
      debugPanel.update({ lastErrorCode: "no_decision" });
      if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
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

    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
      const bannerElForDiag = document.getElementById("promptprofit-sponsored-banner");
      const rendered = bannerElForDiag !== null;
      const visible = isElementVisible(bannerElForDiag);
      diagnostics?.update({
        banner_rendered: rendered,
        banner_visible: visible,
        last_error_code: !rendered ? "banner_render_failed" : !visible ? "banner_not_visible" : "none",
      });
    }

    // Fire impression_rendered immediately after the banner enters the DOM.
    void sendImpressionRendered(decision, adapter.adapterId);
    debugPanel.update({ lastEventType: "impression_rendered" });

    // Start viewability tracking — fires viewability_threshold_met after threshold.
    // In production (chatgpt.ts) the threshold is always the platform constant.
    const bannerEl = document.getElementById("promptprofit-sponsored-banner");
    if (bannerEl) {
      const capturedDecision = decision;
      const effectiveThreshold = testViewabilityThresholdMs ?? VIEWABILITY_THRESHOLDS.BILLABLE_DURATION_MS;

      if (testViewabilityThresholdMs !== undefined) {
        // Test-only path: IntersectionObserver doesn't fire reliably in --headless=new
        // (launchPersistentContext has no explicit viewport, so geometric intersection
        // may be zero even when the element is CSS-visible). Bypass it with a direct
        // setTimeout so the event fires deterministically in E2E tests.
        const thresholdMs = testViewabilityThresholdMs;
        testViewabilityTimer = setTimeout(() => {
          testViewabilityTimer = null;
          void sendViewabilityThresholdMet(
            capturedDecision,
            adapter.adapterId,
            thresholdMs,
            effectiveThreshold,
          );
          debugPanel.update({ lastEventType: "viewability_threshold_met" });
        }, thresholdMs);
      } else {
        // Production path: full IntersectionObserver-based tracking.
        viewabilityObserver.observe(bannerEl, (durationMs) => {
          void sendViewabilityThresholdMet(
            capturedDecision,
            adapter.adapterId,
            durationMs,
            effectiveThreshold,
          );
          debugPanel.update({ lastEventType: "viewability_threshold_met" });
        });
      }
    }
  });

  adapter.onWaitStateEnd(async () => {
    if (testViewabilityTimer !== null) {
      clearTimeout(testViewabilityTimer);
      testViewabilityTimer = null;
    }
    viewabilityObserver.stop();
    debugPanel.update({ waitStateDetected: false, sponsoredMomentRendered: false });
    if (PROMPTPROFIT_BUILD_MODE === "internal-beta") {
      diagnostics?.update({ wait_state_detected: false });
    }
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
