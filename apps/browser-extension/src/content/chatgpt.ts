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
  sendImpressionRequested,
  sendImpressionRendered,
  sendViewabilityThresholdMet,
} from "./ad-event-sender.js";
import { VIEWABILITY_THRESHOLDS } from "@ad-alt/platform-core";
import type { SponsoredMoment } from "@ad-alt/platform-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

void (async () => {
  const adapter = new ChatGPTAdapter();

  if (!(await adapter.canActivate())) return;

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
      return;
    }
  } catch {
    debugPanel.update({ lastErrorCode: "service_worker_unreachable" });
    return;
  }

  await adapter.start();
  debugPanel.update({ adapterActive: true, killSwitchEnabled: false });

  const viewabilityObserver = new ViewabilityObserver();

  adapter.onWaitStateStart(async (_event) => {
    debugPanel.update({ waitStateDetected: true });

    // Request an ad decision from the service-worker (which calls the API)
    debugPanel.update({ adDecisionRequested: true });
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

    // Start viewability tracking — always uses production threshold.
    // chatgpt.ts never reads testViewabilityThresholdMs from storage.
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
      // Note: no billableThresholdMs arg — always uses production default.
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
