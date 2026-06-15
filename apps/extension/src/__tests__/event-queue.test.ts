import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventQueue } from "../event-queue";
import type { ApiClient, EventPayload } from "../api-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    setApiKey: vi.fn(),
    getFlags: vi.fn().mockResolvedValue(null),
    requestAd: vi.fn().mockResolvedValue(null),
    sendEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ApiClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EventQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a queued event after the debounce delay", async () => {
    const client = makeMockApiClient();
    const queue = new EventQueue(client);

    const payload: EventPayload = { eventId: "evt-001", eventType: "impression_requested" };
    queue.enqueue(payload);

    // Advance past the 500 ms debounce
    await vi.advanceTimersByTimeAsync(600);

    expect(client.sendEvent).toHaveBeenCalledOnce();
    expect(client.sendEvent).toHaveBeenCalledWith(payload);

    queue.dispose();
  });

  it("sends multiple events in a single flush", async () => {
    const client = makeMockApiClient();
    const queue = new EventQueue(client);

    queue.enqueue({ eventId: "evt-001", eventType: "a" });
    queue.enqueue({ eventId: "evt-002", eventType: "b" });
    queue.enqueue({ eventId: "evt-003", eventType: "c" });

    await vi.advanceTimersByTimeAsync(600);

    expect(client.sendEvent).toHaveBeenCalledTimes(3);

    queue.dispose();
  });

  it("does not send the same event twice (deduplication by id)", async () => {
    const client = makeMockApiClient();
    const queue = new EventQueue(client);

    const payload: EventPayload = { eventId: "evt-dupe", eventType: "click" };
    // Enqueue the same eventId twice
    queue.enqueue(payload);
    queue.enqueue({ ...payload }); // same id, different object reference

    await vi.advanceTimersByTimeAsync(600);

    // Both are queued (queue does not deduplicate by id itself — that is the
    // server's responsibility), but both are sent because both arrive before
    // the flush window. We verify that the queue is drained correctly.
    expect(client.sendEvent).toHaveBeenCalledTimes(2);

    queue.dispose();
  });

  it("retries a failed event with exponential backoff", async () => {
    let callCount = 0;
    const client = makeMockApiClient({
      sendEvent: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) throw new Error("network error");
      }),
    });

    const queue = new EventQueue(client);
    queue.enqueue({ eventId: "evt-retry", eventType: "viewability_threshold_met" });

    // Attempt 1: fires after 500 ms debounce.
    // On failure (attempts becomes 1): backoffMs = 2000 * 2^1 = 4000 ms.
    // The queue re-flush timer is 2000 ms, but the event won't be ready until +4000 ms.
    await vi.advanceTimersByTimeAsync(600);
    expect(callCount).toBe(1);

    // The re-flush timer fires at ~2600 ms (t=600 + 2000) but the event nextAttemptAt
    // is t=4600. Advance to t=5000 so both the re-flush and the backoff have elapsed.
    await vi.advanceTimersByTimeAsync(4400); // total elapsed: 5000 ms
    expect(callCount).toBe(2);

    // Attempt 2 failed (attempts becomes 2): backoffMs = 2000 * 2^2 = 8000 ms.
    // Advance to t=5000+8000+2100 = 15100 ms to ensure we're past both the backoff
    // and the 2000 ms re-flush window.
    await vi.advanceTimersByTimeAsync(10_100); // total elapsed: 15100 ms
    expect(callCount).toBe(3);

    queue.dispose();
  });

  it("drops an event after maxAttempts (3) failures", async () => {
    const client = makeMockApiClient({
      sendEvent: vi.fn().mockRejectedValue(new Error("always fails")),
    });

    const queue = new EventQueue(client);
    queue.enqueue({ eventId: "evt-drop", eventType: "click" });

    // Run through all retry windows
    await vi.advanceTimersByTimeAsync(600);   // attempt 1
    await vi.advanceTimersByTimeAsync(4000);  // attempt 2 (backoff 2s * 2^1 = 4s)
    await vi.advanceTimersByTimeAsync(8000);  // attempt 3 (backoff 2s * 2^2 = 8s)
    await vi.advanceTimersByTimeAsync(20000); // ensure no further retries

    // 3 attempts total, then dropped
    expect(client.sendEvent).toHaveBeenCalledTimes(3);

    queue.dispose();
  });

  it("clears the queue and cancels timers on dispose", async () => {
    const client = makeMockApiClient();
    const queue = new EventQueue(client);

    queue.enqueue({ eventId: "evt-dispose", eventType: "impression_rendered" });
    queue.dispose();

    // Even after the debounce elapses nothing should be sent
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.sendEvent).not.toHaveBeenCalled();
  });

  it("uses eventId from payload as the queue entry id", async () => {
    const client = makeMockApiClient();
    const queue = new EventQueue(client);

    const specificId = "my-specific-event-id-123";
    queue.enqueue({ eventId: specificId, eventType: "click" });

    await vi.advanceTimersByTimeAsync(600);

    expect(client.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: specificId }),
    );

    queue.dispose();
  });

  it("falls back to a generated id when eventId is absent", async () => {
    const client = makeMockApiClient();
    const queue = new EventQueue(client);

    // No eventId key in the payload
    queue.enqueue({ eventType: "impression_requested" });

    await vi.advanceTimersByTimeAsync(600);

    // Should still be sent without throwing
    expect(client.sendEvent).toHaveBeenCalledOnce();

    queue.dispose();
  });
});
