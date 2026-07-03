/**
 * Claude-specific wait-state detector.
 *
 * Uses MutationObserver on structural DOM selectors to detect when Claude
 * begins or ends generating a response. Fires callbacks for wait-state
 * transitions only — never reads page content, user input, or response text.
 *
 * PRIVACY RULE: Only element presence/absence is observed. textContent,
 * innerText, value, and all data attributes are never read.
 *
 * STABILITY RULE: If MutationObserver is unavailable or document.body is null,
 * the detector is a no-op (fails closed — no sponsored moment shown).
 *
 * VERIFICATION STATUS: The underlying selectors (claude.selectors.ts) are
 * UNVERIFIED against real claude.ai. This detector's logic itself mirrors
 * ChatGPTWaitStateDetector (proven, verified) exactly — only the selector
 * source differs.
 */

import { CLAUDE_PROCESSING_SELECTORS } from "./claude.selectors.js";

export interface IClaudeWaitStateDetector {
  start(onStart: (startedAt: Date) => void, onEnd: () => void): void;
  stop(): void;
}

export class ClaudeWaitStateDetector implements IClaudeWaitStateDetector {
  private observer: MutationObserver | null = null;
  private inWaitState = false;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;

  start(onStart: (startedAt: Date) => void, onEnd: () => void): void {
    if (typeof MutationObserver === "undefined") return;
    if (typeof document === "undefined" || !document.body) return;

    const selectors = [...CLAUDE_PROCESSING_SELECTORS];

    const checkState = () => {
      if (this.throttleTimer !== null) return;
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
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

    this.observer = new MutationObserver(checkState);
    this.observer.observe(document.body, { childList: true, subtree: true });
    checkState();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.inWaitState = false;
    // throttleTimer is left to expire harmlessly
  }
}
