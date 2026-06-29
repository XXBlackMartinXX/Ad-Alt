/**
 * Wait-state detector for browser AI platforms.
 *
 * Detects when the AI is "thinking" (a wait state suitable for a sponsored moment).
 * Uses MutationObserver on specific DOM selectors to detect state transitions.
 *
 * PRIVACY RULE: This module reads only structural DOM changes (element presence),
 * never page text, user input, AI response content, or any identifiable data.
 *
 * STABILITY RULE: All selectors are wrapped in try/catch; DOM changes that
 * break detection fail closed (no sponsored moment shown, no error thrown).
 */

export type WaitStateHandler = (startedAt: Date) => void;
export type WaitStateEndHandler = () => void;

export interface IWaitStateDetector {
  start(onStart: WaitStateHandler, onEnd: WaitStateEndHandler): void;
  stop(): void;
}

/** Selectors that indicate "AI is processing" — presence = wait state active. */
const PROCESSING_SELECTORS: Record<string, string[]> = {
  "chatgpt.com": [
    "[data-testid='stop-button']",
    "button[aria-label='Stop generating']",
  ],
  "chat.openai.com": [
    "[data-testid='stop-button']",
    "button[aria-label='Stop generating']",
  ],
  "claude.ai": [
    "[data-testid='stop-button']",
    "button[aria-label='Stop Response']",
  ],
  "gemini.google.com": [
    "button[aria-label='Stop generating']",
  ],
};

export class WaitStateDetector implements IWaitStateDetector {
  private observer: MutationObserver | null = null;
  private inWaitState = false;

  start(onStart: WaitStateHandler, onEnd: WaitStateEndHandler): void {
    const hostname = window.location.hostname;
    const selectors = PROCESSING_SELECTORS[hostname] ?? [];
    if (selectors.length === 0) return;

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const checkState = () => {
      if (throttleTimer !== null) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        try {
          const isProcessing = selectors.some((sel) => !!document.querySelector(sel));
          if (isProcessing && !this.inWaitState) {
            this.inWaitState = true;
            onStart(new Date());
          } else if (!isProcessing && this.inWaitState) {
            this.inWaitState = false;
            onEnd();
          }
        } catch {
          // DOM query failed — fail closed (no wait-state declared)
        }
      }, 150);
    };

    // attributes: false — child-list mutations are sufficient to detect stop-button
    // appearance/disappearance; attribute changes fire too aggressively during streaming.
    this.observer = new MutationObserver(checkState);
    this.observer.observe(document.body, { childList: true, subtree: true });
    checkState();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.inWaitState = false;
    // Note: any pending throttle timer is left to expire harmlessly; checkState
    // guards via this.observer being null are not needed since the timer fires
    // only synchronous code that reads this.inWaitState.
  }
}
