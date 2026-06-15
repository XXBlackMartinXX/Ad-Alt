export type FraudSignalName =
  | "impossible_duration"       // duration too short or too long
  | "future_timestamp"          // event from the future
  | "excessive_impression_rate" // too many impressions per hour
  | "click_without_impression"  // click has no valid prior impression
  | "rapid_click"               // click too soon after prior click
  | "device_velocity_high"      // device has very high event rate
  | "device_blocked"            // device is on blocklist
  | "invalid_sequence"          // sequence numbers out of order
  | "session_too_long"          // session duration implausibly long
  | "identical_events"          // multiple events with same fields
  | "adapter_mismatch";         // adapter name changed mid-session

export type FraudSignal = {
  name: FraudSignalName;
  score: number;      // 0–100 contribution to total fraud score
  detail: string;     // human-readable explanation (never shown to user)
  data?: Record<string, unknown>;
};

export type FraudScoringContext = {
  deviceId: string;
  userId?: string;
  sessionId: string;
  impressionsInLastHour: number;
  lastClickAt?: Date;
  hasValidPriorImpression?: boolean;
  deviceIsBlocked: boolean;
  deviceFraudScore: number;
  displayedDurationMs?: number;
  sequenceNumber: number;
  lastSequenceNumber?: number;
};

export type FraudScoringResult = {
  totalScore: number;           // 0–100
  decision: "pass" | "review" | "block";
  signals: FraudSignal[];
  explainableReason?: string;   // safe to show in admin UI (not to user)
};
