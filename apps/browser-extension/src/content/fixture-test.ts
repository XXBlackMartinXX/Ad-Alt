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
      debugPanel.update({ killSwitchEnabled: true });
      return;
    }
  } catch {
    return;
  }

  await adapter.start();
  debugPanel.update({ adapterActive: true, killSwitchEnabled });

  const viewabilityObserver = new ViewabilityObserver();

  adapter.onWaitStateStart(async (_event) => {
    debugPanel.update({ waitStateDetected: true });

    // Request an ad decision from the service-worker (which calls the mock API).
    let decision: SponsoredMoment | null = null;
    try {
      const resp = (await chrome.runtime.sendMessage({
        type: "GET_AD_DECISION",
        adapterId: adapter.adapterId,
      })) as { decision: SponsoredMoment | null } | undefined;
      decision = resp?.decision ?? null;
    } catch {
      // Service worker unreachable — show no ad, fail closed.
      return;
    }

    if (!decision) return;

    // Fire impression_requested before rendering (campaignId required by schema).
    void sendImpressionRequested(decision, adapter.adapterId);
    debugPanel.update({ lastEventType: "impression_requested" });

    await adapter.renderSponsoredMoment(decision);
    debugPanel.update({ sponsoredMomentRendered: true });

    // Fire impression_rendered immediately after the banner enters the DOM.
    void sendImpressionRendered(decision, adapter.adapterId);
    debugPanel.update({ lastEventType: "impression_rendered" });

    // Start viewability tracking — fires viewability_threshold_met after threshold.
    // In E2E tests the banner is typically dismissed before the threshold is met;
    // the observer is stopped in onWaitStateEnd regardless.
    const bannerEl = document.getElementById("promptprofit-sponsored-banner");
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
    }
  });

  adapter.onWaitStateEnd(async () => {
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
