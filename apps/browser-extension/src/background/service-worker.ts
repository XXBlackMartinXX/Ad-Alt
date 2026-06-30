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

function isValidFeatureFlags(value: unknown): value is FeatureFlags {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["killSwitchEnabled"] === "boolean" &&
    Array.isArray(v["disabledAdapters"]) &&
    typeof v["flags"] === "object" &&
    v["flags"] !== null
  );
}

async function refreshFlags(): Promise<FeatureFlags> {
  const now = Date.now();
  if (now - flagsFetchedAt < FLAGS_CACHE_TTL_MS) return cachedFlags;

  try {
    const stored = await chrome.storage.local.get("featureFlags") as Record<string, unknown>;
    if (isValidFeatureFlags(stored["featureFlags"])) {
      cachedFlags = stored["featureFlags"];
      flagsFetchedAt = now;
    }
    // If storage is empty or invalid, keep FALLBACK_FLAGS_DISABLED and do NOT
    // stamp flagsFetchedAt — the next call will retry storage immediately.
  } catch {
    // On any storage error, keep existing cached flags (fail closed)
  }
  return cachedFlags;
}

/**
 * Fetch an ad decision from the PromptProfit API.
 * Returns null when no ad is available, the API is not configured, or any error occurs.
 *
 * The API base URL is read from extension storage ("apiBaseUrl"). If absent,
 * no request is made — the caller shows no ad (fail-closed on unconfigured state).
 */
async function getAdDecision(adapterId: string): Promise<Record<string, unknown> | null> {
  let apiBaseUrl: string | null = null;
  try {
    const stored = await chrome.storage.local.get("apiBaseUrl") as Record<string, unknown>;
    if (typeof stored["apiBaseUrl"] === "string" && stored["apiBaseUrl"].length > 0) {
      apiBaseUrl = stored["apiBaseUrl"];
    }
  } catch {
    return null;
  }

  if (!apiBaseUrl) return null;

  try {
    const url = `${apiBaseUrl}/v1/ads/decision?adapterName=${encodeURIComponent(adapterId)}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok) return null;
    const outer = await resp.json() as Record<string, unknown>;
    // Support both wrapped { data: { ... } } and flat response shapes
    const body = (outer["data"] ?? outer) as Record<string, unknown>;
    // Validate required SponsoredMoment fields are present and have correct types
    if (
      typeof body["adDecisionId"] === "string" &&
      typeof body["creativeId"] === "string" &&
      typeof body["headline"] === "string" &&
      typeof body["displayUrl"] === "string" &&
      typeof body["expiresAt"] === "number"
    ) {
      return body;
    }
    return null;
  } catch {
    return null;
  }
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

    if (message?.["type"] === "GET_AD_DECISION") {
      // Fetch an ad decision from the API on behalf of the content script.
      // Returns { decision: SponsoredMoment | null } — null means no ad to show.
      const adapterId = String(message["adapterId"] ?? "");
      getAdDecision(adapterId)
        .then((decision) => sendResponse({ decision }))
        .catch(() => sendResponse({ decision: null }));
      return true;
    }

    if (message?.["type"] === "UPDATE_FLAGS") {
      const candidate = message["flags"];
      if (!isValidFeatureFlags(candidate)) {
        sendResponse({ ok: false });
        return false;
      }
      cachedFlags = candidate;
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

// Invalidate the in-memory flag cache whenever featureFlags changes in storage
// (covers test helpers that write directly to chrome.storage.local).
chrome.storage.onChanged.addListener((changes: Record<string, unknown>, area: string) => {
  if (area === "local" && "featureFlags" in changes) {
    flagsFetchedAt = 0;
  }
});
