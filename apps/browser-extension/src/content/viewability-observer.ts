/**
 * Viewability observer for browser extension sponsored moments.
 *
 * Uses IntersectionObserver to measure how long the sponsored element
 * is visible in the viewport. Fires a callback when the billable threshold
 * is met (≥50% intersection for ≥5 seconds).
 *
 * STABILITY RULE: Fails closed — if IntersectionObserver is unavailable or
 * the element is detached, nothing is reported.
 */

import { VIEWABILITY_THRESHOLDS } from "@ad-alt/platform-core";

export type ViewabilityCallback = (visibleDurationMs: number) => void;

export class ViewabilityObserver {
  private observer: IntersectionObserver | null = null;
  private visibleSince: number | null = null;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private element: Element | null = null;

  /**
   * Begin observing `element` for billable viewability.
   *
   * @param element         The DOM element to observe.
   * @param onBillable      Callback fired with elapsed visible ms when
   *                        the billable threshold is met.
   * @param billableThresholdMs  Override the production billable threshold.
   *   MUST only be supplied from fixture-test.ts (test-only content script).
   *   chatgpt.ts (production) never passes this argument.
   */
  observe(
    element: Element,
    onBillable: ViewabilityCallback,
    billableThresholdMs?: number,
  ): void {
    this.stop();
    this.element = element;

    if (typeof IntersectionObserver === "undefined") return;

    // Production uses the platform-core constants.
    // Test-only: fixture-test.ts may pass a shorter duration so E2E tests
    // complete in milliseconds rather than minutes.
    const threshold = billableThresholdMs ?? VIEWABILITY_THRESHOLDS.BILLABLE_DURATION_MS;
    // Guard uses the same threshold so test and production logic stay consistent.
    const minDuration = billableThresholdMs ?? VIEWABILITY_THRESHOLDS.MIN_DURATION_MS;

    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const isVisible = entry.intersectionRatio >= VIEWABILITY_THRESHOLDS.INTERSECTION_RATIO;

        if (isVisible && this.visibleSince === null) {
          this.visibleSince = Date.now();
          this.timerHandle = setTimeout(() => {
            const duration = Date.now() - (this.visibleSince ?? 0);
            if (duration >= minDuration) {
              onBillable(duration);
            }
          }, threshold);
        } else if (!isVisible) {
          this.clearTimer();
        }
      },
      { threshold: VIEWABILITY_THRESHOLDS.INTERSECTION_RATIO },
    );

    this.observer.observe(element);
  }

  stop(): void {
    this.clearTimer();
    this.observer?.disconnect();
    this.observer = null;
    this.visibleSince = null;
    this.element = null;
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    this.visibleSince = null;
  }
}
