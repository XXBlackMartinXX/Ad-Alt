import {
  db,
  campaigns,
  creatives,
  adDeliveryDecisions,
} from "@ad-alt/database";
import { eq, and, gt, lte, or, isNull, desc } from "@ad-alt/database";
import { randomUUID } from "crypto";

type AdDecision = {
  adDecisionId: string;
  campaignId: string;
  creativeId: string;
  headline: string;
  body: string | null;
  displayUrl: string;
  cpmBidMicrocents: string;
  expiresAt: string;
};

export class AdDecisionService {
  async selectAd(params: {
    deviceId: string;
    adapterName: string;
    userId?: string;
    extensionVersion: string;
  }): Promise<AdDecision | null> {
    const now = new Date();
    // Decision valid for 30 seconds — extension must render before it expires
    const expiresAt = new Date(now.getTime() + 30_000);

    // Select the highest-bid active campaign that has an approved creative.
    // Excludes campaigns with exhausted budgets.
    const [result] = await db
      .select({
        campaignId: campaigns.id,
        advertiserId: campaigns.advertiserId,
        cpmBidMicrocents: campaigns.cpmBidMicrocents,
        creativeId: creatives.id,
        headline: creatives.headline,
        body: creatives.body,
        displayUrl: creatives.displayUrl,
      })
      .from(campaigns)
      .innerJoin(
        creatives,
        and(
          eq(creatives.campaignId, campaigns.id),
          eq(creatives.status, "approved"),
        ),
      )
      .where(
        and(
          eq(campaigns.status, "active"),
          gt(campaigns.budgetMicrocents, campaigns.spentMicrocents),
          or(isNull(campaigns.startAt), lte(campaigns.startAt, now)),
          or(isNull(campaigns.endAt), gt(campaigns.endAt, now)),
        ),
      )
      .orderBy(desc(campaigns.cpmBidMicrocents))
      .limit(1);

    if (!result) return null;

    const decisionId = randomUUID();

    await db.insert(adDeliveryDecisions).values({
      id: decisionId,
      campaignId: result.campaignId,
      creativeId: result.creativeId,
      deviceId: params.deviceId,
      userId: params.userId ?? null,
      adapterName: params.adapterName,
      cpmBidMicrocents: result.cpmBidMicrocents,
      decidedAt: now,
      expiresAt,
      wasServed: false,
    });

    return {
      adDecisionId: decisionId,
      campaignId: result.campaignId,
      creativeId: result.creativeId,
      headline: result.headline,
      body: result.body,
      displayUrl: result.displayUrl,
      cpmBidMicrocents: String(result.cpmBidMicrocents),
      expiresAt: expiresAt.toISOString(),
    };
  }
}
