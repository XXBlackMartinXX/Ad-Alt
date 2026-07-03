import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient } from "../api-client";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("ApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("requestAd", () => {
    it("does nothing and returns null when no API key is configured", async () => {
      const client = new ApiClient("https://api.example.com");
      const result = await client.requestAd({
        deviceId: "dev_abc",
        adapterName: "ai_status_bar",
        extensionVersion: "0.1.0",
      });

      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends only deviceId/adapterName/extensionVersion as query params, nothing else", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: null }));
      const client = new ApiClient("https://api.example.com", "test-key");

      await client.requestAd({
        deviceId: "dev_abc",
        adapterName: "ai_status_bar",
        extensionVersion: "0.1.0",
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url] = fetchMock.mock.calls[0] ?? [];
      const parsed = new URL(url as string);
      expect(parsed.origin + parsed.pathname).toBe("https://api.example.com/v1/ads/decision");

      const allowedParams = new Set(["deviceId", "adapterName", "extensionVersion"]);
      for (const key of parsed.searchParams.keys()) {
        expect(allowedParams.has(key)).toBe(true);
      }
      expect(parsed.searchParams.get("deviceId")).toBe("dev_abc");
      expect(parsed.searchParams.get("adapterName")).toBe("ai_status_bar");
      expect(parsed.searchParams.get("extensionVersion")).toBe("0.1.0");
    });

    it("sends the API key only as an Authorization: Bearer header", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: null }));
      const client = new ApiClient("https://api.example.com", "test-key");

      await client.requestAd({
        deviceId: "dev_abc",
        adapterName: "ai_status_bar",
        extensionVersion: "0.1.0",
      });

      const [, options] = fetchMock.mock.calls[0] ?? [];
      const headers = (options as { headers: Record<string, string> }).headers;
      expect(headers["Authorization"]).toBe("Bearer test-key");
      expect(Object.keys(headers)).toEqual(["Authorization"]);
    });

    it("fails closed (returns null) on a network error", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const client = new ApiClient("https://api.example.com", "test-key");

      const result = await client.requestAd({
        deviceId: "dev_abc",
        adapterName: "ai_status_bar",
        extensionVersion: "0.1.0",
      });

      expect(result).toBeNull();
    });

    it("fails closed (returns null) on a non-2xx response", async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, {}));
      const client = new ApiClient("https://api.example.com", "test-key");

      const result = await client.requestAd({
        deviceId: "dev_abc",
        adapterName: "ai_status_bar",
        extensionVersion: "0.1.0",
      });

      expect(result).toBeNull();
    });

    it("treats HTTP 204 as no-decision (returns null), not an error", async () => {
      fetchMock.mockResolvedValue(jsonResponse(204, {}));
      const client = new ApiClient("https://api.example.com", "test-key");

      const result = await client.requestAd({
        deviceId: "dev_abc",
        adapterName: "ai_status_bar",
        extensionVersion: "0.1.0",
      });

      expect(result).toBeNull();
    });

    it("setApiKey updates the key used in subsequent requests", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: null }));
      const client = new ApiClient("https://api.example.com");
      client.setApiKey("new-key");

      await client.requestAd({
        deviceId: "dev_abc",
        adapterName: "ai_status_bar",
        extensionVersion: "0.1.0",
      });

      const [, options] = fetchMock.mock.calls[0] ?? [];
      const headers = (options as { headers: Record<string, string> }).headers;
      expect(headers["Authorization"]).toBe("Bearer new-key");
    });
  });

  describe("sendEvent", () => {
    it("does nothing when no API key is configured", async () => {
      const client = new ApiClient("https://api.example.com");
      await client.sendEvent({ eventId: "evt-1" });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("POSTs the payload as-is (event construction/privacy is the caller's responsibility) with the Bearer header", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      const client = new ApiClient("https://api.example.com", "test-key");
      const payload = { eventId: "evt-1", eventType: "click" };

      await client.sendEvent(payload);

      const [url, options] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe("https://api.example.com/v1/events");
      const opts = options as { method: string; headers: Record<string, string>; body: string };
      expect(opts.method).toBe("POST");
      expect(opts.headers["Authorization"]).toBe("Bearer test-key");
      expect(JSON.parse(opts.body)).toEqual(payload);
    });

    it("does not throw when the network request fails", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const client = new ApiClient("https://api.example.com", "test-key");

      await expect(client.sendEvent({ eventId: "evt-1" })).resolves.toBeUndefined();
    });
  });

  describe("getFlags", () => {
    it("returns the flags on a successful response", async () => {
      const flags = { killSwitchEnabled: false, disabledAdapters: [], flags: {} };
      fetchMock.mockResolvedValue(jsonResponse(200, { data: flags }));
      const client = new ApiClient("https://api.example.com");

      const result = await client.getFlags();
      expect(result).toEqual(flags);
    });

    it("fails closed (returns null) on a network error", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const client = new ApiClient("https://api.example.com");

      const result = await client.getFlags();
      expect(result).toBeNull();
    });

    it("fails closed (returns null) on a non-2xx response", async () => {
      fetchMock.mockResolvedValue(jsonResponse(503, {}));
      const client = new ApiClient("https://api.example.com");

      const result = await client.getFlags();
      expect(result).toBeNull();
    });
  });
});
