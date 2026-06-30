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
  sendImpressionRequested,
  sendImpressionRendered,
  sendViewabilityThresholdMet,
} from "./ad-event-sender.js";
import { VIEWABILITY_THRESHOLDS } from "@ad-alt/platform-core";
import type { SponsoredMoment } from "@ad-alt/platform-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

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
      return;
    }
  } catch {
    debugPanel.update({ lastErrorCode: "service_worker_unreachable" });
    return;
  }

  await adapter.start();
  debugPanel.update({ adapterActive: true, killSwitchEnabled });

  const viewabilityObserver = new ViewabilityObserver();
  // Test-only: timer handle used when IntersectionObserver is bypassed.
  let testViewabilityTimer: ReturnType<typeof setTimeout> | null = null;

  adapter.onWaitStateStart(async (_event) => {
    debugPanel.update({ waitStateDetected: true });

    // Request an ad decision from the service-worker (which calls the mock API).
    debugPanel.update({ adDecisionRequested: true });
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
      return;
    }

    if (!decision) {
      debugPanel.update({ lastErrorCode: "no_decision" });
      return;
    }

    debugPanel.update({ adDecisionReceived: true, lastErrorCode: null });

    // Fire impression_requested before rendering (campaignId required by schema).
    void sendImpressionRequested(decision, adapter.adapterId);
    debugPanel.update({ lastEventType: "impression_requested" });

    await adapter.renderSponsoredMoment(decision);
    debugPanel.update({ sponsoredMomentRendered: true });

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
    await adapter.removeSponsoredMoment();
  });

  window.addEventListener("beforeunload", () => {
    viewabilityObserver.stop();
    debugPanel.unmount();
    void adapter.stop();
  });
})();
