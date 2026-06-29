import type { AllowedAdapterId, PlatformCategory } from "./adapter-ids.js";
import type { WaitStateEvent } from "./wait-state.types.js";
import type { SponsoredMoment } from "./sponsored-moment.types.js";
import type { ViewabilityResult } from "./viewability.types.js";

/**
 * Minimal disposable contract compatible with vscode.Disposable, DOM EventListener
 * handles, and any other platform that uses the dispose/remove pattern.
 */
export interface Disposable {
  dispose(): void;
}

/** Capabilities advertised by an adapter to the controller. */
export interface PlatformCapabilities {
  /** Whether the adapter can track whether the sponsored moment is visible. */
  supportsViewabilityTracking: boolean;
  /** Whether the adapter supports recording click interactions. */
  supportsClickTracking: boolean;
  /** Whether the adapter performs host-environment idle detection. */
  supportsIdleDetection: boolean;
  /** Maximum milliseconds a single wait-state is allowed to run. */
  maxWaitStateDurationMs: number;
}

/** Reported by adapters when health is queried. */
export interface AdapterHealth {
  status: "healthy" | "degraded" | "inactive";
  lastCheckedAt: Date;
  /** Human-readable detail, never contains user data. */
  detail?: string;
}

/**
 * Platform-agnostic adapter contract.
 *
 * Every platform adapter (VS Code, browser content script, desktop companion)
 * must implement this interface. The interface is intentionally narrow:
 * it only exposes timing signals, never user content.
 *
 * PRIVACY RULE: No implementing method may read, capture, or transmit:
 *   prompt text, response text, source code, file paths, file contents,
 *   DOM text, clipboard content, terminal content, page titles, or URLs
 *   beyond the origin needed for platform identification at install time.
 */
export interface IAdapter {
  /** Stable identifier from the ALLOWED_ADAPTER_IDS allowlist. */
  readonly adapterId: AllowedAdapterId;
  /** Human-readable platform name (e.g. "VS Code", "ChatGPT browser"). */
  readonly platformName: string;
  /** Broad platform category derived from adapterId. */
  readonly platformCategory: PlatformCategory;
  /** Capabilities advertised to the controller. */
  readonly capabilities: PlatformCapabilities;

  /**
   * Returns true if this adapter can activate in the current environment.
   * Must not throw — return false if unsupported.
   */
  canActivate(): Promise<boolean>;

  /** Start adapter lifecycle: register observers, timers, etc. */
  start(): Promise<void>;

  /** Stop adapter lifecycle: unregister all observers and timers. */
  stop(): Promise<void>;

  /** Subscribe to wait-state start events. Returns a Disposable. */
  onWaitStateStart(handler: (event: WaitStateEvent) => void): Disposable;

  /** Subscribe to wait-state end events. Returns a Disposable. */
  onWaitStateEnd(handler: () => void): Disposable;

  /**
   * Render a sponsored moment in the platform's designated surface.
   * Must not render if wait-state cannot be verified.
   * Must not display content that was NOT provided in the SponsoredMoment arg.
   */
  renderSponsoredMoment(moment: SponsoredMoment): Promise<void>;

  /** Remove the currently displayed sponsored moment. */
  removeSponsoredMoment(): Promise<void>;

  /**
   * Check whether the sponsored moment is currently viewable.
   * For adapters that cannot verify viewability, return { isViewable: false }.
   */
  verifyViewability(): ViewabilityResult;

  /** Return current adapter health status. */
  getHealth(): AdapterHealth;
}
