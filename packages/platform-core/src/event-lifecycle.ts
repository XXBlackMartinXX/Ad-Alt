/**
 * Event lifecycle states and valid transitions.
 *
 * Impressions move through a strict ordered state machine.
 * The backend enforces these transitions — any out-of-order event is silently dropped.
 */

export type ImpressionStatus =
  | "requested"     // Ad decision requested, impression event inserted
  | "rendered"      // Ad displayed in platform surface
  | "viewable"      // Viewability threshold met — pending fraud review
  | "billable"      // Passed fraud scoring — ready for ledger write
  | "reconciled"    // Ledger entry created and confirmed
  | "fraud_blocked"; // Fraud scoring blocked this impression

export type ClickStatus =
  | "pending"       // Received, pending fraud review
  | "billable"      // Passed fraud scoring
  | "fraud_blocked"; // Fraud scoring blocked this click

/** Valid transitions for impression status (current → next). */
export const IMPRESSION_TRANSITIONS: Record<ImpressionStatus, ImpressionStatus[]> = {
  requested: ["rendered"],
  rendered: ["viewable", "billable", "fraud_blocked"],
  viewable: ["billable", "fraud_blocked"],
  billable: ["reconciled"],
  reconciled: [],
  fraud_blocked: [],
};

/** Returns true iff transitioning from `from` to `to` is valid. */
export function isValidImpressionTransition(
  from: ImpressionStatus,
  to: ImpressionStatus,
): boolean {
  return IMPRESSION_TRANSITIONS[from]?.includes(to) ?? false;
}
