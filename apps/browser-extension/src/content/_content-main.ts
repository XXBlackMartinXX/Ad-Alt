/**
 * Shared entry-point logic for all browser content scripts.
 * Loaded on each supported AI platform domain (see manifest.json).
 *
 * PRIVACY RULE: This module never reads page text, user input, AI response
 * content, cookies, or any data beyond the document origin. It only observes
 * structural DOM signals (stop-button presence/absence) via WaitStateDetector.
 */

import { WaitStateDetector } from "./wait-state-detector.js";
import { detectPlatform } from "./platform-detector.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

void (async () => {
  const platform = detectPlatform();
  if (!platform) return;

  // Check kill switch before initializing any observers
  try {
    const resp = (await chrome.runtime.sendMessage({
      type: "CHECK_ADAPTER_STATUS",
      adapterId: platform.adapterId,
    })) as { disabled: boolean } | undefined;
    if (resp?.disabled) return;
  } catch {
    // Service worker unreachable — fail closed (no ads shown)
    return;
  }

  const detector = new WaitStateDetector();
  detector.start(
    (startedAt) => {
      void chrome.runtime.sendMessage({
        type: "WAIT_STATE_START",
        adapterId: platform.adapterId,
        startedAt: startedAt.toISOString(),
      });
    },
    () => {
      void chrome.runtime.sendMessage({
        type: "WAIT_STATE_END",
        adapterId: platform.adapterId,
      });
    },
  );

  window.addEventListener("beforeunload", () => detector.stop());
})();
