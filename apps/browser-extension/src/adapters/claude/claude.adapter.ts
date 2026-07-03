/**
 * Claude browser adapter.
 *
 * Implements IAdapter for claude.ai.
 * Activates only on the correct hostname; all DOM interaction is delegated to
 * ClaudeWaitStateDetector (structural observation only) and ClaudeRenderer.
 *
 * PRIVACY RULE: This adapter never reads page content, user input, AI responses,
 * DOM text, cookies, auth tokens, page titles, URL paths/queries, or any user-
 * derived data. It observes only structural element presence signals.
 *
 * KILL-SWITCH RULE: The service-worker applies the kill switch before the content
 * script starts this adapter. This adapter itself also guards renderSponsoredMoment
 * behind the active flag so an inactive adapter never renders an ad.
 *
 * SUPPORT STATUS: experimental (per
 * docs/internal-beta/platforms/PLATFORM_ADAPTER_CONTRACT.md §12). This
 * adapter is NOT wired into apps/browser-extension/src/content/claude.ts
 * (the live content-script entry point) as of this commit — it exists as
 * tested, isolated code only, with zero effect on the shipped extension's
 * runtime behavior. Wiring it into the live entry point is a deliberate,
 * separate follow-up step (see
 * docs/internal-beta/platforms/NEXT_PLATFORM_EXPANSION_PLAN.md), gated on
 * real-session selector verification.
 */

import type {
  IAdapter,
  PlatformCapabilities,
  AdapterHealth,
  Disposable,
  ViewabilityResult,
  WaitStateEvent,
} from "@ad-alt/platform-core";
import type { SponsoredMoment } from "@ad-alt/platform-core";
import { getPlatformCategory } from "@ad-alt/platform-core";
import type { IClaudeWaitStateDetector } from "./claude.wait-state.js";
import { ClaudeWaitStateDetector } from "./claude.wait-state.js";
import type { IClaudeRenderer } from "./claude.renderer.js";
import { ClaudeRenderer } from "./claude.renderer.js";
import { CLAUDE_HOSTNAMES } from "./claude.selectors.js";

export interface ClaudeAdapterDeps {
  detector?: IClaudeWaitStateDetector;
  renderer?: IClaudeRenderer;
  /** Override hostname resolution — for testing only. */
  getHostname?: () => string;
}

export class ClaudeAdapter implements IAdapter {
  readonly adapterId = "browser_claude" as const;
  readonly platformName = "Claude browser";
  readonly platformCategory = getPlatformCategory("browser_claude");
  readonly capabilities: PlatformCapabilities = {
    supportsViewabilityTracking: true,
    supportsClickTracking: true,
    supportsIdleDetection: true,
    maxWaitStateDurationMs: 30_000,
  };

  private active = false;
  private waitStartHandlers: Array<(event: WaitStateEvent) => void> = [];
  private waitEndHandlers: Array<() => void> = [];

  private readonly detector: IClaudeWaitStateDetector;
  private readonly renderer: IClaudeRenderer;
  private readonly getHostname: () => string;

  constructor(deps?: ClaudeAdapterDeps) {
    this.detector = deps?.detector ?? new ClaudeWaitStateDetector();
    this.renderer = deps?.renderer ?? new ClaudeRenderer();
    this.getHostname =
      deps?.getHostname ??
      (() => {
        try {
          return (
            (globalThis as unknown as { window?: { location?: { hostname?: string } } }).window
              ?.location?.hostname ?? ""
          );
        } catch {
          return "";
        }
      });
  }

  async canActivate(): Promise<boolean> {
    const hostname = this.getHostname();
    return (CLAUDE_HOSTNAMES as readonly string[]).includes(hostname);
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.detector.start(
      (startedAt) => {
        const event: WaitStateEvent = { startedAt, adapterId: this.adapterId };
        for (const h of this.waitStartHandlers) h(event);
      },
      () => {
        for (const h of this.waitEndHandlers) h();
      },
    );
  }

  async stop(): Promise<void> {
    this.active = false;
    this.detector.stop();
    this.renderer.remove();
    this.waitStartHandlers = [];
    this.waitEndHandlers = [];
  }

  onWaitStateStart(handler: (event: WaitStateEvent) => void): Disposable {
    this.waitStartHandlers.push(handler);
    return {
      dispose: () => {
        this.waitStartHandlers = this.waitStartHandlers.filter((h) => h !== handler);
      },
    };
  }

  onWaitStateEnd(handler: () => void): Disposable {
    this.waitEndHandlers.push(handler);
    return {
      dispose: () => {
        this.waitEndHandlers = this.waitEndHandlers.filter((h) => h !== handler);
      },
    };
  }

  async renderSponsoredMoment(moment: SponsoredMoment, onClose?: () => void): Promise<void> {
    if (!this.active) return;
    this.renderer.render(moment, onClose);
  }

  async removeSponsoredMoment(): Promise<void> {
    this.renderer.remove();
  }

  verifyViewability(): ViewabilityResult {
    const el = this.renderer.getElement();
    if (!el) {
      return { isViewable: false, visibleDurationMs: 0, notViewableReason: "no_element" };
    }
    // The content script integration manages real viewability duration via
    // ViewabilityObserver (IntersectionObserver). This method reflects element
    // presence as a conservative proxy; billable impressions are tracked separately.
    return { isViewable: true, visibleDurationMs: 0 };
  }

  getHealth(): AdapterHealth {
    return {
      status: this.active ? "healthy" : "inactive",
      lastCheckedAt: new Date(),
    };
  }
}
