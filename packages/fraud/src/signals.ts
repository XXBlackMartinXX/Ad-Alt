import type { FraudSignal } from "./types.js";

/**
 * Signal factory functions.
 * Each returns a fully-typed FraudSignal with a consistent structure.
 * Keeping signal construction here makes scorer.ts easier to read and
 * lets tests assert on signal shape independently.
 */

export function deviceBlockedSignal(): FraudSignal {
  return {
    name: "device_blocked",
    score: 100,
    detail: "Device is on blocklist",
  };
}

export function excessiveImpressionRateSignal(
  count: number,
  max: number
): FraudSignal {
  return {
    name: "excessive_impression_rate",
    score: 70,
    detail: `${count} impressions in last hour (max ${max})`,
    data: { count, max },
  };
}

export function deviceVelocityHighSignal(
  count: number,
  score?: number
): FraudSignal {
  return {
    name: "device_velocity_high",
    score: score ?? 30,
    detail:
      score !== undefined
        ? `Device fraud score is ${count}`
        : "Impression rate approaching limit",
    data: { count },
  };
}

export function invalidSequenceSignal(
  current: number,
  last: number
): FraudSignal {
  return {
    name: "invalid_sequence",
    score: 40,
    detail: `Sequence ${current} is not greater than last ${last}`,
  };
}

export function impossibleDurationSignal(
  durationMs: number,
  minMs: number,
  tooLong: boolean
): FraudSignal {
  return {
    name: "impossible_duration",
    score: tooLong ? 50 : 90,
    detail: tooLong
      ? `Duration ${durationMs}ms is suspiciously long`
      : `Duration ${durationMs}ms is below minimum ${minMs}ms`,
    data: { durationMs, minMs },
  };
}

export function clickWithoutImpressionSignal(): FraudSignal {
  return {
    name: "click_without_impression",
    score: 95,
    detail: "No valid prior impression found for this ad decision",
  };
}

export function rapidClickSignal(
  secondsSinceLast: number,
  minSeconds: number
): FraudSignal {
  return {
    name: "rapid_click",
    score: 80,
    detail: `Click ${secondsSinceLast.toFixed(1)}s after previous (min ${minSeconds}s)`,
    data: { secondsSinceLast, minSeconds },
  };
}
