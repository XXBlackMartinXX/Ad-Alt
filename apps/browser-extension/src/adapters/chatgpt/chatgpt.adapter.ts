/**
 * ChatGPT browser adapter.
 *
 * Implements IAdapter for chatgpt.com and chat.openai.com.
 * Activates only on the correct hostname; all DOM interaction is delegated to
 * ChatGPTWaitStateDetector (structural observation only) and ChatGPTRenderer.
 *
 * PRIVACY RULE: This adapter never reads page content, user input, AI responses,
 * DOM text, cookies, auth tokens, page titles, URL paths/queries, or any user-
 * derived data. It observes only structural element presence signals.
 *
 * KILL-SWITCH RULE: The service-worker applies the kill switch before the content
 * script starts this adapter. This adapter itself also guards renderSponsoredMoment
 * behind the active flag so an inactive adapter never renders an ad.
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
import type { IChatGPTWaitStateDetector } from "./chatgpt.wait-state.js";
import { ChatGPTWaitStateDetector } from "./chatgpt.wait-state.js";
import type { IChatGPTRenderer } from "./chatgpt.renderer.js";
import { ChatGPTRenderer } from "./chatgpt.renderer.js";
import { CHATGPT_HOSTNAMES } from "./chatgpt.selectors.js";

export interface ChatGPTAdapterDeps {
  detector?: IChatGPTWaitStateDetector;
  renderer?: IChatGPTRenderer;
  /** Override hostname resolution — for testing only. */
  getHostname?: () => string;
}

export class ChatGPTAdapter implements IAdapter {
  readonly adapterId = "browser_chatgpt" as const;
  readonly platformName = "ChatGPT browser";
  readonly platformCategory = getPlatformCategory("browser_chatgpt");
  readonly capabilities: PlatformCapabilities = {
    supportsViewabilityTracking: true,
    supportsClickTracking: true,
    supportsIdleDetection: true,
    maxWaitStateDurationMs: 30_000,
  };

  private active = false;
  private waitStartHandlers: Array<(event: WaitStateEvent) => void> = [];
  private waitEndHandlers: Array<() => void> = [];

  private readonly detector: IChatGPTWaitStateDetector;
  private readonly renderer: IChatGPTRenderer;
  private readonly getHostname: () => string;

  constructor(deps?: ChatGPTAdapterDeps) {
    this.detector = deps?.detector ?? new ChatGPTWaitStateDetector();
    this.renderer = deps?.renderer ?? new ChatGPTRenderer();
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
    return (CHATGPT_HOSTNAMES as readonly string[]).includes(hostname);
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
