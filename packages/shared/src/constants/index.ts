/** Milliseconds an ad must be visible to count as a billable impression */
export const IMPRESSION_VIEWABILITY_THRESHOLD_MS = 5000;

/** Minimum milliseconds before an impression is considered at all */
export const IMPRESSION_MIN_THRESHOLD_MS = 3000;

/** Minimum seconds that must pass between clicks from the same device */
export const CLICK_RATE_LIMIT_SECONDS = 30;

/** Maximum number of impression requests allowed per hour per device */
export const MAX_IMPRESSIONS_PER_HOUR = 60;

/** Maximum character length for a creative headline */
export const CREATIVE_HEADLINE_MAX_LENGTH = 80;

/** Maximum character length for a creative body copy */
export const CREATIVE_BODY_MAX_LENGTH = 140;

/** Maximum character length for a creative display URL */
export const CREATIVE_DISPLAY_URL_MAX_LENGTH = 50;

/** Hours to keep deduplication keys before cleanup */
export const DEDUP_WINDOW_HOURS = 24;

/** Percentage of ad revenue retained by the platform */
export const PLATFORM_FEE_PERCENT = 40;

/** Percentage of ad revenue credited to the developer */
export const DEVELOPER_SHARE_PERCENT = 60;

/** Number of microcents per US dollar (1 USD = 1,000,000 microcents) */
export const MICROCENTS_PER_DOLLAR = 1_000_000;

/** Current REST API version prefix */
export const API_VERSION = "v1";

/** Minimum extension version that the backend will accept events from */
export const EXTENSION_VERSION_MIN_SUPPORTED = "0.1.0";
