/**
 * Content script for ChatGPT (chatgpt.com, chat.openai.com).
 *
 * Uses ChatGPTAdapter for wait-state detection and sponsored moment rendering.
 *
 * PRIVACY RULE: Never reads page content, user input, AI response text, cookies,
 * or any data beyond the structural DOM signals defined in chatgpt.selectors.ts.
 */

import { ChatGPTAdapter } from "../adapters/chatgpt/chatgpt.adapter.js";
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

    await adapter.renderSponsoredMoment(decision);
  });

  adapter.onWaitStateEnd(async () => {
    await adapter.removeSponsoredMoment();
  });

  window.addEventListener("beforeunload", () => {
    void adapter.stop();
  });
})();
