/**
 * TEST-ONLY content script for local fixture pages. Never included in production builds.
 *
 * Runs on http://127.0.0.1:PORT/* during E2E tests (see dist-test/manifest.json).
 * Loads the ChatGPTAdapter with a hostname override so it activates on local fixture
 * pages rather than on chatgpt.com, enabling full adapter integration testing without
 * a real ChatGPT session.
 *
 * PRIVACY RULE: Inherits all privacy rules from ChatGPTAdapter — this script never
 * reads page content, user input, DOM text, or any data beyond structural DOM signals.
 */

import { ChatGPTAdapter } from "../adapters/chatgpt/chatgpt.adapter.js";
import type { SponsoredMoment } from "@ad-alt/platform-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

void (async () => {
  // Override getHostname so canActivate() passes on the local fixture origin.
  const adapter = new ChatGPTAdapter({
    getHostname: () => "chatgpt.com",
  });

  // Kill-switch check — fail closed if service worker is unreachable.
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

  adapter.onWaitStateStart(async (_event) => {
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

    await adapter.renderSponsoredMoment(decision);
  });

  adapter.onWaitStateEnd(async () => {
    await adapter.removeSponsoredMoment();
  });

  window.addEventListener("beforeunload", () => {
    void adapter.stop();
  });
})();
