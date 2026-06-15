import { z } from "zod";

// ---------------------------------------------------------------------------
// Standard API error envelope
// ---------------------------------------------------------------------------

export const ApiErrorSchema = z.object({
  /** Machine-readable error category, e.g. "validation_error" */
  error: z.string(),
  /** Human-readable explanation of the error */
  message: z.string(),
  /** Optional application-level error code for client-side branching */
  code: z.string().optional(),
  /** Request ID for correlating with server-side logs */
  requestId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Pagination query parameters
// ---------------------------------------------------------------------------

export const PaginationSchema = z.object({
  /** 1-based page number */
  page: z.coerce.number().int().min(1).default(1),
  /** Items per page; capped at 100 */
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Generic success envelope factory
// ---------------------------------------------------------------------------

/**
 * Wraps any Zod schema in the standard `{ data, requestId }` success envelope.
 *
 * @example
 * const CampaignResponseSchema = ApiSuccessSchema(CampaignSchema);
 */
export function ApiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    /** Request ID for correlating with server-side logs */
    requestId: z.string().optional(),
  });
}

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
