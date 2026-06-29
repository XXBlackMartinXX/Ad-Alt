import type { AllowedAdapterId } from "@ad-alt/platform-core";

export type DetectedPlatform = {
  adapterId: AllowedAdapterId;
  platformName: string;
};

/**
 * Maps a hostname to the platform it corresponds to.
 * Accepts hostname as a parameter so it can be tested without a DOM.
 * Uses only the document origin — never reads page content, DOM text, or cookies.
 */
export function detectPlatformFromHostname(hostname: string): DetectedPlatform | null {
  if (hostname === "chatgpt.com" || hostname === "chat.openai.com") {
    return { adapterId: "browser_chatgpt", platformName: "ChatGPT" };
  }
  if (hostname === "claude.ai") {
    return { adapterId: "browser_claude", platformName: "Claude" };
  }
  if (hostname === "gemini.google.com") {
    return { adapterId: "browser_gemini", platformName: "Gemini" };
  }
  return null;
}

/** Detects the current platform from the live browser URL. */
export function detectPlatform(): DetectedPlatform | null {
  return detectPlatformFromHostname(window.location.hostname);
}
