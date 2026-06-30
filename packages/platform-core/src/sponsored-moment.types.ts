/**
 * Data describing a sponsored moment to be rendered in the platform surface.
 *
 * All fields come from the backend ad decision — the adapter must never
 * supplement or modify these fields with data from the host environment.
 */
export interface SponsoredMoment {
  /** Backend-assigned decision ID; used as the reference for events. */
  adDecisionId: string;
  /** Campaign ID — present in backend responses; required for impression_requested events. */
  campaignId?: string;
  /** Campaign creative ID. */
  creativeId: string;
  /** Short headline text (max 80 chars). Safe to display — never user-derived. */
  headline: string;
  /** Optional supporting copy (max 140 chars). Safe to display. */
  body?: string;
  /** Truncated display URL shown to the developer (not the destination). */
  displayUrl: string;
  /** Unix timestamp (ms) after which this decision expires. */
  expiresAt: number;
}

/** Returned by renderSponsoredMoment to describe what was rendered. */
export interface RenderResult {
  success: boolean;
  renderedAt: Date;
  /** Surface-specific identifier for the rendered element (for removal). */
  elementId?: string;
}
