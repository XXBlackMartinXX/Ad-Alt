/**
 * Result of a viewability check performed by an adapter.
 */
export interface ViewabilityResult {
  /** Whether the sponsored moment is currently visible to the user. */
  isViewable: boolean;
  /** Milliseconds the sponsored moment has been continuously visible. */
  visibleDurationMs: number;
  /** Reason why the moment is not viewable, if known. */
  notViewableReason?: "hidden_tab" | "element_offscreen" | "no_element" | "kill_switch";
}

/** Thresholds for counting an impression as viewable/billable. */
export const VIEWABILITY_THRESHOLDS = {
  /** Minimum ms visible before an impression is considered at all. */
  MIN_DURATION_MS: 3_000,
  /** Duration required for a billable viewable impression. */
  BILLABLE_DURATION_MS: 5_000,
  /** IntersectionObserver threshold (50% of element visible). */
  INTERSECTION_RATIO: 0.5,
} as const;
