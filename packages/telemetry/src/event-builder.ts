import type {
  TelemetryEvent,
  ImpressionRequestedEvent,
  ImpressionRenderedEvent,
  ViewabilityEvent,
  ClickEvent,
  AdapterName,
} from "@ad-alt/shared";
import { IMPRESSION_VIEWABILITY_THRESHOLD_MS } from "@ad-alt/shared";

/**
 * Minimal builder that fills in the common base fields for each event type so
 * that callers only need to supply the domain-specific fields.
 *
 * This is a thin factory layer — it does NOT validate the output; call
 * EventValidator.validate() after building if you need validation guarantees.
 */
export class EventBuilder {
  private readonly deviceId: string;
  private readonly sessionId: string;
  private readonly extensionVersion: string;
  private readonly adapterName: AdapterName;
  private sequenceCounter = 0;

  constructor(params: {
    deviceId: string;
    sessionId: string;
    extensionVersion: string;
    adapterName: AdapterName;
  }) {
    this.deviceId = params.deviceId;
    this.sessionId = params.sessionId;
    this.extensionVersion = params.extensionVersion;
    this.adapterName = params.adapterName;
  }

  private baseFields(
    eventType: string,
    userId?: string
  ): Omit<TelemetryEvent, "eventType"> & { eventType: string } {
    return {
      eventId: crypto.randomUUID(),
      eventType,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      extensionVersion: this.extensionVersion,
      adapterName: this.adapterName,
      clientTimestamp: new Date().toISOString(),
      sequenceNumber: this.sequenceCounter++,
      ...(userId !== undefined ? { userId } : {}),
    } as Omit<TelemetryEvent, "eventType"> & { eventType: string };
  }

  buildImpressionRequested(params: {
    adDecisionId: string;
    campaignId: string;
    creativeId: string;
    userId?: string;
  }): ImpressionRequestedEvent {
    return {
      ...this.baseFields("impression_requested", params.userId),
      eventType: "impression_requested",
      adDecisionId: params.adDecisionId,
      campaignId: params.campaignId,
      creativeId: params.creativeId,
    };
  }

  buildImpressionRendered(params: {
    adDecisionId: string;
    renderedAt: string;
    userId?: string;
  }): ImpressionRenderedEvent {
    return {
      ...this.baseFields("impression_rendered", params.userId),
      eventType: "impression_rendered",
      adDecisionId: params.adDecisionId,
      renderedAt: params.renderedAt,
    };
  }

  buildViewabilityThresholdMet(params: {
    adDecisionId: string;
    displayedDurationMs: number;
    thresholdMs?: number;
    userId?: string;
  }): ViewabilityEvent {
    return {
      ...this.baseFields("viewability_threshold_met", params.userId),
      eventType: "viewability_threshold_met",
      adDecisionId: params.adDecisionId,
      displayedDurationMs: params.displayedDurationMs,
      thresholdMs: params.thresholdMs ?? IMPRESSION_VIEWABILITY_THRESHOLD_MS,
    };
  }

  buildClick(params: {
    adDecisionId: string;
    creativeId: string;
    userId?: string;
  }): ClickEvent {
    return {
      ...this.baseFields("click", params.userId),
      eventType: "click",
      adDecisionId: params.adDecisionId,
      creativeId: params.creativeId,
    };
  }

  /** Current sequence counter value (useful for tests and diagnostics) */
  get currentSequence(): number {
    return this.sequenceCounter;
  }
}
