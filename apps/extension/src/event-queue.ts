import type { ApiClient, EventPayload } from "./api-client";

type QueuedEvent = {
  id: string;
  payload: EventPayload;
  attempts: number;
  nextAttemptAt: Date;
};

export class EventQueue {
  private queue: QueuedEvent[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private readonly maxAttempts = 3;
  private readonly baseRetryMs = 2000;

  constructor(private readonly apiClient: ApiClient) {}

  enqueue(payload: EventPayload): void {
    const id = (payload["eventId"] as string | undefined) ?? Math.random().toString(36).slice(2);
    this.queue.push({ id, payload, attempts: 0, nextAttemptAt: new Date() });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, 500);
  }

  private async flush(): Promise<void> {
    const now = new Date();
    const ready = this.queue.filter((e) => e.nextAttemptAt <= now);

    for (const event of ready) {
      try {
        await this.apiClient.sendEvent(event.payload);
        this.queue = this.queue.filter((e) => e.id !== event.id);
      } catch {
        event.attempts++;
        if (event.attempts >= this.maxAttempts) {
          this.queue = this.queue.filter((e) => e.id !== event.id);
        } else {
          const backoffMs = this.baseRetryMs * Math.pow(2, event.attempts);
          event.nextAttemptAt = new Date(Date.now() + backoffMs);
        }
      }
    }

    if (this.queue.length > 0) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        void this.flush();
      }, 2000);
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.queue = [];
  }
}
