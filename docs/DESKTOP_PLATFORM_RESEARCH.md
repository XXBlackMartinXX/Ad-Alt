# Desktop Platform Research — Phase 4 Cross-Platform Expansion

> **Status:** Research and design document. Pre-implementation.
> No desktop platform is cleared for implementation until an entry below is marked "MVP Ready."
> All conclusions here are subject to revision as vendor APIs evolve.

> **Document scope:** This document covers Phase 4 desktop-platform targets only:
> ChatGPT desktop, Claude desktop, Gemini, and Antigravity AI.
> For browser-based coverage of ChatGPT, Claude, and Gemini, see `CROSS_PLATFORM_STRATEGY.md` (Phase 3 browser extension).

---

## 1. Background and Context

PromptProfit's MVP ships as a VS Code extension using stable VS Code extension APIs to detect AI wait-states without reading any user content. The next expansion targets the broader AI desktop tool ecosystem.

The core constraint — never observe, capture, or transmit prompt text, response text, screen content, clipboard data, or any user-identifiable content — applies with equal force to desktop platforms. Because desktop apps do not inherently offer the sandboxed, permission-scoped API surface of VS Code or a browser extension, the risk profile for each platform must be evaluated independently before any implementation work begins.

A "safe" integration means: PromptProfit can detect the timing of a wait-state (AI is processing, user is idle) using a signal that carries no content, and can render a sponsored message in a clearly labeled, non-intrusive surface. Nothing else.

---

## 2. Platform Analyses

---

### 2.1 ChatGPT Desktop (Windows / macOS)

#### 2.1.1 Architecture

ChatGPT desktop (released by OpenAI for macOS in 2024 and Windows in 2025) is an **Electron-based application**. Electron bundles a Chromium web renderer and a Node.js runtime into a native executable wrapper. The visible UI is rendered in a Chromium process; the shell is a thin native wrapper that provides OS integration (system tray, global hotkeys, notifications).

This is an important architectural fact: the rendered chat interface is effectively a web page running inside a controlled Chromium instance, not a native UI built with system widgets.

#### 2.1.2 Official Extension / Plugin Mechanism

As of mid-2026, **OpenAI has not released an official plugin or extension API for the ChatGPT desktop application.** There is no documented mechanism for third-party code to:

- Register a plugin with the desktop app
- Inject UI into the app's surfaces
- Subscribe to app-level events (conversation start, AI streaming state, idle)

The ChatGPT Plugin ecosystem that existed briefly in 2023 was a server-side "tool use" mechanism exposed through the web interface, not a desktop UI extension point. It was deprecated by OpenAI in favor of the GPT Store and custom GPTs. Neither of those mechanisms provides a client-side desktop extension API.

**Conclusion:** No official extension mechanism exists for ChatGPT desktop as of this writing.

#### 2.1.3 Electron App — Browser Extension Coverage

Because ChatGPT desktop is Electron-based, a natural question is: can a browser extension installed in the user's system Chrome/Firefox browser reach the Electron-rendered surface?

**No.** Browser extensions (Manifest V3 content scripts) run inside the user's browser profile. The Electron app runs its own embedded Chromium instance that is entirely separate from the user's browser. Extensions installed in Chrome or Firefox do not run inside a distinct Electron process; the two Chromium instances have no shared extension context, no shared DOM, and no IPC channel.

Some Electron apps deliberately expose a DevTools extension loading mechanism via `BrowserWindow.addDevToolsExtension()` or the newer `session.loadExtension()` API. Whether ChatGPT desktop exposes this is not publicly documented. Even if it did, relying on it would be:

- Undocumented and unsupported (brittle, likely to break on app updates)
- Potentially a violation of OpenAI's Terms of Service
- Not equivalent to an official extension API

**Conclusion:** A browser extension cannot cover ChatGPT desktop through any safe, documented mechanism.

#### 2.1.4 Approaches to Avoid

The following approaches are **explicitly forbidden** for PromptProfit regardless of technical feasibility:

| Approach | Why Forbidden |
|----------|---------------|
| Screen scraping / pixel capture | Captures screen content including response text |
| OCR on the app window | Captures visible text including prompts and responses |
| Screenshot capture | Captures full user conversation |
| Accessibility API to read text content | Reads on-screen text; equivalent to screen scraping |
| Process memory inspection | Reads conversation data from memory |
| Clipboard monitoring | May capture prompt/response content |
| XHR/fetch interception in the Electron renderer | Intercepts prompt and response network traffic |
| UI automation (clicking, typing) | Unauthorized interaction with the app |

Note on accessibility APIs specifically: macOS Accessibility (AXUIElement) and Windows UI Automation can be used narrowly to detect window focus changes and app foreground state at a timing level. However, any use that reads text content from the app's accessibility tree — including button labels in the AI response area, text field content, or any DOM-visible text — is forbidden under PromptProfit's privacy model. The distinction between "app is in foreground" (timing signal only, acceptable in principle) and "what text is on screen" (content signal, forbidden) must be rigorously maintained in any implementation design.

#### 2.1.5 Local Companion App Requirement

Because there is no browser extension path and no official plugin API, any safe desktop integration would require a **local companion app** — a native process running alongside the ChatGPT desktop app that communicates with PromptProfit's backend and renders sponsored messages via its own native window.

A local companion app could use OS-level APIs to detect:
- Window focus changes (is the ChatGPT window in the foreground? — timing only)
- App active/inactive transitions (timing only)

These signals alone are insufficient to detect AI wait-states with acceptable accuracy. Without a signal indicating that the AI is processing (as opposed to the user simply leaving the app idle), false positives would be high and impression quality would be low. A companion app without a reliable processing signal is not viable.

**Conclusion:** A local companion app is technically possible but insufficient without a processing-state signal. No implementation should proceed.

#### 2.1.6 Terms of Service / Legal Risk

OpenAI's Terms of Service (as of mid-2026) restrict automated access and instrumentation of their products. The desktop app is a product of OpenAI and is subject to their ToS. Without an official extension API that explicitly permits third-party integrations, any technical hook into the desktop app carries **HIGH legal risk** regardless of the technical approach.

#### 2.1.7 Recommended Action

**Delay. Block implementation until OpenAI ships an official desktop extension API.**

Monitor OpenAI developer communications for any announcement of a desktop plugin or extension mechanism. If a safe, officially-sanctioned API becomes available, re-evaluate at that time.

#### 2.1.8 Ratings

| Dimension | Rating | Notes |
|-----------|--------|-------|
| MVP Feasibility | NOT FEASIBLE | No official extension API; no safe signal path |
| Privacy Risk | HIGH | Any technical approach requires invasive signals |
| Brittleness Risk | CRITICAL | No documented, stable API to build against |
| Legal / ToS Risk | HIGH | No official extension mechanism; ToS restricts instrumentation |

---

### 2.2 Claude Desktop (Windows / macOS)

#### 2.2.1 Architecture

Claude desktop (published by Anthropic) is also an **Electron-based application**, consistent with Anthropic's engineering patterns for cross-platform distribution. Like ChatGPT desktop, the rendered UI is a Chromium web renderer inside a native Electron shell.

#### 2.2.2 Official Extension / Plugin Mechanism

As of mid-2026, **Anthropic has not released an official UI extension or plugin API for the Claude desktop application.** There is no mechanism for third-party code to:

- Register a UI plugin
- Inject overlays or supplementary panels into the desktop UI
- Subscribe to conversation lifecycle events from the desktop app

#### 2.2.3 Model Context Protocol (MCP) — Scope Clarification

Claude desktop does support the **Model Context Protocol (MCP)**. MCP is an open protocol that allows AI models to call external tools and access external data sources. It is a **server-side tool-use mechanism** — it gives Claude the ability to invoke external tools during inference, such as querying a database, reading a file, or calling an API.

MCP is **not** a UI extension mechanism. It does not:
- Allow third-party code to inject UI into the Claude desktop window
- Provide events about the desktop app's rendering state or streaming state
- Give access to the desktop app's Electron shell or its Chromium renderer

MCP is out of scope for PromptProfit's wait-state detection and sponsored message rendering use case. Do not conflate MCP with a desktop extension API.

#### 2.2.4 Electron App — Browser Extension Coverage

The same analysis applies as for ChatGPT desktop. Claude desktop runs its own embedded Chromium instance, separate from the user's browser. Browser extensions installed in Chrome or Firefox do not execute inside the Claude desktop Electron process.

**Conclusion:** A browser extension cannot cover Claude desktop through any safe, documented mechanism.

#### 2.2.5 Approaches to Avoid

All approaches listed in section 2.1.4 are equally forbidden for Claude desktop. Anthropic's privacy commitments and the sensitivity of conversations in Claude are additional reasons to be strict here. Any approach that could read conversation content — including accessibility API text extraction, screen capture, or process memory — is categorically off the table.

#### 2.2.6 Local Companion App Requirement

Same analysis as ChatGPT desktop (section 2.1.5). A local companion app with OS-level window focus signals cannot reliably detect AI processing state without a content-bearing signal. Not viable in isolation.

Additionally, if Anthropic ever does release an official extension mechanism, it is far more likely to surface as an MCP server capability or a Claude.ai web-based plugin than as a desktop UI extension point. The desktop app's architecture does not suggest a plugin hosting surface is planned.

#### 2.2.7 Terms of Service / Legal Risk

Anthropic's Terms of Service restrict unauthorized automation and instrumentation of their products. The desktop app is subject to Anthropic's ToS. Without an official extension mechanism, the legal risk is **HIGH**.

#### 2.2.8 Recommended Action

**Delay. Block implementation until Anthropic ships an official desktop UI extension API.**

Monitor Anthropic developer communications. Watch specifically for:
- Any announcement of a Claude desktop plugin or extension system
- Any expansion of MCP to include UI extension capabilities (currently not planned)

#### 2.2.9 Ratings

| Dimension | Rating | Notes |
|-----------|--------|-------|
| MVP Feasibility | NOT FEASIBLE | No official extension API; no safe signal path |
| Privacy Risk | HIGH | Any technical approach requires invasive signals |
| Brittleness Risk | CRITICAL | No documented, stable API to build against |
| Legal / ToS Risk | HIGH | No official extension mechanism; ToS restricts instrumentation |

---

### 2.3 Gemini (Google)

#### 2.3.1 Architecture

As of mid-2026, **Google has not shipped a standalone Gemini desktop application.** Gemini is available as:

- A web interface at gemini.google.com
- An API (Google AI Studio, Vertex AI)
- Integration inside Google Workspace products (Docs, Gmail, Slides, etc.)
- Mobile apps (Android, iOS)

There is no official Gemini-branded desktop app for Windows or macOS comparable to ChatGPT desktop or Claude desktop.

#### 2.3.2 Browser Extension Coverage

Because Gemini has no desktop app, **browser-based coverage is the correct and sufficient approach.** A Manifest V3 browser extension with a content script running on `gemini.google.com` can observe structural DOM signals (streaming indicator presence, loading spinner visibility) without reading any text content.

This is already accounted for in Phase 3 of the cross-platform strategy. See `CROSS_PLATFORM_STRATEGY.md` section 4.2 and the platform support matrix for the browser-based Gemini adapter.

#### 2.3.3 Desktop Platform Research Finding

There is no desktop platform to research for Gemini at this time. If Google ships a Gemini desktop app in the future, it should be evaluated at that time using the same framework applied to ChatGPT desktop and Claude desktop above.

#### 2.3.4 Approaches to Avoid

For completeness: the same forbidden approaches apply in the event a Gemini desktop app is released in the future. The Gemini web integration inside Google Workspace (e.g., the "Help me write" panel in Google Docs) should not be instrumented through accessibility APIs or any content-reading mechanism.

#### 2.3.5 Recommended Action

**No action needed for desktop.** Gemini is covered by the Phase 3 browser extension. No desktop-specific research, implementation, or local companion app is required.

If Google announces a standalone Gemini desktop app, open a new research task and apply this framework.

#### 2.3.6 Ratings

| Dimension | Rating | Notes |
|-----------|--------|-------|
| MVP Feasibility | N/A (no desktop app) | Covered by browser extension in Phase 3 |
| Privacy Risk | N/A | Browser extension path applies |
| Brittleness Risk | N/A | |
| Legal / ToS Risk | N/A | |

---

### 2.4 Antigravity AI

#### 2.4.1 What Is Known

Antigravity AI is a relatively new AI tool as of mid-2026. Specific details about its distribution model (web-only, native desktop app, Electron-based, cross-platform) and its plugin or extension mechanism are **not confirmed at the time of this writing.**

This is the honest starting point. Do not assume Antigravity follows the same pattern as ChatGPT or Claude desktop until confirmed.

#### 2.4.2 Research Required

Before any integration design can proceed, the following questions must be answered through direct research:

1. **Distribution:** Is Antigravity a web app, an Electron app, a native macOS/Windows app, a VS Code extension, or some other surface?
2. **Extension mechanism:** Does Antigravity have an official plugin, extension, or integration API? If so, what does it expose — is it a UI extension point, a tool-use / MCP-style API, or something else?
3. **Terms of Service:** Do Antigravity's Terms of Service permit third-party extensions or integrations?
4. **Web renderer:** If it is Electron-based, does it expose any official extension loading surface?
5. **Update frequency:** How actively is the product maintained, and what is the risk of API-breaking changes?

Research sources to consult:
- Antigravity's official developer documentation (if public)
- Antigravity's Terms of Service and API terms
- Public announcements or changelog entries related to plugins, extensions, or integrations
- Community forums or developer discussions

#### 2.4.3 Approaches to Avoid (Regardless of Architecture)

Regardless of what research reveals about Antigravity's architecture, all forbidden approaches from section 2.1.4 apply. If the only available integration path requires screen scraping, OCR, clipboard monitoring, accessibility text reading, process memory inspection, or UI automation, then **Antigravity cannot be safely supported** and should be marked "Delayed pending official API."

#### 2.4.4 Recommended Action

**Research required before any decision.** Do not begin implementation planning. Assign a research task to:

1. Determine Antigravity's product architecture and distribution model
2. Locate and review any official extension or plugin documentation
3. Review the Terms of Service for third-party integration permissions
4. Report findings back to this document for a follow-up feasibility assessment

If research reveals an official, documented extension API with clear ToS permission for third-party integrations, re-evaluate the MVP feasibility and risk ratings at that time.

#### 2.4.5 Ratings

| Dimension | Rating | Notes |
|-----------|--------|-------|
| MVP Feasibility | UNKNOWN — Research Required | Cannot assess without architecture and API knowledge |
| Privacy Risk | UNKNOWN | Depends entirely on available integration mechanisms |
| Brittleness Risk | UNKNOWN | Depends on API stability and update cadence |
| Legal / ToS Risk | UNKNOWN | ToS review not yet completed |

---

## 3. Detection Signal Summary

The following table summarizes what detection signal is needed for a viable integration on each platform and whether a safe signal path currently exists.

| Platform | Signal Needed | Safe Signal Path Available | Notes |
|----------|---------------|---------------------------|-------|
| ChatGPT desktop | AI processing state (timing only) | No | No official API; OS focus signal alone is insufficient |
| Claude desktop | AI processing state (timing only) | No | No official API; MCP does not provide UI signals |
| Gemini (desktop) | N/A — no desktop app | N/A | Covered by browser extension |
| Antigravity | AI processing state (timing only) | Unknown | Pending research |

---

## 4. Rendering Surface Summary

If a safe integration were available in the future, the rendering surface for each desktop platform would need to be determined. The constraints are the same across all:

- The sponsored message must be rendered in a clearly labeled surface that does not overlap primary AI content
- The rendering surface must be under PromptProfit's control, not injected into the host app's own UI hierarchy via undocumented APIs
- No auto-play media, no sound, no animation beyond subtle fade-in
- The message must be removed immediately when the wait-state ends

For Electron-based desktop apps with an official extension API (if one becomes available), an injected panel or overlay similar to the browser extension approach may be viable. For a local companion app approach, a separate native window or system tray notification surface would be required.

---

## 5. Summary Risk Matrix

| Platform | Approach | MVP Feasibility | Privacy Risk | Brittleness Risk | Legal Risk | Recommended Action |
|----------|----------|-----------------|--------------|------------------|------------|-------------------|
| ChatGPT desktop (Win/Mac) | None available | NOT FEASIBLE | HIGH | CRITICAL | HIGH | Delay — no official extension API; block implementation |
| Claude desktop (Win/Mac) | None available | NOT FEASIBLE | HIGH | CRITICAL | HIGH | Delay — no official extension API; MCP is not a UI extension mechanism |
| Gemini (no desktop app) | Browser extension (Phase 3) | FEASIBLE via browser | LOW | HIGH (DOM selectors) | MEDIUM | No desktop action needed; covered by Phase 3 browser extension |
| Antigravity AI | Unknown | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Research required — determine architecture, API, and ToS before any decision |

---

## 6. Decision Rules for Future Re-evaluation

A desktop platform should only be moved out of "Delayed" or "Research Required" status when ALL of the following conditions are met:

1. **Official extension API exists** — the platform vendor has publicly documented an extension or plugin mechanism that is intended for third-party developers.
2. **UI signal is available** — the official API exposes a signal that indicates AI processing state at a timing level, without requiring content access.
3. **Terms of Service permit it** — the platform's ToS explicitly allows third-party extensions of the kind PromptProfit would build, or legal review confirms the integration is permissible.
4. **No forbidden signals required** — the integration can be built without screen scraping, OCR, clipboard monitoring, accessibility text reading, process memory inspection, or UI automation.
5. **Rendering surface is available** — there is a documented, stable surface for rendering a small, labeled overlay without injecting into the host app's native UI via undocumented APIs.

If any one of these conditions cannot be met, the platform remains blocked.

---

## 7. Relation to CROSS_PLATFORM_STRATEGY.md

This document is a Phase 4 research artifact that expands on the placeholder entries in `CROSS_PLATFORM_STRATEGY.md` sections 2 (rows 6–8), 4.3, 10, 11, and 14 for desktop platforms. It does not modify or supersede that document. When a desktop platform is cleared for implementation, both documents should be updated concurrently.

The rollout phases from `CROSS_PLATFORM_STRATEGY.md` remain in effect:

```
Phase F:  Desktop platform research complete → decision point  (this document is Phase F output)
Phase G:  Desktop adapter (only if safe approach found)        (blocked until Phase F clears a platform)
Phase H:  Antigravity and other adapters                       (blocked until research completes)
```

As of the date of this document, **Phase G and Phase H remain blocked.**

---

*Last updated: 2026-06-29. Review when any of the following occur: OpenAI or Anthropic announces a desktop extension API; Antigravity research is completed; Google ships a standalone Gemini desktop app; ToS for any listed platform changes materially.*
