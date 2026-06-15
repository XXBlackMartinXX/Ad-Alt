/**
 * Thin wrapper around the @ad-alt/fraud package FraudScorer for use in the API layer.
 * Handles context assembly from database queries before delegating to the pure scorer.
 */
import { FraudScorer, type FraudScoringContext, type FraudScoringResult } from "@ad-alt/fraud";
import { db, devices } from "@ad-alt/database";
import { eq } from "@ad-alt/database";
import { getRedis } from "../redis.js";

const scorer = new FraudScorer();

export class FraudService {
  /**
   * Assembles full scoring context from Redis counters + DB device record,
   * then delegates to FraudScorer.scoreViewability / scoreClick / scoreImpression.
   */
  async buildContext(params: {
    deviceId: string;
    userId?: string;
    sessionId: string;
    sequenceNumber: number;
    displayedDurationMs?: number;
    lastClickAt?: Date;
    hasValidPriorImpression?: boolean;
  }): Promise<FraudScoringContext> {
    const redis = getRedis();
    const hourKey = `impressions:${params.deviceId}:${Math.floor(Date.now() / 3_600_000)}`;
    const impressionsInLastHour = parseInt((await redis.get(hourKey)) ?? "0", 10);

    const [device] = await db
      .select({ fraudScore: devices.fraudScore, isBlocked: devices.isBlocked })
      .from(devices)
      .where(eq(devices.deviceId, params.deviceId))
      .limit(1);

    const ctx: FraudScoringContext = {
      deviceId: params.deviceId,
      sessionId: params.sessionId,
      impressionsInLastHour,
      deviceIsBlocked: device?.isBlocked ?? false,
      deviceFraudScore: device?.fraudScore ?? 0,
      sequenceNumber: params.sequenceNumber,
    };
    if (params.userId !== undefined) ctx.userId = params.userId;
    if (params.displayedDurationMs !== undefined) ctx.displayedDurationMs = params.displayedDurationMs;
    if (params.lastClickAt !== undefined) ctx.lastClickAt = params.lastClickAt;
    if (params.hasValidPriorImpression !== undefined) ctx.hasValidPriorImpression = params.hasValidPriorImpression;
    return ctx;
  }

  async scoreViewability(params: {
    deviceId: string;
    userId?: string;
    sessionId: string;
    sequenceNumber: number;
    displayedDurationMs: number;
  }): Promise<FraudScoringResult> {
    const ctx = await this.buildContext(params);
    return scorer.scoreViewability(ctx);
  }

  async scoreClick(params: {
    deviceId: string;
    userId?: string;
    sessionId: string;
    sequenceNumber: number;
    hasValidPriorImpression: boolean;
    lastClickAt?: Date;
  }): Promise<FraudScoringResult> {
    const ctx = await this.buildContext(params);
    return scorer.scoreClick(ctx);
  }
}
