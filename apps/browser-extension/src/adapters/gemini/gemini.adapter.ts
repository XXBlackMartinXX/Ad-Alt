/**
 * Gemini browser adapter.
 *
 * Implements IAdapter for gemini.google.com.
 * Activates only on the correct hostname; all DOM interaction is delegated to
 * GeminiWaitStateDetector (structural observation only) and GeminiRenderer.
 *
 * PRIVACY RULE: This adapter never reads page content, user input, AI responses,
 * DOM text, cookies, auth tokens, page titles, URL paths/queries, or any user-
 * derived data. It observes only structural element presence signals.
 *
 * KILL-SWITCH RULE: The service-worker applies the kill switch before the content
 * script starts this adapter. This adapter itself also guards renderSponsoredMoment
 * behind the active flag so an inactive adapter never renders an ad.
 *
 * SUPPORT STATUS: beta (fixture-tested + unit-tested; no human-operated
 * live-session confirmation yet — see
 * docs/internal-beta/platforms/GEMINI_BROWSER_VERIFICATION.md). This adapter
 * IS wired into apps/browser-extension/src/content/gemini.ts, gated behind
 * the same kill-switch as every other adapter and defaulting to disabled
 * during rollout (see docs/internal-beta/platforms/PLATFORM_SUPPORT_MATRIX.md).
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
import type { IGeminiWaitStateDetector } from "./gemini.wait-state.js";
import { GeminiWaitStateDetector } from "./gemini.wait-state.js";
import type { IGeminiRenderer } from "./gemini.renderer.js";
import { GeminiRenderer } from "./gemini.renderer.js";
import { GEMINI_HOSTNAMES } from "./gemini.selectors.js";

export interface GeminiAdapterDeps {
  detector?: IGeminiWaitStateDetector;
  renderer?: IGeminiRenderer;
  /** Override hostname resolution — for testing only. */
  getHostname?: () => string;
}

export class GeminiAdapter implements IAdapter {
  readonly adapterId = "browser_gemini" as const;
  readonly platformName = "Gemini browser";
  readonly platformCategory = getPlatformCategory("browser_gemini");
  readonly capabilities: PlatformCapabilities = {
    supportsViewabilityTracking: true,
    supportsClickTracking: true,
    supportsIdleDetection: true,
    maxWaitStateDurationMs: 30_000,
  };

  private active = false;
  private waitStartHandlers: Array<(event: WaitStateEvent) => void> = [];
  private waitEndHandlers: Array<() => void> = [];

  private readonly detector: IGeminiWaitStateDetector;
  private readonly renderer: IGeminiRenderer;
  private readonly getHostname: () => string;

  constructor(deps?: GeminiAdapterDeps) {
    this.detector = deps?.detector ?? new GeminiWaitStateDetector();
    this.renderer = deps?.renderer ?? new GeminiRenderer();
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
    return (GEMINI_HOSTNAMES as readonly string[]).includes(hostname);
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
