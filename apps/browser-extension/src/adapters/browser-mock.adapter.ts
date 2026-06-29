/**
 * Mock browser adapter for testing and development.
 * Simulates wait-state events without any real DOM interaction.
 * Never used in production — guarded by the adapter ID allowlist.
 */

import type {
  IAdapter,
  PlatformCapabilities,
  AdapterHealth,
  SponsoredMoment,
  Disposable,
  ViewabilityResult,
  WaitStateEvent,
} from "@ad-alt/platform-core";
import { getPlatformCategory } from "@ad-alt/platform-core";

export class BrowserMockAdapter implements IAdapter {
  readonly adapterId = "browser_mock" as const;
  readonly platformName = "Mock Browser";
  readonly platformCategory = getPlatformCategory("browser_mock");
  readonly capabilities: PlatformCapabilities = {
    supportsViewabilityTracking: true,
    supportsClickTracking: true,
    supportsIdleDetection: true,
    maxWaitStateDurationMs: 30_000,
  };

  private waitStateStartHandlers: Array<(event: WaitStateEvent) => void> = [];
  private waitStateEndHandlers: Array<() => void> = [];
  private active = false;

  async canActivate(): Promise<boolean> {
    return true;
  }

  async start(): Promise<void> {
    this.active = true;
  }

  async stop(): Promise<void> {
    this.active = false;
    this.waitStateStartHandlers = [];
    this.waitStateEndHandlers = [];
  }

  onWaitStateStart(handler: (event: WaitStateEvent) => void): Disposable {
    this.waitStateStartHandlers.push(handler);
    return {
      dispose: () => {
        this.waitStateStartHandlers = this.waitStateStartHandlers.filter((h) => h !== handler);
      },
    };
  }

  onWaitStateEnd(handler: () => void): Disposable {
    this.waitStateEndHandlers.push(handler);
    return {
      dispose: () => {
        this.waitStateEndHandlers = this.waitStateEndHandlers.filter((h) => h !== handler);
      },
    };
  }

  /** Trigger a simulated wait-state (test/dev only). */
  simulateWaitStateStart(): void {
    if (!this.active) return;
    const event: WaitStateEvent = { startedAt: new Date(), adapterId: this.adapterId };
    this.waitStateStartHandlers.forEach((h) => h(event));
  }

  /** End a simulated wait-state (test/dev only). */
  simulateWaitStateEnd(): void {
    if (!this.active) return;
    this.waitStateEndHandlers.forEach((h) => h());
  }

  async renderSponsoredMoment(_moment: SponsoredMoment): Promise<void> {
    // No-op in mock
  }

  async removeSponsoredMoment(): Promise<void> {
    // No-op in mock
  }

  verifyViewability(): ViewabilityResult {
    return { isViewable: true, visibleDurationMs: 6_000 };
  }

  getHealth(): AdapterHealth {
    return { status: "healthy", lastCheckedAt: new Date() };
  }

  dispose(): void {
    void this.stop();
  }
}
