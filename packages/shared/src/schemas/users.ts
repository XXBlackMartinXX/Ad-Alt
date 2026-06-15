import { z } from "zod";

// ---------------------------------------------------------------------------
// Developer opt-in schema
// ---------------------------------------------------------------------------

export const DevOptiInSchema = z.object({
  /** ISO 8601 datetime when the developer accepted the consent agreement */
  consentGivenAt: z.string().datetime(),
  /**
   * Version identifier of the consent text that was presented to the user,
   * e.g. "1.0" or "2024-01".  Stored so we can re-prompt if the text changes.
   */
  consentVersion: z.string(),
});

// ---------------------------------------------------------------------------
// Developer profile update schema
// ---------------------------------------------------------------------------

export const UpdateDeveloperProfileSchema = z.object({
  /** Email address to which Stripe payouts should be sent */
  payoutEmail: z.string().email().optional(),
  /** Preferred wait-state adapter (excludes "manual" which is test-only) */
  preferredAdapterName: z
    .enum(["copilot_status", "ai_status_bar", "mock"])
    .optional(),
  /** Where the ad creative should be rendered in VS Code */
  displaySurface: z.enum(["status_bar", "webview"]).optional(),
});

// ---------------------------------------------------------------------------
// Advertiser profile update schema
// ---------------------------------------------------------------------------

export const UpdateAdvertiserProfileSchema = z.object({
  companyName: z.string().min(1).max(100).trim().optional(),
  /** Must use HTTPS */
  website: z.string().url().startsWith("https://").optional(),
  /** Email address for Stripe invoices and billing notices */
  billingEmail: z.string().email().optional(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type DevOptIn = z.infer<typeof DevOptiInSchema>;
export type UpdateDeveloperProfile = z.infer<typeof UpdateDeveloperProfileSchema>;
export type UpdateAdvertiserProfile = z.infer<typeof UpdateAdvertiserProfileSchema>;
