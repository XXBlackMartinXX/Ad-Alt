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
 * Read or generate a stable device ID from extension storage.
 * The ID is generated once on first use and persisted across service-worker restarts.
 */
async function getDeviceId(): Promise<string> {
  try {
    const stored = await chrome.storage.local.get("deviceId") as Record<string, unknown>;
    const existing = stored["deviceId"];
    if (typeof existing === "string" && existing.length > 0) return existing;
    const newId = crypto.randomUUID();
    chrome.storage.local.set({ deviceId: newId }).catch(() => {});
    return newId;
  } catch {
    return "unknown-device";
  }
}

/** Read the extension version from the manifest (falls back to "0.1.0"). */
function getExtensionVersion(): string {
  try {
    return String((chrome.runtime.getManifest() as { version: string }).version ?? "0.1.0");
  } catch {
    return "0.1.0";
  }
}

/**
 * Read apiBaseUrl from storage. Returns null if absent or invalid.
 */
async function getApiBaseUrl(): Promise<string | null> {
  try {
    const stored = await chrome.storage.local.get("apiBaseUrl") as Record<string, unknown>;
    const v = stored["apiBaseUrl"];
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Build request headers including Authorization when an apiKey is configured.
 * SECURITY: The apiKey is never logged, never included in event payloads,
 * never written to reports, and never sent to any domain other than apiBaseUrl.
 */
async function buildHeaders(contentType = "application/json"): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": contentType };
  try {
    const stored = await chrome.storage.local.get("apiKey") as Record<string, unknown>;
    const key = stored["apiKey"];
    if (typeof key === "string" && key.length > 0) {
      headers["Authorization"] = `Bearer ${key}`;
    }
  } catch {
    // No key available — proceed without auth (caller handles 401)
  }
  return headers;
}

/**
 * Post a single telemetry event to the PromptProfit API.
 * Returns true on HTTP 2xx; false on any error or missing API configuration.
 * The payload is passed through as-is — privacy validation is the content
 * script's responsibility (ad-event-sender.ts never includes page data).
 */
async function postEvent(event: unknown): Promise<boolean> {
  const apiBaseUrl = await getApiBaseUrl();
  if (!apiBaseUrl) return false;

  try {
    const headers = await buildHeaders();
    const resp = await fetch(`${apiBaseUrl}/v1/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch an ad decision from the PromptProfit API.
 * Returns null when no ad is available, the API is not configured, or any error occurs.
 *
 * The API base URL is read from extension storage ("apiBaseUrl"). If absent,
 * no request is made — the caller shows no ad (fail-closed on unconfigured state).
 */
async function getAdDecision(adapterId: string): Promise<Record<string, unknown> | null> {
  const apiBaseUrl = await getApiBaseUrl();
  if (!apiBaseUrl) return null;

  try {
    const deviceId = await getDeviceId();
    const extensionVersion = getExtensionVersion();
    const url =
      `${apiBaseUrl}/v1/ads/decision` +
      `?adapterName=${encodeURIComponent(adapterId)}` +
      `&deviceId=${encodeURIComponent(deviceId)}` +
      `&extensionVersion=${encodeURIComponent(extensionVersion)}`;
    const headers = await buildHeaders();
    const resp = await fetch(url, { method: "GET", headers });
    if (!resp.ok) return null;
    const outer = await resp.json() as Record<string, unknown>;
    // Support both wrapped { data: { ... } } and flat response shapes
    const body = (outer["data"] ?? outer) as Record<string, unknown>;
    // Validate required SponsoredMoment fields
    if (
      typeof body["adDecisionId"] === "string" &&
      typeof body["creativeId"] === "string" &&
      typeof body["headline"] === "string" &&
      typeof body["displayUrl"] === "string"
    ) {
      // Normalise expiresAt: real API returns ISO string, mock returns ms number.
      const rawExpiry = body["expiresAt"];
      const expiresAt =
        typeof rawExpiry === "number" ? rawExpiry :
        typeof rawExpiry === "string" ? new Date(rawExpiry).getTime() : 0;
      return { ...body, expiresAt };
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

    if (message?.["type"] === "POST_EVENT") {
      // Post a telemetry event on behalf of the content script.
      // Returns { ok: boolean } — caller treats false as a silent drop.
      const event = message["event"];
      postEvent(event)
        .then((ok) => sendResponse({ ok }))
        .catch(() => sendResponse({ ok: false }));
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
