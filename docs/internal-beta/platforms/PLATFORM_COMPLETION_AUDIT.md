# PromptProfit — Platform Completion Audit

**Mission:** Complete Multi-Platform Support Before Pilot Execution
**Date:** 2026-07-03
**Branch:** `claude/windows-release-pipeline-fix-xfj0sw`

> This audit supersedes the platform-by-platform status snapshot in
> `PLATFORM_SUPPORT_AUDIT.md` (written before this sprint's Claude/Gemini
> wiring) for the 9 platforms in scope. `PLATFORM_SUPPORT_MATRIX.md` remains
> the single machine-checked summary table; this document is the detailed
> per-platform evidence backing it.

---

## 1. ChatGPT browser

- **Current files:** `apps/browser-extension/src/adapters/chatgpt/{chatgpt.adapter,chatgpt.renderer,chatgpt.selectors,chatgpt.wait-state}.ts`, wired live in `src/content/chatgpt.ts`.
- **Implementation status:** Full pipeline — wait-state detection, ad decision, render, viewability, event telemetry, kill-switch, internal-beta DRYRUN-001 demo fallback.
- **Browser extension can support it:** Yes — this is the reference implementation.
- **Separate integration required:** No.
- **Privacy risk:** Low — structural DOM signals only, dedicated privacy test suite, real-session confirmed no forbidden data sent.
- **Tests present:** 27 unit tests (`chatgpt.adapter.test.ts`) + 15 privacy tests (`chatgpt.privacy.test.ts`) + 27 e2e smoke tests across 4 spec files (`chatgpt-adapter`, `dryrun-diagnostics`, `dryrun-selftest`, `privacy`).
- **Tests missing:** None for current scope.
- **Live/manual verification needed:** Already done — `docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md`.
- **Exact blocker:** None.
- **Fastest safe completion path:** N/A — maintain.
- **Support label:** `verified`.

## 2. Claude browser

- **Current files:** `apps/browser-extension/src/adapters/claude/{claude.adapter,claude.renderer,claude.selectors,claude.wait-state}.ts`, now wired live in `src/content/claude.ts` (this sprint — previously isolated/unwired).
- **Implementation status:** Full pipeline mirroring ChatGPT's, minus the ChatGPT-only DRYRUN-001 demo fallback (out of scope for Claude — that mechanism exists solely for the ChatGPT revenue pilot).
- **Browser extension can support it:** Yes.
- **Separate integration required:** No.
- **Privacy risk:** Low — same structural-signal-only design as ChatGPT; selectors read only element presence, never text. Underlying `CLAUDE_PROCESSING_SELECTORS` selector is still an **unverified guess** carried over from the generic `wait-state-detector.ts` map — this affects detection reliability, not privacy.
- **Tests present:** 25 unit tests (`claude.adapter.test.ts`) + 15 privacy tests (`claude.privacy.test.ts`) + 7 e2e smoke tests (`claude-adapter.smoke.spec.ts`, new this sprint), including an embedded ad-decision/event forbidden-fields check.
- **Tests missing:** A human-operated live-session confirmation against real claude.ai.
- **Live/manual verification needed:** Yes — see `CLAUDE_BROWSER_VERIFICATION.md`.
- **Exact blocker:** No real-session evidence log exists yet (CANARY 8 forbids automating one).
- **Fastest safe completion path:** A human tester follows the manual checklist in `CLAUDE_BROWSER_VERIFICATION.md` and records the result the same way DRYRUN-001 did.
- **Support label:** `beta` (fixture-tested + privacy-reviewed + pipeline wired; not yet confirmed on the real live platform per `PLATFORM_ADAPTER_CONTRACT.md` §12).

## 3. Gemini browser

- **Current files:** `apps/browser-extension/src/adapters/gemini/{gemini.adapter,gemini.renderer,gemini.selectors,gemini.wait-state}.ts` (new this sprint), wired live in `src/content/gemini.ts`.
- **Implementation status:** Same as Claude — full pipeline mirroring ChatGPT's proven structure, built fresh this sprint using Claude's now-proven pattern as the template.
- **Browser extension can support it:** Yes.
- **Separate integration required:** No.
- **Privacy risk:** Low — same structural-signal-only design. `GEMINI_PROCESSING_SELECTORS` is an unverified guess.
- **Tests present:** 25 unit tests (`gemini.adapter.test.ts`) + 15 privacy tests (`gemini.privacy.test.ts`) + 7 e2e smoke tests (`gemini-adapter.smoke.spec.ts`).
- **Tests missing:** A human-operated live-session confirmation against real gemini.google.com.
- **Live/manual verification needed:** Yes — see `GEMINI_BROWSER_VERIFICATION.md`.
- **Exact blocker:** No real-session evidence log exists yet.
- **Fastest safe completion path:** Same as Claude — human tester runs the manual checklist and records the result.
- **Support label:** `beta` (fixture-tested + privacy-reviewed + pipeline wired; not yet confirmed on the real live platform).

## 4. VS Code extension

- **Current files:** `apps/extension/src/{extension,controller,status-bar,event-queue,device-id,api-client}.ts`, `src/adapters/{ai-status-bar.adapter,mock.adapter}.ts`.
- **Implementation status:** Real, functioning MVP — idle-timer-based wait-state heuristic (`AiStatusBarAdapter`, 3s idle threshold, 60s max wait-state), real ad-decision API call, real event queue, status-bar rendering, explicit consent dialog, kill-switch flag caching. This is NOT a stub.
- **Browser extension can support it:** No — VS Code is a native desktop application; this is a separate `vscode` extension package (`apps/extension`), not the browser-extension app. Confirms CANARY 6 (browser extension code cannot be assumed to cover this).
- **Separate integration required:** Already exists as one (a native VS Code extension), so no *further* separate integration is required.
- **Privacy risk:** Low by design — the wait-state heuristic (`onDidChangeTextDocument`/`onDidChangeTextEditorSelection`/`onDidChangeActiveTerminal`) only observes that *an* event fired, never the document/selection/terminal content itself.
- **Tests present:** 34 unit tests (8 event-queue, 26 privacy).
- **Tests missing:** No e2e test harness for the VS Code extension host exists (unlike the browser extension's Playwright rig); no DRYRUN-001-equivalent live session record.
- **Live/manual verification needed:** Yes — a live session inside a real VS Code window, confirming the status bar renders and the idle-timer heuristic fires correctly during a real Copilot/AI-assistant wait.
- **Exact blocker:** No live-session evidence log; no automated e2e harness for the extension host (would require `@vscode/test-electron`, not currently a dependency).
- **Fastest safe completion path:** Add a minimal `@vscode/test-electron` smoke test (out of scope this sprint — see `VSCODE_EXTENSION_VERIFICATION.md` for the exact plan), then a human-operated live session.
- **Support label:** `beta` (implemented, unit-tested, not live-verified) — unchanged from the prior matrix entry; this sprint only added a dedicated verification doc, no code changes to `apps/extension`.

## 5. Codex browser

- **Current files:** None.
- **Implementation status:** No adapter, no hostname reservation, no mention in `packages/shared/src/schemas/adapters.ts`'s `ALLOWED_ADAPTER_IDS`.
- **Browser extension can support it:** Architecturally yes (same MV3 content-script pattern), if Codex ships a stable web UI with a discoverable hostname and structural wait-state signal — unresearched.
- **Separate integration required:** Unknown — depends on whether "Codex browser" refers to a hosted web UI (browser-extension-shaped) or is conflated with Codex CLI (terminal-shaped, see below).
- **Privacy risk:** N/A — no code exists.
- **Tests present:** None.
- **Tests missing:** Everything.
- **Live/manual verification needed:** N/A until code exists.
- **Exact blocker:** No research has been done on what "Codex browser" concretely is (product surface, hostname, DOM structure). Building a selector-guess adapter without this research would repeat Claude/Gemini's original "guessed from a generic map" gap, but with even less basis (Claude/Gemini's guesses came from selectors already present in this repo's history; Codex has none).
- **Fastest safe completion path:** Research first (see `CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md`) before writing any adapter code.
- **Support label:** `not supported`.

## 6. Codex desktop/CLI

- **Current files:** None.
- **Implementation status:** None.
- **Browser extension can support it:** No — CLI/desktop tools have no DOM or browser extension API surface.
- **Separate integration required:** Yes, if pursued — must follow the terminal/desktop integration model in `DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md` (explicit CLI wrapper or lifecycle-hook daemon, never terminal-buffer scraping).
- **Privacy risk:** High if built naively (terminal content is exactly the kind of data this product's non-negotiable rules forbid reading). Zero risk currently since nothing is built.
- **Tests present:** None.
- **Tests missing:** Everything.
- **Live/manual verification needed:** N/A.
- **Exact blocker:** No research done; no confirmed safe hook point into Codex CLI's process lifecycle exists in this repo's research.
- **Fastest safe completion path:** Research only this sprint — see `CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md`.
- **Support label:** `requires separate integration`.

## 7. Claude Code desktop

- **Current files:** `antigravity` is reserved as a placeholder adapter ID in `packages/shared/src/schemas/adapters.ts`'s `DESKTOP_ADAPTER_IDS`, but no code implements it and it is not confirmed to correspond to Claude Code desktop specifically.
- **Implementation status:** None beyond an ID reservation.
- **Browser extension can support it:** No — no DOM, no extension API. Confirms CANARY 6.
- **Separate integration required:** Yes.
- **Privacy risk:** High if built naively (screen-scraping/OCR of a desktop app would read AI response text, explicitly forbidden). No risk currently — nothing built.
- **Tests present:** None.
- **Tests missing:** Everything.
- **Live/manual verification needed:** N/A.
- **Exact blocker:** No safe integration point is known. A desktop app without a public extension/plugin API cannot be safely instrumented without screen-scraping or OCR, both explicitly forbidden by this mission's non-negotiable privacy rules.
- **Fastest safe completion path:** Research only — see `CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md` and `DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md`.
- **Support label:** `requires separate integration`.

## 8. Claude Code terminal

- **Current files:** None in the shipped product. This sprint adds a **fixture-only prototype** (`scripts/terminal-fixture-runner.js` + tests) that proves the safe architecture pattern in isolation — it does not integrate with a real Claude Code terminal session.
- **Implementation status:** Architecture designed and a synthetic fixture-only prototype built (this sprint). No real integration.
- **Browser extension can support it:** No — a terminal has no DOM. Confirms CANARY 6 and CANARY 7 (terminal support must be a separate integration path).
- **Separate integration required:** Yes — see `DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md` for the safe model (explicit CLI wrapper emitting only lifecycle booleans, never reading command or output text).
- **Privacy risk:** High if built naively; the fixture-only prototype built this sprint reads/transmits nothing but synthetic, hardcoded test data — zero real risk.
- **Tests present:** Privacy tests + kill-switch tests for the fixture-only prototype (see `TERMINAL_PROTOTYPE_VERIFICATION.md`).
- **Tests missing:** Any real integration with an actual terminal session.
- **Live/manual verification needed:** N/A — not live-integrated.
- **Exact blocker:** No safe, general way to detect "Claude Code is thinking" in a real terminal without reading terminal buffer text has been implemented; only an explicit, user-invoked wrapper command pattern is safe, and that requires a real CLI wrapper package (out of scope this sprint — prototype only).
- **Fastest safe completion path:** See `CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md` for the path from fixture-only to a real opt-in CLI wrapper.
- **Support label:** `fixture-only` (prototype), `requires separate integration` (real product).

## 9. Generic terminal AI tools

- **Current files:** Same fixture-only prototype as above — the prototype is intentionally tool-agnostic (it never inspects which AI tool is running).
- **Implementation status:** Same as Claude Code terminal — architecture + fixture-only prototype only.
- **Browser extension can support it:** No.
- **Separate integration required:** Yes — identical model to Claude Code terminal, generalized.
- **Privacy risk:** Same as above — the fixture-only prototype is zero-risk.
- **Tests present:** Same fixture-only prototype tests.
- **Tests missing:** Any real integration.
- **Live/manual verification needed:** N/A.
- **Exact blocker:** Same as Claude Code terminal — no real CLI wrapper package exists yet.
- **Fastest safe completion path:** Same as Claude Code terminal.
- **Support label:** `fixture-only` (prototype), `experimental` (as a product concept).

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
