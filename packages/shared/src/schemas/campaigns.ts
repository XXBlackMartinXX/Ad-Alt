import { z } from "zod";
import { ADAPTER_ENUM_VALUES } from "./adapters.js";
import {
  CREATIVE_HEADLINE_MAX_LENGTH,
  CREATIVE_BODY_MAX_LENGTH,
  CREATIVE_DISPLAY_URL_MAX_LENGTH,
} from "../constants/index.js";

// ---------------------------------------------------------------------------
// Campaign schemas
// ---------------------------------------------------------------------------

export const CreateCampaignSchema = z.object({
  /** Human-readable name for the campaign */
  name: z.string().min(1).max(100).trim(),
  /** Total lifetime spend cap in microcents; minimum $1.00 */
  budgetMicrocents: z.number().int().min(1_000_000),
  /** Optional daily spend cap in microcents; minimum $0.50 */
  dailyBudgetMicrocents: z.number().int().min(500_000).optional(),
  /** Cost-per-1000-impressions bid in microcents; minimum $0.10 */
  cpmBidMicrocents: z.number().int().min(100_000),
  /** ISO 8601 datetime when the campaign should start serving ads */
  startAt: z.string().datetime().optional(),
  /** ISO 8601 datetime when the campaign should stop serving ads */
  endAt: z.string().datetime().optional(),
  /** Restrict delivery to specific extension adapters; absent = all adapters */
  targetAdapterNames: z.array(z.enum(ADAPTER_ENUM_VALUES)).optional(),
});

export const UpdateCampaignSchema = CreateCampaignSchema.partial();

// ---------------------------------------------------------------------------
// Creative schemas
// ---------------------------------------------------------------------------

export const CreateCreativeSchema = z.object({
  campaignId: z.string().uuid(),
  /** Short headline shown prominently in the status bar or webview */
  headline: z.string().min(1).max(CREATIVE_HEADLINE_MAX_LENGTH).trim(),
  /** Optional supporting copy shown below the headline */
  body: z.string().min(1).max(CREATIVE_BODY_MAX_LENGTH).trim().optional(),
  /** Truncated URL shown to the developer (not the destination) */
  displayUrl: z.string().min(1).max(CREATIVE_DISPLAY_URL_MAX_LENGTH).trim(),
  /**
   * Destination URL opened on click.
   * Must use HTTPS; stored server-side and never sent to the extension.
   */
  clickUrl: z.string().url().startsWith("https://").max(2048),
});

// ---------------------------------------------------------------------------
// Creative review schema (admin/finance use only)
// ---------------------------------------------------------------------------

export const ReviewCreativeSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  /** Optional explanation surfaced to the advertiser when rejected */
  reviewNote: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type CreateCampaign = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaign = z.infer<typeof UpdateCampaignSchema>;
export type CreateCreative = z.infer<typeof CreateCreativeSchema>;
export type ReviewCreative = z.infer<typeof ReviewCreativeSchema>;
