# Desktop / Terminal / CLI Integration Architecture

**Phase:** Complete Multi-Platform Support Before Pilot Execution
**Date:** 2026-07-03

> **A browser extension cannot support terminal or desktop apps.**
> `apps/browser-extension` runs MV3 content scripts inside a Chromium
> DOM context — it has zero visibility into any process outside the
> browser. Every platform below requires a genuinely separate
> integration surface (CANARY 6, CANARY 7). This document designs those
> surfaces without building the risky parts.

---

## Non-negotiable constraints (apply to every platform below)

**Forbidden, for every platform in this document, with no exceptions:**
screen scraping, OCR, clipboard monitoring, shell history reading,
terminal buffer reading, keylogging, process memory inspection, reading
command text, reading AI output text.

**Allowed, for every platform in this document:** explicit lifecycle
hooks (an event fires, its *payload* is never read for content), wrapper
state the user's own command explicitly opts into per-invocation,
synthetic/fixture events, local daemon state that only a user-approved
process writes to.

---

## 1. Claude Code terminal

- **Feasible integration method:** An explicit, user-invoked CLI wrapper
  (e.g. `promptprofit-wrap claude "your command"` or a shell function the
  user opts into) that starts a timer when it launches the wrapped
  process and stops it when the wrapped process exits — using only the
  **process lifecycle** (start/exit, exit code, wall-clock duration),
  never stdin/stdout/stderr *content*. The wrapper can render a
  sponsored-moment prompt in its own separate terminal UI region (or a
  companion small window) bounded strictly to before/after the wrapped
  process's own I/O, never interleaved with or reading it.
- **Unsafe methods to reject:** Piping/tee-ing the wrapped process's
  stdout/stderr for inspection (this IS reading AI output text — Claude
  Code's terminal output typically contains the AI's response); any shell
  hook that captures command history; any use of `script`/pty-capture
  libraries to record session content.
- **Allowed lifecycle signals:** process start timestamp, process exit
  timestamp, exit code, wall-clock duration, explicit user keystroke to
  request a sponsored moment (e.g. a wrapper flag), nothing else.
- **Forbidden data:** command text/arguments (may contain prompts or file
  paths), stdout, stderr, exit output content, environment variables,
  working directory contents.
- **Possible UX surface:** A short-lived, clearly-labeled line printed by
  the wrapper itself before handing off to the real `claude` process, or
  a small separate terminal pane/notification — never overlaid on or
  mixed into the wrapped process's own output stream.
- **Monetization event model:** Identical schema to the browser adapters
  (`impression_requested`, `impression_rendered`, `viewability_threshold_met`)
  but `adapterId` would need a new allowlisted value (e.g.
  `dev_terminal_wrapper` — `DEV_ADAPTER_IDS` group in
  `packages/shared/src/schemas/adapters.ts` already exists as a category
  for this). Viewability for a terminal has no IntersectionObserver
  equivalent — "viewable" would mean "wrapper's own banner line was
  printed and the configured minimum wait elapsed," a much weaker signal
  than the browser's real visibility check; this must be labeled as
  such, not conflated with browser-grade viewability.
- **Kill-switch model:** Identical two-layer model — the wrapper polls
  `/v1/flags` on startup (like the browser's `syncFlagsFromBackend`) and
  refuses to render if kill-switched or unreachable (fail closed).
- **Local configuration model:** A local config file (e.g.
  `~/.promptprofit/config.json`) the user edits explicitly to opt in;
  never auto-installed, never silently enabled.
- **Test strategy:** Fixture-only prototype (built this sprint, see
  `TERMINAL_PROTOTYPE_VERIFICATION.md`) proves the lifecycle-signal
  pattern with zero real command/output access. A real implementation
  would need integration tests spawning a fake child process and
  asserting the wrapper only observes start/exit, never stdout content.
- **Privacy review:** Sound in design (lifecycle-only), but the real
  implementation does not exist — this is a design review of a
  not-yet-built system, not a review of shipped code.
- **Implementation complexity:** Medium — a real wrapper needs to
  correctly proxy stdin/stdout/stderr *transparently* (so the wrapped
  `claude` command still works exactly as if unwrapped) while observing
  only lifecycle, across at least bash/zsh/PowerShell. Getting terminal
  passthrough exactly right (colors, interactive prompts, signals like
  Ctrl+C) without touching content is a real engineering task.
- **Support label:** `requires separate integration` (real product);
  `fixture-only` (the prototype built this sprint proves the pattern).

## 2. Claude Code desktop

- **Feasible integration method:** Only if Claude Code desktop exposes a
  first-party extension/plugin API with its own lifecycle events (like
  VS Code's `onDidChangeTextDocument`-style hooks). No such API is known
  to this repo's research. Without one, there is no safe integration
  method — CANARY 6 and the non-negotiable rules jointly rule out every
  alternative (screen-scraping/OCR would read the AI's response
  directly).
- **Unsafe methods to reject:** Screen capture + OCR of the desktop
  window (explicitly forbidden), window-title polling if the title
  itself might contain conversation content (would need per-app
  verification before even attempting), accessibility-API tree reading
  if it exposes text content (same content-reading problem as OCR, just
  via a different API).
- **Allowed lifecycle signals:** Window focus/blur events and window
  open/close events *if and only if* the desktop OS's windowing API
  exposes these without exposing window content — this needs
  platform-specific research (Windows: `SetWinEventHook` window
  state only, not content; macOS: `NSWorkspace` notifications) before any
  claim of safety.
- **Forbidden data:** Any window content, any accessibility-tree text,
  any screenshot/OCR output.
- **Possible UX surface:** None until a safe lifecycle signal is
  confirmed to exist.
- **Monetization event model:** N/A — no safe detection method exists yet.
- **Kill-switch model:** Would be identical two-layer model if built.
- **Local configuration model:** Would be identical opt-in config file if built.
- **Test strategy:** N/A — nothing to test until a safe integration point
  is found.
- **Privacy review:** Fails today — no safe integration path is known,
  so no implementation should be attempted (CANARY 12: label `requires
  separate integration` rather than fake support).
- **Implementation complexity:** Unknown/high — blocked entirely on
  whether Claude Code desktop exposes any extension API at all.
- **Support label:** `requires separate integration`.

## 3. Codex terminal/CLI

- **Feasible integration method:** Same wrapper-process-lifecycle model
  as Claude Code terminal (§1) — this is a general terminal-AI-tool
  pattern, not Claude-Code-specific. The same fixture-only prototype
  built this sprint is intentionally tool-agnostic and covers this case
  without modification.
- **Unsafe methods to reject:** Same list as §1.
- **Allowed lifecycle signals:** Same as §1.
- **Forbidden data:** Same as §1.
- **Possible UX surface:** Same as §1.
- **Monetization event model:** Same as §1.
- **Kill-switch model:** Same as §1.
- **Local configuration model:** Same as §1.
- **Test strategy:** Same fixture-only prototype as §1.
- **Privacy review:** Same as §1 — design is sound, no real
  implementation exists.
- **Implementation complexity:** Same as §1 (medium, once one real
  wrapper is built, extending it to wrap any CLI AI tool including Codex
  is mostly configuration, not new architecture).
- **Support label:** `requires separate integration` (real product);
  `fixture-only` (the prototype covers this case generically).

## 4. Codex IDE/editor integration

- **Feasible integration method:** If Codex ships as a VS Code extension
  or similar IDE plugin, the same lifecycle-event pattern used by
  `apps/extension`'s `AiStatusBarAdapter` (§5 below) would apply
  directly — no new architecture needed, just confirming Codex's actual
  IDE surface (unresearched).
- **Unsafe methods to reject:** Reading Codex's own extension output
  channel/webview content (would be reading AI response text).
  **Unresearched item, flagged explicitly rather than assumed:** whether
  the same `apps/extension` package could add a second adapter for Codex
  without new packaging, or Codex requires its own separate extension —
  not determined this sprint.
- **Allowed lifecycle signals:** Same idle-timer-style heuristic as
  `AiStatusBarAdapter`, if Codex's IDE integration has no first-party
  wait-state event.
- **Forbidden data:** Same list as §5 (VS Code integrated terminal).
- **Possible UX surface:** Status bar or equivalent IDE chrome.
- **Monetization event model:** Would reuse the `vscode_*`-category
  adapter ID group if the IDE is VS Code-based (`VSCODE_ADAPTER_IDS`).
- **Kill-switch model:** Same two-layer model.
- **Local configuration model:** Same explicit-opt-in config pattern.
- **Test strategy:** Would reuse `apps/extension`'s existing unit-test
  patterns once a concrete integration exists.
- **Privacy review:** Cannot be completed without first confirming what
  "Codex IDE/editor integration" concretely refers to.
- **Implementation complexity:** Unknown — depends on unresearched
  product surface.
- **Support label:** `requires separate integration`.

## 5. VS Code integrated terminal

- **Feasible integration method:** Already covered by
  `AiStatusBarAdapter`'s existing `vscode.window.onDidChangeActiveTerminal`
  subscription (see `VSCODE_EXTENSION_VERIFICATION.md`) — this fires on
  terminal *focus changes*, never terminal *content*. No new integration
  is needed for the lifecycle signal that already exists; what's missing
  is e2e/live verification (tracked in `VSCODE_EXTENSION_VERIFICATION.md`
  §6, not a new architecture problem).
- **Unsafe methods to reject:** `vscode.window.onDidWriteTerminalData`
  (a real VS Code API) is explicitly rejected — it exposes the terminal's
  actual written data/content, which is exactly the forbidden
  "terminal output text" category.
- **Allowed lifecycle signals:** `onDidChangeActiveTerminal` (fires on
  focus change only), `onDidOpenTerminal`/`onDidCloseTerminal` (existence
  lifecycle only) — all already content-free by VS Code API design.
- **Forbidden data:** Any use of `onDidWriteTerminalData` or a terminal's
  `.processId`-based external inspection.
- **Possible UX surface:** VS Code status bar (already implemented).
- **Monetization event model:** Already implemented (§5 in
  `VSCODE_EXTENSION_VERIFICATION.md`).
- **Kill-switch model:** Already implemented.
- **Local configuration model:** Already implemented
  (`promptprofit.enabled`, `promptprofit.adapter` settings).
- **Test strategy:** Already has 34 unit tests; missing an e2e harness
  (tracked, not re-tracked here).
- **Privacy review:** Already passed at the unit level (26 privacy
  tests).
- **Implementation complexity:** Low — this is the one row in this
  document that is not "requires separate integration," because
  `apps/extension` already IS that separate integration and already
  covers this exact case.
- **Support label:** `beta` (same as VS Code extension overall — see
  `VSCODE_EXTENSION_VERIFICATION.md`).

---

## Summary table

| Platform | Feasible now? | Support label |
|----------|----------------|----------------|
| Claude Code terminal | Design only; fixture-only prototype built | `requires separate integration` / `fixture-only` |
| Claude Code desktop | No safe method known | `requires separate integration` |
| Codex terminal/CLI | Design only; same fixture-only prototype | `requires separate integration` / `fixture-only` |
| Codex IDE/editor | Unresearched product surface | `requires separate integration` |
| VS Code integrated terminal | Already implemented via existing lifecycle hooks | `beta` |

---

**Privacy warning: Do not add real terminal/command/output content, real
user data, real API keys, or real payment credentials to this document.**
