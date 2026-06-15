import { describe, it, expect } from "vitest";
import { FraudScorer } from "../scorer.js";
import type { FraudScoringContext } from "../types.js";
import {
  MAX_IMPRESSIONS_PER_HOUR,
  CLICK_RATE_LIMIT_SECONDS,
  IMPRESSION_MIN_THRESHOLD_MS,
} from "@ad-alt/shared";

// ---------------------------------------------------------------------------
// Base context — clean / valid values
// ---------------------------------------------------------------------------

const baseCtx: FraudScoringContext = {
  deviceId: "device-1",
  sessionId: "sess-1",
  impressionsInLastHour: 0,
  deviceIsBlocked: false,
  deviceFraudScore: 0,
  sequenceNumber: 1,
};

function ctx(overrides: Partial<FraudScoringContext> = {}): FraudScoringContext {
  return { ...baseCtx, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FraudScorer", () => {
  const scorer = new FraudScorer();

  // -------------------------------------------------------------------------
  // scoreImpression
  // -------------------------------------------------------------------------

  describe("scoreImpression", () => {
    it("passes for a clean context", () => {
      const result = scorer.scoreImpression(ctx());
      expect(result.decision).toBe("pass");
      expect(result.signals).toHaveLength(0);
      expect(result.totalScore).toBe(0);
      expect(result.explainableReason).toBeUndefined();
    });

    it("immediately blocks when device is blocked", () => {
      const result = scorer.scoreImpression(ctx({ deviceIsBlocked: true }));
      expect(result.decision).toBe("block");
      expect(result.totalScore).toBe(100);
      expect(result.signals[0]?.name).toBe("device_blocked");
    });

    it("triggers device_velocity_high when impressions are near the limit (80%)", () => {
      const nearLimit = Math.floor(MAX_IMPRESSIONS_PER_HOUR * 0.8);
      const result = scorer.scoreImpression(ctx({ impressionsInLastHour: nearLimit }));
      const signal = result.signals.find((s) => s.name === "device_velocity_high");
      expect(signal).toBeDefined();
      expect(result.decision).toBe("pass"); // score is 30, below review threshold
    });

    it("triggers excessive_impression_rate at the limit (review decision)", () => {
      const result = scorer.scoreImpression(
        ctx({ impressionsInLastHour: MAX_IMPRESSIONS_PER_HOUR })
      );
      const signal = result.signals.find((s) => s.name === "excessive_impression_rate");
      expect(signal).toBeDefined();
      expect(signal?.score).toBe(70);
      // 70 >= 60 → review, but 70 < 85 → not block
      expect(result.decision).toBe("review");
    });

    it("triggers excessive_impression_rate above the limit", () => {
      const result = scorer.scoreImpression(
        ctx({ impressionsInLastHour: MAX_IMPRESSIONS_PER_HOUR + 10 })
      );
      const signal = result.signals.find((s) => s.name === "excessive_impression_rate");
      expect(signal).toBeDefined();
      expect(result.decision).toBe("review");
    });

    it("triggers invalid_sequence when sequence number regresses", () => {
      const result = scorer.scoreImpression(
        ctx({ sequenceNumber: 3, lastSequenceNumber: 5 })
      );
      const signal = result.signals.find((s) => s.name === "invalid_sequence");
      expect(signal).toBeDefined();
      expect(signal?.score).toBe(40);
    });

    it("triggers invalid_sequence when sequence number is equal to last", () => {
      const result = scorer.scoreImpression(
        ctx({ sequenceNumber: 5, lastSequenceNumber: 5 })
      );
      const signal = result.signals.find((s) => s.name === "invalid_sequence");
      expect(signal).toBeDefined();
    });

    it("does not trigger invalid_sequence when lastSequenceNumber is absent", () => {
      const partialCtx: FraudScoringContext = { ...ctx({ sequenceNumber: 1 }) };
      delete (partialCtx as Partial<FraudScoringContext>).lastSequenceNumber;
      const result = scorer.scoreImpression(partialCtx);
      const signal = result.signals.find((s) => s.name === "invalid_sequence");
      expect(signal).toBeUndefined();
    });

    it("triggers device_velocity_high when deviceFraudScore >= 50", () => {
      const result = scorer.scoreImpression(ctx({ deviceFraudScore: 80 }));
      const signal = result.signals.find((s) => s.name === "device_velocity_high");
      expect(signal).toBeDefined();
      expect(signal?.score).toBe(Math.min(40, 80 / 2)); // 40
    });

    it("does not trigger device_velocity_high for deviceFraudScore < 50", () => {
      const result = scorer.scoreImpression(ctx({ deviceFraudScore: 49 }));
      const velocitySignal = result.signals.find((s) => s.name === "device_velocity_high");
      expect(velocitySignal).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // scoreViewability
  // -------------------------------------------------------------------------

  describe("scoreViewability", () => {
    it("passes for a clean context with valid duration", () => {
      const result = scorer.scoreViewability(ctx({ displayedDurationMs: 5000 }));
      expect(result.decision).toBe("pass");
      expect(result.signals).toHaveLength(0);
    });

    it("blocks when duration is below minimum threshold", () => {
      const result = scorer.scoreViewability(
        ctx({ displayedDurationMs: IMPRESSION_MIN_THRESHOLD_MS - 1 })
      );
      const signal = result.signals.find((s) => s.name === "impossible_duration");
      expect(signal).toBeDefined();
      expect(signal?.score).toBe(90);
      expect(result.decision).toBe("block"); // 90 >= 85
    });

    it("blocks when duration is zero", () => {
      const result = scorer.scoreViewability(ctx({ displayedDurationMs: 0 }));
      expect(result.decision).toBe("block");
    });

    it("triggers impossible_duration for suspiciously long duration (> 30 min), decision is pass (score 50 < 60)", () => {
      const result = scorer.scoreViewability(
        ctx({ displayedDurationMs: 31 * 60 * 1000 })
      );
      const signal = result.signals.find((s) => s.name === "impossible_duration");
      expect(signal).toBeDefined();
      expect(signal?.score).toBe(50);
      // score 50 < REVIEW_THRESHOLD 60 → pass
      expect(result.decision).toBe("pass");
    });

    it("returns pass for duration exactly at 30 minutes", () => {
      const result = scorer.scoreViewability(
        ctx({ displayedDurationMs: 30 * 60 * 1000 })
      );
      expect(result.decision).toBe("pass");
    });

    it("passes when no displayedDurationMs is provided", () => {
      const result = scorer.scoreViewability(ctx());
      expect(result.decision).toBe("pass");
    });

    it("immediately blocks when device is blocked regardless of duration", () => {
      const result = scorer.scoreViewability(
        ctx({ deviceIsBlocked: true, displayedDurationMs: 5000 })
      );
      expect(result.decision).toBe("block");
      expect(result.signals[0]?.name).toBe("device_blocked");
    });
  });

  // -------------------------------------------------------------------------
  // scoreClick
  // -------------------------------------------------------------------------

  describe("scoreClick", () => {
    it("passes for a clean click context", () => {
      const result = scorer.scoreClick(ctx({ hasValidPriorImpression: true }));
      expect(result.decision).toBe("pass");
      expect(result.signals).toHaveLength(0);
    });

    it("passes when hasValidPriorImpression is undefined", () => {
      const result = scorer.scoreClick(ctx());
      expect(result.decision).toBe("pass");
    });

    it("blocks when there is no valid prior impression", () => {
      const result = scorer.scoreClick(ctx({ hasValidPriorImpression: false }));
      const signal = result.signals.find((s) => s.name === "click_without_impression");
      expect(signal).toBeDefined();
      expect(signal?.score).toBe(95);
      expect(result.decision).toBe("block"); // 95 >= 85
    });

    it("blocks for rapid clicks within the rate limit window", () => {
      const recentClick = new Date(Date.now() - (CLICK_RATE_LIMIT_SECONDS - 5) * 1000);
      const result = scorer.scoreClick(
        ctx({ hasValidPriorImpression: true, lastClickAt: recentClick })
      );
      const signal = result.signals.find((s) => s.name === "rapid_click");
      expect(signal).toBeDefined();
      expect(signal?.score).toBe(80);
      expect(result.decision).toBe("review"); // 80 >= 60, but 80 < 85
    });

    it("passes when lastClickAt is just past the rate limit", () => {
      const oldClick = new Date(Date.now() - (CLICK_RATE_LIMIT_SECONDS + 1) * 1000);
      const result = scorer.scoreClick(
        ctx({ hasValidPriorImpression: true, lastClickAt: oldClick })
      );
      const signal = result.signals.find((s) => s.name === "rapid_click");
      expect(signal).toBeUndefined();
      expect(result.decision).toBe("pass");
    });

    it("immediately blocks when device is blocked", () => {
      const result = scorer.scoreClick(ctx({ deviceIsBlocked: true }));
      expect(result.decision).toBe("block");
      expect(result.signals[0]?.name).toBe("device_blocked");
    });
  });

  // -------------------------------------------------------------------------
  // Decision thresholds
  // -------------------------------------------------------------------------

  describe("decision thresholds", () => {
    it("returns pass for score < 60", () => {
      // invalid_sequence gives score 40 → pass
      const result = scorer.scoreImpression(
        ctx({ sequenceNumber: 1, lastSequenceNumber: 5 })
      );
      expect(result.totalScore).toBe(40);
      expect(result.decision).toBe("pass");
    });

    it("returns review for score in [60, 84]", () => {
      // excessive_impression_rate gives score 70 → review
      const result = scorer.scoreImpression(
        ctx({ impressionsInLastHour: MAX_IMPRESSIONS_PER_HOUR })
      );
      expect(result.totalScore).toBe(70);
      expect(result.decision).toBe("review");
    });

    it("returns block for score >= 85", () => {
      // click_without_impression gives score 95 → block
      const result = scorer.scoreClick(ctx({ hasValidPriorImpression: false }));
      expect(result.totalScore).toBe(95);
      expect(result.decision).toBe("block");
    });
  });

  // -------------------------------------------------------------------------
  // Stacking bonus
  // -------------------------------------------------------------------------

  describe("stacking bonus", () => {
    it("adds 5 per extra signal beyond the first", () => {
      // Trigger two signals: excessive_impression_rate (70) + invalid_sequence (40)
      // Max = 70, stackingBonus = (2 - 1) * 5 = 5, total = 75
      const result = scorer.scoreImpression(
        ctx({
          impressionsInLastHour: MAX_IMPRESSIONS_PER_HOUR,
          sequenceNumber: 1,
          lastSequenceNumber: 5,
        })
      );
      expect(result.signals.length).toBe(2);
      expect(result.totalScore).toBe(75); // max(70,40) + 5 = 75
    });

    it("does not apply stacking bonus for a single signal", () => {
      const result = scorer.scoreClick(ctx({ hasValidPriorImpression: false }));
      expect(result.signals.length).toBe(1);
      expect(result.totalScore).toBe(95); // no bonus
    });

    it("caps total score at 100 even with many signals and bonus", () => {
      // device_blocked → 100, even if stacking would overflow
      const result = scorer.scoreImpression(ctx({ deviceIsBlocked: true }));
      expect(result.totalScore).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // explainableReason
  // -------------------------------------------------------------------------

  describe("explainableReason", () => {
    it("is undefined when there are no signals", () => {
      const result = scorer.scoreImpression(ctx());
      expect(result.explainableReason).toBeUndefined();
    });

    it("lists signal names joined by comma when signals exist", () => {
      const result = scorer.scoreClick(ctx({ hasValidPriorImpression: false }));
      expect(result.explainableReason).toBe("click_without_impression");
    });
  });
});
