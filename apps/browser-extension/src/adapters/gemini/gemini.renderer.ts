/**
 * Gemini sponsored moment renderer.
 *
 * Renders a non-invasive fixed-position banner in the bottom-right of the
 * viewport. All styles are inline to avoid interference with the host
 * page's CSS. Structurally identical to ChatGPTRenderer/ClaudeRenderer —
 * kept as a separate per-platform file (rather than shared) so future
 * platform-specific positioning/styling needs do not require touching
 * another platform's renderer.
 *
 * UX RULES (non-negotiable):
 * - Clearly labeled "PromptProfit · Sponsored"
 * - Always has a visible close button
 * - Does not cover the prompt input or AI response content
 * - Does not block scrolling or user interaction
 * - Position is fixed and does not reflow page content
 *
 * PRIVACY RULE: Only renders content from the SponsoredMoment argument (backend-
 * provided data). Never reads or displays DOM content, user data, or page text.
 */

import type { SponsoredMoment } from "@ad-alt/platform-core";

export interface IGeminiRenderer {
  /**
   * @param onClose Optional callback fired ONLY when the user clicks the
   *   close (X) button — distinct from remove(), which is also called when
   *   the wait-state ends. Never receives any moment/page data — a
   *   no-argument signal only.
   */
  render(moment: SponsoredMoment, onClose?: () => void): void;
  remove(): void;
  getElement(): Element | null;
}

const CONTAINER_ID = "promptprofit-sponsored-banner";

export class GeminiRenderer implements IGeminiRenderer {
  private container: HTMLElement | null = null;

  render(moment: SponsoredMoment, onClose?: () => void): void {
    this.remove();

    if (typeof document === "undefined") return;
    if (Date.now() > moment.expiresAt) return;
    if (!moment.headline || moment.headline.length > 80) return;
    if (moment.body && moment.body.length > 140) return;
    if (!moment.displayUrl) return;

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.setAttribute("role", "complementary");
    container.setAttribute("aria-label", "PromptProfit Sponsored Moment");
    container.style.cssText = [
      "position:fixed",
      "bottom:90px",
      "right:16px",
      "width:284px",
      "background:#ffffff",
      "border:1px solid #e5e7eb",
      "border-radius:8px",
      "box-shadow:0 2px 12px rgba(0,0,0,0.10)",
      "padding:12px 14px",
      "z-index:2147483647",
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "font-size:13px",
      "line-height:1.45",
      "color:#111827",
      "box-sizing:border-box",
    ].join(";");

    const closeBtn = document.createElement("button");
    closeBtn.setAttribute("aria-label", "Dismiss sponsored moment");
    closeBtn.textContent = "×"; // ×
    closeBtn.style.cssText = [
      "position:absolute",
      "top:8px",
      "right:10px",
      "background:none",
      "border:none",
      "cursor:pointer",
      "font-size:16px",
      "line-height:1",
      "color:#9ca3af",
      "padding:0",
      "width:20px",
      "height:20px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");
    closeBtn.addEventListener("click", () => {
      this.remove();
      onClose?.();
    });

    const sponsorLabel = document.createElement("div");
    sponsorLabel.textContent = "PromptProfit · Sponsored"; // ·
    sponsorLabel.style.cssText = [
      "font-size:10px",
      "font-weight:600",
      "color:#6b7280",
      "letter-spacing:0.05em",
      "text-transform:uppercase",
      "margin-bottom:6px",
      "padding-right:24px",
    ].join(";");

    const headline = document.createElement("div");
    headline.textContent = moment.headline;
    headline.style.cssText = [
      "font-weight:600",
      "font-size:14px",
      "margin-bottom:4px",
      "padding-right:4px",
    ].join(";");

    container.appendChild(closeBtn);
    container.appendChild(sponsorLabel);
    container.appendChild(headline);

    if (moment.body) {
      const body = document.createElement("div");
      body.textContent = moment.body;
      body.style.cssText = "color:#374151;margin-bottom:6px";
      container.appendChild(body);
    }

    const displayUrl = document.createElement("div");
    displayUrl.textContent = moment.displayUrl;
    displayUrl.style.cssText = "color:#059669;font-size:12px;margin-top:2px";
    container.appendChild(displayUrl);

    document.body.appendChild(container);
    this.container = container;
  }

  remove(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    } else if (typeof document !== "undefined") {
      document.getElementById(CONTAINER_ID)?.remove();
    }
  }

  getElement(): Element | null {
    return this.container;
  }
}
