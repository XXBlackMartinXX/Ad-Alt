import type { AllowedAdapterId } from "./adapter-ids.js";

/**
 * Emitted by an adapter when it detects a wait-state has started.
 *
 * PRIVACY: Contains only timing data — no content from the host environment.
 */
export interface WaitStateEvent {
  /** When the wait-state was detected (local wall-clock). */
  startedAt: Date;
  /** Adapter that detected the wait-state. */
  adapterId: AllowedAdapterId;
}
