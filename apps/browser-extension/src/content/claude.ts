/**
 * Content script for Claude (claude.ai).
 *
 * Uses ClaudeAdapter for wait-state detection and sponsored moment rendering,
 * and ad-event-sender for privacy-safe telemetry. Mirrors chatgpt.ts's core
 * wiring, deliberately WITHOUT the ChatGPT-only internal-beta DRYRUN-001
 * forced demo fallback (that mechanism exists solely to make the ChatGPT
 * revenue pilot's dry-run deterministic; Claude is not part of that pilot
 * and must not affect it).
 *
 * SUPPORT STATUS: beta (fixture-tested + unit-tested; no human-operated
 * live-session confirmation yet — see
 * docs/internal-beta/platforms/CLAUDE_BROWSER_VERIFICATION.md). Claude stays
 * behind the same kill-switch as every other adapter and defaults to
 * kill-switch-disabled during rollout.
 *
 * PRIVACY RULE: Never reads page content, user input, AI response text,
 * cookies, or any data beyond the structural DOM signals defined in
 * claude.selectors.ts. All telemetry contains only backend-assigned
 * identifiers and extension metadata.
 */

import { ClaudeAdapter } from "../adapters/claude/claude.adapter.js";
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

/**
 * Resolves once document.body exists, or after timeoutMs elapses. Never
 * reads page content — a defensive guard against the content script running
 * before body is attached.
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
  if (!bodyReady) return;

  const adapter = new ClaudeAdapter();

  const canActivate = await adapter.canActivate();
  if (!canActivate) return;

  const debugMode = await isDebugModeEnabled();
  const debugPanel = new DebugPanel();
  if (debugMode) {
    debugPanel.mount();
    debugPanel.update({ apiConfigured: await isApiConfigured() });
  }

  // Kill-switch check — fail closed if service worker unreachable.
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

  adapter.onWaitStateStart(async (event) => {
    debugPanel.update({ waitStateDetected: true });
    void event;

    // Request an ad decision from the service-worker (which calls the API).
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

    // Start viewability tracking — always uses production threshold.
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
