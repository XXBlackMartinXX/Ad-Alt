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

  // Kill-switch check — fail closed if service worker unreachable
  try {
    const resp = (await chrome.runtime.sendMessage({
      type: "CHECK_ADAPTER_STATUS",
      adapterId: adapter.adapterId,
    })) as { disabled: boolean } | undefined;
    if (resp?.disabled) return;
  } catch {
    return;
  }

  await adapter.start();

  const viewabilityObserver = new ViewabilityObserver();

  adapter.onWaitStateStart(async (_event) => {
    // Request an ad decision from the service-worker (which calls the API)
    let decision: SponsoredMoment | null = null;
    try {
      const resp = (await chrome.runtime.sendMessage({
        type: "GET_AD_DECISION",
        adapterId: adapter.adapterId,
      })) as { decision: SponsoredMoment | null } | undefined;
      decision = resp?.decision ?? null;
    } catch {
      // Service worker unreachable — show no ad, fail closed
      return;
    }

    if (!decision) return;

    // Fire impression_requested before rendering (campaignId required by schema).
    void sendImpressionRequested(decision, adapter.adapterId);

    await adapter.renderSponsoredMoment(decision);

    // Fire impression_rendered immediately after the banner enters the DOM.
    void sendImpressionRendered(decision, adapter.adapterId);

    // Start viewability tracking — fires viewability_threshold_met after threshold.
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
      });
    }
  });

  adapter.onWaitStateEnd(async () => {
    viewabilityObserver.stop();
    await adapter.removeSponsoredMoment();
  });

  window.addEventListener("beforeunload", () => {
    viewabilityObserver.stop();
    void adapter.stop();
  });
})();
