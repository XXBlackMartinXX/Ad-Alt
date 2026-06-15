export type AdDecision = {
  adDecisionId: string;
  campaignId: string;
  creativeId: string;
  headline: string;
  body: string | null;
  displayUrl: string;
  cpmBidMicrocents: string;
  expiresAt: string;
};

export type FeatureFlags = {
  killSwitchEnabled: boolean;
  disabledAdapters: string[];
  flags: Record<string, boolean>;
};

export type EventPayload = Record<string, unknown>;

export class ApiClient {
  private apiUrl: string;
  private apiKey: string | undefined;

  constructor(apiUrl: string, apiKey?: string) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  async getFlags(): Promise<FeatureFlags | null> {
    try {
      const resp = await fetch(`${this.apiUrl}/v1/flags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return null;
      const body = (await resp.json()) as { data: FeatureFlags };
      return body.data;
    } catch {
      return null;
    }
  }

  async requestAd(params: {
    deviceId: string;
    adapterName: string;
    extensionVersion: string;
  }): Promise<AdDecision | null> {
    if (!this.apiKey) return null;
    try {
      const qs = new URLSearchParams({
        deviceId: params.deviceId,
        adapterName: params.adapterName,
        extensionVersion: params.extensionVersion,
      });
      const resp = await fetch(`${this.apiUrl}/v1/ads/decision?${qs}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 204 || !resp.ok) return null;
      const body = (await resp.json()) as { data: AdDecision | null };
      return body.data;
    } catch {
      return null;
    }
  }

  async sendEvent(payload: EventPayload): Promise<void> {
    if (!this.apiKey) return;
    try {
      await fetch(`${this.apiUrl}/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Silently fail — events use retry queue
    }
  }
}
