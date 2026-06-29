/**
 * Background service worker (Manifest V3).
 * Handles messages from content scripts, manages kill-switch flag caching,
 * and coordinates API communication.
 *
 * PRIVACY RULE: Never log or store page content, URLs beyond hostname,
 * or any user-identifiable data beyond the pseudonymous deviceId.
 *
 * Note: chrome.* APIs are available at runtime in the browser extension context
 * but are not type-checked here to avoid requiring @types/chrome.
 */

import { isAdapterDisabled, FALLBACK_FLAGS_DISABLED } from "@ad-alt/platform-core";
import type { FeatureFlags } from "@ad-alt/platform-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const FLAGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedFlags: FeatureFlags = FALLBACK_FLAGS_DISABLED;
let flagsFetchedAt = 0;

async function refreshFlags(): Promise<FeatureFlags> {
  const now = Date.now();
  if (now - flagsFetchedAt < FLAGS_CACHE_TTL_MS) return cachedFlags;

  try {
    const stored = await chrome.storage.local.get("featureFlags") as Record<string, unknown>;
    if (stored["featureFlags"]) {
      cachedFlags = stored["featureFlags"] as FeatureFlags;
    } else {
      cachedFlags = { killSwitchEnabled: false, disabledAdapters: [], flags: {} };
    }
    flagsFetchedAt = now;
  } catch {
    // On any storage error, keep existing cached flags (fail closed)
  }
  return cachedFlags;
}

chrome.runtime.onMessage.addListener(
  (message: Record<string, unknown>, _sender: unknown, sendResponse: (r: unknown) => void) => {
    if (message?.["type"] === "CHECK_ADAPTER_STATUS") {
      const adapterId = String(message["adapterId"] ?? "");
      refreshFlags().then((flags) => {
        sendResponse({ disabled: isAdapterDisabled(adapterId as Parameters<typeof isAdapterDisabled>[0], flags) });
      }).catch(() => {
        sendResponse({ disabled: true });
      });
      return true;
    }

    if (message?.["type"] === "UPDATE_FLAGS") {
      cachedFlags = message["flags"] as FeatureFlags;
      flagsFetchedAt = Date.now();
      chrome.storage.local.set({ featureFlags: cachedFlags }).catch(() => {});
      sendResponse({ ok: true });
      return false;
    }

    return false;
  },
);

chrome.alarms.create("refresh-flags", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm: { name: string }) => {
  if (alarm.name === "refresh-flags") {
    flagsFetchedAt = 0;
  }
});
