/**
 * ChatGPT DOM selectors used by the wait-state detector.
 *
 * PRIVACY RULE: No selector reads text content, input values, response content,
 * or any user-derived data. Only structural presence/absence is detected.
 *
 * STABILITY RULE: All selectors use data-testid or aria-label attributes.
 * These are structural/accessibility attributes that tend to be more stable
 * than CSS class names, but may still change during major ChatGPT UI revisions.
 * If a selector stops matching, detection fails closed — no sponsored moment shown.
 */

/**
 * Selectors that indicate "AI is generating" on ChatGPT.
 * Presence of any one of these = wait state is active.
 *
 * STABILITY RISK (high): OpenAI changes data-testid values across UI releases.
 * STABILITY RISK (medium): aria-label text may be localized or changed.
 */
export const CHATGPT_PROCESSING_SELECTORS = [
  "[data-testid='stop-button']",           // Primary: stop button appears during generation
  "button[aria-label='Stop generating']",  // Fallback: explicit aria label
] as const;

/**
 * Hostnames where the ChatGPT adapter should activate.
 * Only exact hostname matches are accepted — no subdomain wildcards.
 *
 * "www.chatgpt.com" is included defensively: OpenAI does not currently serve
 * ChatGPT there (chatgpt.com is canonical), but matching it costs nothing if
 * it's never visited, and protects against it being used in the future or by
 * some intermediate redirect/proxy a tester's network applies.
 */
export const CHATGPT_HOSTNAMES = [
  "chatgpt.com",
  "www.chatgpt.com",
  "chat.openai.com",
] as const;

export type ChatGPTHostname = (typeof CHATGPT_HOSTNAMES)[number];
