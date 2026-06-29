import {
  db,
  impressionEvents,
  clickEvents,
  eventDeduplicationKeys,
  adDeliveryDecisions,
  featureFlags,
} from "@ad-alt/database";
import { eq, and, gt } from "@ad-alt/database";
import { randomUUID } from "crypto";
import type {
  TelemetryEvent,
  ImpressionRequestedEvent,
  ImpressionRenderedEvent,
  ViewabilityEvent,
  ClickEvent,
} from "@ad-alt/shared";
import { FraudScorer } from "@ad-alt/fraud";
import { LedgerService } from "./ledger.service.js";
import { dedupCheck, getRedis } from "../redis.js";
import { logger } from "../middleware/logging.js";

type ProcessResult = { isDuplicate: boolean; fraudDecision?: string };

const fraudScorer = new FraudScorer();
const ledgerService = new LedgerService();

export class EventProcessor {
  /** Targeted flag check — queries only the three flag names relevant to this adapter. */
  private async isAdapterKillSwitched(adapterName: string): Promise<boolean> {
    const rows = await db.select().from(featureFlags);
    const map = Object.fromEntries(rows.map((f) => [f.name, f.isEnabled]));
    if (map["kill_switch_all_ads"]) return true;
    if (map[`disable_adapter_${adapterName}`]) return true;
    if (map[`kill_switch_${adapterName}`]) return true;
    return false;
  }

  async process(event: TelemetryEvent, userId: string): Promise<ProcessResult> {
    const dedupKey = `dedup:${event.eventId}`;

    // Fast-path dedup via Redis — 24h TTL.
    // Done first to avoid all DB work for duplicate events.
    const isNew = await dedupCheck(dedupKey, 86400);
    if (!isNew) {
      return { isDuplicate: true };
    }

    // Kill-switch check (cached — avoids per-event DB scan).
    // Redis key was already written by dedupCheck above; also write to DB so the
    // event cannot be replayed as a fresh event if the kill-switch is later lifted.
    if (await this.isAdapterKillSwitched(event.adapterName)) {
      await db
        .insert(eventDeduplicationKeys)
        .values({
          id: randomUUID(),
          key: event.eventId,
          eventType: event.eventType,
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400 * 1000),
        })
        .onConflictDoNothing();

      logger.warn({ adapterName: event.adapterName, msg: "event_adapter_kill_switched" });
      return { isDuplicate: false, fraudDecision: "adapter_disabled" };
    }

    // Persist dedup key to DB for durability (survives Redis restart)
    await db
      .insert(eventDeduplicationKeys)
      .values({
        id: randomUUID(),
        key: event.eventId,
        eventType: event.eventType,
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400 * 1000),
      })
      .onConflictDoNothing();

    switch (event.eventType) {
      case "impression_requested":
        return this.processImpressionRequested(event, userId);
      case "impression_rendered":
        return this.processImpressionRendered(event, userId);
      case "viewability_threshold_met":
        return this.processViewability(event, userId);
      case "click":
        return this.processClick(event, userId);
      default:
        return { isDuplicate: false };
    }
  }

  private async processImpressionRequested(
    event: ImpressionRequestedEvent,
    userId: string,
  ): Promise<ProcessResult> {
    // Verify the ad decision exists and hasn't expired
    const [decision] = await db
      .select()
      .from(adDeliveryDecisions)
      .where(
        and(
          eq(adDeliveryDecisions.id, event.adDecisionId),
          gt(adDeliveryDecisions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!decision) {
      logger.warn({
        adDecisionId: event.adDecisionId,
        msg: "impression_invalid_decision",
      });
      return { isDuplicate: false, fraudDecision: "invalid_decision" };
    }

    await db
      .insert(impressionEvents)
      .values({
        id: randomUUID(),
        idempotencyKey: event.eventId,
        adDecisionId: event.adDecisionId,
        campaignId: event.campaignId,
        creativeId: event.creativeId,
        deviceId: event.deviceId,
        userId,
        adapterName: event.adapterName,
        status: "requested",
        requestedAt: new Date(event.clientTimestamp),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    // Mark the decision as served
    await db
      .update(adDeliveryDecisions)
      .set({ wasServed: true })
      .where(eq(adDeliveryDecisions.id, event.adDecisionId));

    return { isDuplicate: false };
  }

  private async processImpressionRendered(
    event: ImpressionRenderedEvent,
    userId: string,
  ): Promise<ProcessResult> {
    await db
      .update(impressionEvents)
      .set({
        status: "rendered",
        renderedAt: new Date(event.renderedAt),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(impressionEvents.adDecisionId, event.adDecisionId),
          eq(impressionEvents.userId, userId),
        ),
      );

    return { isDuplicate: false };
  }

  private async processViewability(
    event: ViewabilityEvent,
    userId: string,
  ): Promise<ProcessResult> {
    // Read hourly impression counter from Redis for fraud rate-limit signal
    const redis = getRedis();
    const hourKey = `impressions:${event.deviceId}:${Math.floor(Date.now() / 3_600_000)}`;
    const impressionsInLastHour = parseInt((await redis.get(hourKey)) ?? "0", 10);

    const fraudCtx = {
      deviceId: event.deviceId,
      userId,
      sessionId: event.sessionId,
      impressionsInLastHour,
      deviceIsBlocked: false,
      deviceFraudScore: 0,
      displayedDurationMs: event.displayedDurationMs,
      sequenceNumber: event.sequenceNumber,
    };

    const fraudResult = fraudScorer.scoreViewability(fraudCtx);

    // Only update impressions in "rendered" state — enforces the lifecycle invariant:
    // requested → rendered → viewability_threshold_met → billable/viewable/fraud_blocked
    if (fraudResult.decision === "block") {
      await db
        .update(impressionEvents)
        .set({
          status: "fraud_blocked",
          fraudScore: fraudResult.totalScore,
          fraudSignals: fraudResult.signals as unknown as Record<string, unknown>[],
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(impressionEvents.adDecisionId, event.adDecisionId),
            eq(impressionEvents.userId, userId),
            eq(impressionEvents.status, "rendered"),
          ),
        );

      logger.warn({
        adDecisionId: event.adDecisionId,
        fraudScore: fraudResult.totalScore,
        msg: "impression_fraud_blocked",
      });
      return { isDuplicate: false, fraudDecision: "blocked" };
    }

    const newStatus = fraudResult.decision === "review" ? "viewable" : "billable";
    const now = new Date();

    const [impression] = await db
      .update(impressionEvents)
      .set({
        status: newStatus,
        viewableAt: now,
        billableAt: fraudResult.decision === "pass" ? now : null,
        displayedDurationMs: event.displayedDurationMs,
        fraudScore: fraudResult.totalScore,
        fraudSignals: fraudResult.signals as unknown as Record<string, unknown>[],
        updatedAt: now,
      })
      .where(
        and(
          eq(impressionEvents.adDecisionId, event.adDecisionId),
          eq(impressionEvents.userId, userId),
          eq(impressionEvents.status, "rendered"),
        ),
      )
      .returning();

    if (!impression) {
      // Impression not in "rendered" state — lifecycle invariant violated; silently drop
      logger.warn({
        adDecisionId: event.adDecisionId,
        msg: "viewability_without_rendered_impression",
      });
      return { isDuplicate: false, fraudDecision: "invalid_state" };
    }

    // Increment hourly counter only for impressions that passed fraud scoring
    const pipeline = redis.pipeline();
    pipeline.incr(hourKey);
    pipeline.expire(hourKey, 3600, "NX");
    await pipeline.exec();

    // If billable, create ledger entries
    if (fraudResult.decision === "pass") {
      await ledgerService.recordImpression(
        impression.id,
        impression.campaignId,
        userId,
      );
    }

    return { isDuplicate: false, fraudDecision: fraudResult.decision };
  }

  private async processClick(
    event: ClickEvent,
    userId: string,
  ): Promise<ProcessResult> {
    // Require a valid prior billable impression before recording the click
    const [impression] = await db
      .select()
      .from(impressionEvents)
      .where(
        and(
          eq(impressionEvents.adDecisionId, event.adDecisionId),
          eq(impressionEvents.userId, userId),
        ),
      )
      .limit(1);

    const hasValidPriorImpression =
      impression?.status === "billable" || impression?.status === "reconciled";

    const redis = getRedis();
    const hourKey = `impressions:${event.deviceId}:${Math.floor(Date.now() / 3_600_000)}`;
    const impressionsInLastHour = parseInt((await redis.get(hourKey)) ?? "0", 10);

    const fraudResult = fraudScorer.scoreClick({
      deviceId: event.deviceId,
      userId,
      sessionId: event.sessionId,
      impressionsInLastHour,
      deviceIsBlocked: false,
      deviceFraudScore: 0,
      hasValidPriorImpression,
      sequenceNumber: event.sequenceNumber,
    });

    // Cannot insert a click without a valid impression (FK constraint)
    if (!impression) {
      logger.warn({
        adDecisionId: event.adDecisionId,
        msg: "click_without_impression",
      });
      return { isDuplicate: false, fraudDecision: "no_impression" };
    }

    const status: "pending" | "billable" | "fraud_blocked" =
      fraudResult.decision === "block"
        ? "fraud_blocked"
        : fraudResult.decision === "review"
          ? "pending"
          : "billable";

    const [click] = await db
      .insert(clickEvents)
      .values({
        id: randomUUID(),
        idempotencyKey: event.eventId,
        impressionEventId: impression.id,
        adDecisionId: event.adDecisionId,
        campaignId: impression.campaignId,
        creativeId: event.creativeId,
        deviceId: event.deviceId,
        userId,
        status,
        clickedAt: new Date(event.clientTimestamp),
        fraudScore: fraudResult.totalScore,
        fraudSignals: fraudResult.signals as unknown as Record<string, unknown>[],
        createdAt: new Date(),
      })
      .returning()
      .onConflictDoNothing();

    if (fraudResult.decision === "pass" && click) {
      await ledgerService.recordClick(click.id, impression.campaignId, userId);
    }

    return { isDuplicate: false, fraudDecision: fraudResult.decision };
  }
}
