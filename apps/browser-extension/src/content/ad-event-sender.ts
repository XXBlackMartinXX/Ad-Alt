/**
 * Privacy-safe ad event sender for browser-extension content scripts.
 *
 * Events are routed through the service worker (POST_EVENT message) so the
 * content script never directly contacts the API and cannot be abused by
 * the host page to make arbitrary outbound requests.
 *
 * PRIVACY RULE: This module constructs events from ONLY:
 *   - Backend-assigned identifiers from the SponsoredMoment response
 *     (adDecisionId, campaignId, creativeId) — never from the page
 *   - Extension-internal metadata (deviceId, sessionId, extensionVersion,
 *     sequenceNumber, clientTimestamp)
 *
 * It never reads or transmits: page URL, page title, DOM text, cookies,
 * auth tokens, clipboard content, screenshots, or any user-derived data.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

// ---------------------------------------------------------------------------
// Session state — one instance per content-script execution context
// ---------------------------------------------------------------------------

const SESSION_ID: string = crypto.randomUUID();
let _seq = 0;
function nextSeq(): number {
  return _seq++;
}

// ---------------------------------------------------------------------------
// Device ID — pseudonymous persistent identifier in chrome.storage.local
// ---------------------------------------------------------------------------

let _deviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (_deviceId !== null) return _deviceId;
  try {
    const stored = (await chrome.storage.local.get("deviceId")) as Record<string, unknown>;
    if (typeof stored["deviceId"] === "string" && stored["deviceId"].length > 0) {
      _deviceId = stored["deviceId"];
      return _deviceId;
    }
    // Generate once and persist. The prefix makes it identifiable in logs.
    const id = `dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await chrome.storage.local.set({ deviceId: id });
    _deviceId = id;
    return _deviceId;
  } catch {
    return "dev_unknown";
  }
}

function getExtensionVersion(): string {
  try {
    const v = (chrome.runtime.getManifest() as Record<string, unknown>)["version"];
    return typeof v === "string" ? v : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// ---------------------------------------------------------------------------
// Core dispatch — routes via service worker, never throws loudly
// ---------------------------------------------------------------------------

async function dispatch(event: Record<string, unknown>): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "POST_EVENT", event });
  } catch {
    // Service worker unreachable — drop silently. Never queue or retry:
    // accumulating state across sessions creates timing side-channels.
  }
}

// ---------------------------------------------------------------------------
// Public helpers — one per event type
// ---------------------------------------------------------------------------

/** Fire when an ad decision was received and the impression is about to render. */
export async function sendImpressionRequested(
  decision: { adDecisionId: string; campaignId?: string; creativeId: string },
  adapterId: string,
): Promise<void> {
  if (!decision.campaignId) return; // campaignId is required by the schema; skip if absent
  const deviceId = await getDeviceId();
  await dispatch({
    eventId: crypto.randomUUID(),
    eventType: "impression_requested",
    deviceId,
    sessionId: SESSION_ID,
    extensionVersion: getExtensionVersion(),
    adapterName: adapterId,
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: nextSeq(),
    adDecisionId: decision.adDecisionId,
    campaignId: decision.campaignId,
    creativeId: decision.creativeId,
  });
}

/** Fire immediately after the sponsored banner becomes visible in the DOM. */
export async function sendImpressionRendered(
  decision: { adDecisionId: string },
  adapterId: string,
): Promise<void> {
  const deviceId = await getDeviceId();
  await dispatch({
    eventId: crypto.randomUUID(),
    eventType: "impression_rendered",
    deviceId,
    sessionId: SESSION_ID,
    extensionVersion: getExtensionVersion(),
    adapterName: adapterId,
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: nextSeq(),
    adDecisionId: decision.adDecisionId,
    renderedAt: new Date().toISOString(),
  });
}

/** Fire when the banner has been continuously visible for the viewability threshold. */
export async function sendViewabilityThresholdMet(
  decision: { adDecisionId: string },
  adapterId: string,
  displayedDurationMs: number,
  thresholdMs: number,
): Promise<void> {
  const deviceId = await getDeviceId();
  await dispatch({
    eventId: crypto.randomUUID(),
    eventType: "viewability_threshold_met",
    deviceId,
    sessionId: SESSION_ID,
    extensionVersion: getExtensionVersion(),
    adapterName: adapterId,
    clientTimestamp: new Date().toISOString(),
    sequenceNumber: nextSeq(),
    adDecisionId: decision.adDecisionId,
    displayedDurationMs,
    thresholdMs,
  });
}
