import type { FraudScoringContext, FraudScoringResult, FraudSignal } from "./types.js";
import {
  deviceBlockedSignal,
  excessiveImpressionRateSignal,
  deviceVelocityHighSignal,
  invalidSequenceSignal,
  impossibleDurationSignal,
  clickWithoutImpressionSignal,
  rapidClickSignal,
} from "./signals.js";
import {
  MAX_IMPRESSIONS_PER_HOUR,
  CLICK_RATE_LIMIT_SECONDS,
  IMPRESSION_MIN_THRESHOLD_MS,
} from "@ad-alt/shared";

const REVIEW_THRESHOLD = 60;
const BLOCK_THRESHOLD = 85;

export class FraudScorer {
  scoreImpression(ctx: FraudScoringContext): FraudScoringResult {
    const signals: FraudSignal[] = [];

    if (ctx.deviceIsBlocked) {
      signals.push(deviceBlockedSignal());
      return this.buildResult(signals);
    }

    if (ctx.impressionsInLastHour >= MAX_IMPRESSIONS_PER_HOUR) {
      signals.push(excessiveImpressionRateSignal(ctx.impressionsInLastHour, MAX_IMPRESSIONS_PER_HOUR));
    } else if (ctx.impressionsInLastHour >= MAX_IMPRESSIONS_PER_HOUR * 0.8) {
      signals.push(deviceVelocityHighSignal(ctx.impressionsInLastHour));
    }

    if (
      ctx.lastSequenceNumber !== undefined &&
      ctx.sequenceNumber <= ctx.lastSequenceNumber
    ) {
      signals.push(invalidSequenceSignal(ctx.sequenceNumber, ctx.lastSequenceNumber));
    }

    if (ctx.deviceFraudScore >= 50) {
      signals.push(
        deviceVelocityHighSignal(ctx.deviceFraudScore, Math.min(40, ctx.deviceFraudScore / 2))
      );
    }

    return this.buildResult(signals);
  }

  scoreViewability(ctx: FraudScoringContext): FraudScoringResult {
    const signals: FraudSignal[] = [];

    if (ctx.deviceIsBlocked) {
      signals.push(deviceBlockedSignal());
      return this.buildResult(signals);
    }

    if (ctx.displayedDurationMs !== undefined) {
      if (ctx.displayedDurationMs < IMPRESSION_MIN_THRESHOLD_MS) {
        signals.push(
          impossibleDurationSignal(ctx.displayedDurationMs, IMPRESSION_MIN_THRESHOLD_MS, false)
        );
      } else if (ctx.displayedDurationMs > 30 * 60 * 1000) {
        signals.push(
          impossibleDurationSignal(ctx.displayedDurationMs, IMPRESSION_MIN_THRESHOLD_MS, true)
        );
      }
    }

    return this.buildResult(signals);
  }

  scoreClick(ctx: FraudScoringContext): FraudScoringResult {
    const signals: FraudSignal[] = [];

    if (ctx.deviceIsBlocked) {
      signals.push(deviceBlockedSignal());
      return this.buildResult(signals);
    }

    if (ctx.hasValidPriorImpression === false) {
      signals.push(clickWithoutImpressionSignal());
    }

    if (ctx.lastClickAt) {
      const secondsSinceLast = (Date.now() - ctx.lastClickAt.getTime()) / 1000;
      if (secondsSinceLast < CLICK_RATE_LIMIT_SECONDS) {
        signals.push(rapidClickSignal(secondsSinceLast, CLICK_RATE_LIMIT_SECONDS));
      }
    }

    return this.buildResult(signals);
  }

  private buildResult(signals: FraudSignal[]): FraudScoringResult {
    const maxScore = signals.length > 0 ? Math.max(...signals.map((s) => s.score)) : 0;
    const stackingBonus = signals.length > 1 ? (signals.length - 1) * 5 : 0;
    const totalScore = Math.min(100, maxScore + stackingBonus);

    const decision: "pass" | "review" | "block" =
      totalScore >= BLOCK_THRESHOLD
        ? "block"
        : totalScore >= REVIEW_THRESHOLD
        ? "review"
        : "pass";

    const base: FraudScoringResult = { totalScore, decision, signals };
    if (signals.length > 0) {
      base.explainableReason = signals.map((s) => s.name).join(", ");
    }
    return base;
  }
}
